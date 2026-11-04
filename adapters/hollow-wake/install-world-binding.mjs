import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

/** Publish one new binding and a guarded World replacement in a disposable
 * checkout. If replacement fails, the previous World file stays intact and
 * the newly reserved binding is removed so the caller can retry. */
export function installWorldBinding(gameRoot, world, expected, replacement, target, binding) {
  const relative=path.relative(fs.realpathSync(gameRoot),fs.realpathSync(world));
  assert(relative&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative),'World source escapes the selected game');
  assert(fs.lstatSync(world).isFile(),'World must be a regular file');
  assert.equal(fs.realpathSync(path.dirname(world)),fs.realpathSync(path.dirname(target)),'Binding must share the World source directory');
  const bytes=Buffer.from(binding);
  const staging = fs.mkdtempSync(path.join(path.dirname(world), '.engine-binding-'));
  const candidate = path.join(staging, 'world.ts');
  let reserved, written = 0;
  try {
    fs.writeFileSync(candidate, replacement, {flag: 'wx', mode: fs.statSync(world).mode});
    assert(fs.readFileSync(world, 'utf8') === expected, 'World changed before installation');
    const fd = fs.openSync(target, 'wx');
    try {
      reserved = fs.fstatSync(fd,{bigint:true});
      while (written < bytes.length) {
        const count = fs.writeSync(fd, bytes, written, bytes.length - written);
        assert(count > 0, 'Binding write made no progress');
        written += count;
      }
    } finally {fs.closeSync(fd);}
    assert(fs.readFileSync(world, 'utf8') === expected, 'World changed during installation');
    fs.renameSync(candidate, world);
    reserved = undefined;
  } finally {
    if (reserved) {
      const current=fs.lstatSync(target,{bigint:true,throwIfNoEntry:false});
      if(current?.dev===reserved.dev&&current.ino===reserved.ino) {
        const remaining=fs.readFileSync(target);
        if(bytes.subarray(0,written).equals(remaining))fs.unlinkSync(target);
      }
    }
    fs.rmSync(candidate, {force: true});
    fs.rmdirSync(staging);
  }
}
