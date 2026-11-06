import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {git, listFiles, root, sha256, writeJSON} from './reference-utils.mjs';

// Run in the pinned Valve SDK. Package once, then use the same installed ZIP
// for both exported games. The Platform runner gets only these sealed exports.
const [baseFlag, base, libraryFlag, library, toolsFlag, toolsFile, outFlag, destination, ...rest] = process.argv.slice(2);
assert.deepEqual([baseFlag, libraryFlag, toolsFlag, outFlag, rest.length], ['--base','--library-proof','--tools','--out',0]);
assert.equal(process.platform, 'linux');
assert.equal(process.arch, 'x64');
const read = file => JSON.parse(fs.readFileSync(file));
const hash = file => sha256(fs.readFileSync(file));
const lock = read(path.join(root, 'experiments/steamrt-godot/toolchain-lock.json'));
const release = Object.fromEntries(fs.readFileSync('/usr/lib/os-release','utf8').trim().split('\n').map(line => {
  const index = line.indexOf('=');
  return [line.slice(0,index), line.slice(index+1).replace(/^"|"$/g,'')];
}));
assert.equal(release.ID,'steamrt');
assert.equal(release.BUILD_ID, lock.images.sdk.buildId);
assert.equal(release.VARIANT_ID, lock.images.sdk.variant);
const out = path.resolve(destination);
fs.mkdirSync(out);
const logs = path.join(out,'checks');
fs.mkdirSync(logs);
const steps = [];

function run(script, args) {
  const log = path.join(logs, String(steps.length+1)+'-'+script+'.txt');
  const fd = fs.openSync(log,'wx');
  console.log('Running '+script);
  try {
    execFileSync(process.execPath, [path.join(root,'scripts',script+'.mjs'), ...args], {
      cwd:root, stdio:['ignore',fd,fd], timeout:600000
    });
  } catch (error) {
    console.error(fs.readFileSync(log,'utf8').slice(-2000));
    throw error;
  } finally {
    fs.closeSync(fd);
  }
  steps.push({script, log:path.relative(out,log), sha256:hash(log)});
}

function latest(name) {
  const {receipt} = read(path.join(root,'.artifacts',name+'-latest.json'));
  const data = read(receipt);
  assert(data.passed, name);
  return {receipt,data};
}

run('build-godot-progression', ['--base',base,'--library-proof',library,'--tools',toolsFile]);
const standalone = latest('godot-progression-addon');
run('test-progression-session-faults', ['--package',standalone.receipt]);
run('test-godot-progression', ['--package',standalone.receipt,'--tools',toolsFile]);
run('build-godot-crafting', ['--progression',standalone.receipt,'--tools',toolsFile]);
const combined = latest('godot-crafting-addon');
const replayArgs = ['--package',combined.receipt,'--tools',toolsFile];
run('test-godot-crafting', replayArgs);
run('test-godot-progression', replayArgs);
run('test-godot-crafting-faults', replayArgs);
run('record-godot-crafting', ['--out',path.join(out,'desktop')]);

const desktop = read(path.join(out,'desktop/linux.json'));
assert.equal(desktop.package.archiveSha256, combined.data.archiveSha256);
const archive = path.basename(combined.data.archive);
fs.copyFileSync(combined.data.archive, path.join(out,archive), fs.constants.COPYFILE_EXCL);
assert.equal(hash(path.join(out,archive)), combined.data.archiveSha256);
const exports = {};
for (const [name, pointer] of [['crafting','godot-crafting-replay'],['progression','godot-combined-progression-replay']]) {
  const {data, receipt} = latest(pointer);
  assert.equal(data.archiveSha256, combined.data.archiveSha256);
  assert.equal(data.packageReceiptSha256, hash(combined.receipt));
  assert(data.releaseWithoutProject && data.release.passed && data.editor.passed);
  const sealed = path.join(out,name);
  fs.cpSync(path.join(data.directory,'relocated'), sealed, {recursive:true,errorOnExist:true,force:false});
  const inventory = Object.fromEntries(listFiles(sealed).map(file => [file,hash(path.join(sealed,file))]));
  assert.deepEqual(inventory, data.exportedFiles);
  for (const [file,digest] of Object.entries(desktop.package.libraries)) {
    assert.equal(inventory[path.basename(file)],digest);
  }
  exports[name] = {files:inventory, sdkRelease:data.release, editor:data.editor, replayReceiptSha256:hash(receipt)};
}
const sdk = {schemaVersion:1, passed:true, sourceCommit:git(root,['rev-parse','HEAD']).trim(), buildId:release.BUILD_ID,
  archive, archiveSha256:combined.data.archiveSha256, desktopProofSha256:hash(path.join(out,'desktop/linux.json')),
  toolchainLockSha256:hash(path.join(root,'experiments/steamrt-godot/toolchain-lock.json')), exports, steps};
writeJSON(path.join(out,'sdk.json'),sdk);
console.log({archive,sha256:sdk.archiveSha256,exports:Object.keys(exports)});
