import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,writeJSON} from './reference-utils.mjs';
import {npmCli} from './npm-cli.mjs';

export function packSupportFit(scratch,gate,version,run,env){
  const dir=path.join(scratch,'support-fit-package');fs.mkdirSync(dir);
  writeJSON(path.join(dir,'package.json'),{name:'@hollow-wake/workshop-support-fit',version,type:'module',license:'PolyForm-Noncommercial-1.0.0',
    exports:{'.':{types:'./fit.d.ts',import:'./fit.mjs'},'./index.json':'./index.json','./pages.txt':'./pages.txt'}});
  fs.writeFileSync(path.join(dir,'fit.mjs'),gate.core);
  fs.writeFileSync(path.join(dir,'index.json'),JSON.stringify(gate.index)+'\n');
  fs.writeFileSync(path.join(dir,'pages.txt'),gate.data);
  for(const name of ['LICENSE.md','NOTICE.md'])fs.copyFileSync(path.join(root,name),path.join(dir,name));
  fs.copyFileSync(path.join(root,'adapters/embedded/support-fit.d.ts'),path.join(dir,'fit.d.ts'));
  fs.copyFileSync(path.join(root,'adapters/embedded/support-fit-guide.md'),path.join(dir,'README.md'));
  const [packed]=JSON.parse(run(process.execPath,[npmCli(),'pack','--ignore-scripts','--json','--offline','--pack-destination',scratch],env,dir));
  const archive=path.join(scratch,packed.filename);
  const consumer=path.join(scratch,'support-reader');
  fs.mkdirSync(consumer);writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
  run(process.execPath,[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund'],env,consumer);
  fs.copyFileSync(path.join(root,'scripts/test-installed-workshop-supports.mjs'),path.join(consumer,'verify.mjs'));
  const checked=JSON.parse(run(process.execPath,['verify.mjs',path.join(root,'evidence/workshop-supports/native-cases.json')],env,consumer));
  assert(checked.queries>0&&checked.reads>0);
  return archive;
}
