import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const directory=path.dirname(fileURLToPath(import.meta.url));
const sha256=value=>createHash('sha256').update(value).digest('hex');

/** Prepare an explicitly requested candidate in a fresh private directory.
 * The original runtime source, source lock and published packages stay intact.
 * Refuse source drift and already-patched input rather than guessing a merge. */
export function prepareCStringCleanup(upstream,destination) {
  const source=fs.realpathSync(upstream),requested=path.resolve(destination);
  const target=path.join(fs.realpathSync(path.dirname(requested)),path.basename(requested));
  const relative=path.relative(source,target);
  assert(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative),
    'The private candidate must be outside the original upstream directory');
  assert(!fs.existsSync(target),'Candidate directory must be fresh');
  const lockBytes=fs.readFileSync(path.join(directory,'../host-source-lock.json'));
  const manifestBytes=fs.readFileSync(path.join(directory,'cstring-cleanup.json'));
  const lock=JSON.parse(lockBytes),patch=JSON.parse(manifestBytes);
  assert.equal(patch.schemaVersion,1);assert.equal(lock.runtime,patch.runtime);
  assert.equal(lock.version,patch.version);assert.equal(patch.file,'quickjs-amalgam.c');
  assert.deepEqual(Object.keys(lock.files).sort(),['quickjs-amalgam.c','quickjs.h']);
  assert.equal(lock.files[patch.file],patch.originalSha256);
  const files={};
  for(const[file,digest]of Object.entries(lock.files)){
    const bytes=fs.readFileSync(path.join(source,file));
    assert.equal(sha256(bytes),digest,'Pinned upstream differs: '+file);files[file]=bytes;
  }
  const text=files[patch.file].toString('utf8'),newline=text.includes('\r\n')?'\r\n':'\n';
  const start=text.lastIndexOf('const char *JS_ToCStringLen2('),end=text.indexOf('static void copy_str16',start);
  assert(start>0&&end>start,'Missing pinned conversion function');
  const body=text.slice(start,end),needle='fail:'+newline+'    if (plen)';
  assert.equal(body.split(needle).length,2,'Cleanup anchor must be unique');
  const changed=body.replace(needle,'fail:'+newline+'    JS_FreeValue(ctx, val);'+newline+'    if (plen)');
  files[patch.file]=Buffer.from(text.slice(0,start)+changed+text.slice(end),'utf8');
  assert.equal(sha256(files[patch.file]),patch.patchedSha256,'Patched bytes differ from the accepted candidate');
  // No output exists until both pinned inputs and the complete result pass.
  fs.mkdirSync(target);
  for(const[file,bytes]of Object.entries(files))fs.writeFileSync(path.join(target,file),bytes,{flag:'wx'});
  return {id:patch.id,directory:target,sourceLockSha256:sha256(lockBytes),manifestSha256:sha256(manifestBytes),
    original:lock.files,files:Object.fromEntries(Object.entries(files).map(([file,bytes])=>[file,sha256(bytes)]))};
}
