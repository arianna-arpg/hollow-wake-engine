import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,listFiles,sha256} from './reference-utils.mjs';

/** Run deliberate faults against a private source and package copy. The
 * pinned game tooling is shared read-only with the installed control. */
export function prepareVocationFaultGame(location,prefix) {
  const source=fs.realpathSync(location.game),sdk=fs.realpathSync(path.join(source,'node_modules/@hollow-wake/engine'));
  assert.notEqual(source,fs.realpathSync(path.join(root,'.reference')));
  fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
  const directory=fs.mkdtempSync(path.join(root,'.artifacts',prefix)),game=path.join(directory,'game');
  const modules=path.join(game,'node_modules'),scope=path.join(modules,'@hollow-wake'),copy=path.join(scope,'engine');
  fs.cpSync(path.join(source,'src'),path.join(game,'src'),{recursive:true});
  fs.mkdirSync(scope,{recursive:true});fs.cpSync(sdk,copy,{recursive:true});
  fs.copyFileSync(path.join(source,'package.json'),path.join(game,'package.json'));
  for(const entry of fs.readdirSync(path.join(source,'node_modules'))){
    if(entry.startsWith('.')||entry==='@hollow-wake')continue;
    const target=path.join(source,'node_modules',entry);
    if(fs.statSync(target).isDirectory())fs.symlinkSync(fs.realpathSync(target),path.join(modules,entry),process.platform==='win32'?'junction':'dir');
  }
  function verifyUnchanged(){
    for(const [a,b]of [[path.join(game,'src'),path.join(source,'src')],[copy,sdk]]){
      const files=listFiles(a);assert.deepEqual(files,listFiles(b));
      for(const file of files)assert.equal(sha256(fs.readFileSync(path.join(a,file))),sha256(fs.readFileSync(path.join(b,file))),file);
    }
  }
  return {directory,game,copy,verifyUnchanged};
}
