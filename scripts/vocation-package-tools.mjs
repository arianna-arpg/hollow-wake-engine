import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {root,writeJSON} from './reference-utils.mjs';
import {buildCatalogue} from './catalogue-tools.mjs';
import {npmCli} from './npm-cli.mjs';

export function installVocationPackages(prefix) {
  fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
  const directory=fs.mkdtempSync(path.join(root,'.artifacts',prefix));
  const catalogue=path.join(directory,'catalogue');
  buildCatalogue(catalogue);
  const npm=(cwd,args)=>execFileSync(process.execPath,[npmCli(),...args,'--cache',path.join(root,'.artifacts/npm-cache')],{cwd,encoding:'utf8',windowsHide:true});
  const pack=cwd=>JSON.parse(npm(cwd,['pack','--json','--ignore-scripts','--pack-destination',directory]))[0];
  const sdk=pack(root),content=pack(catalogue),consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-vocations-'));
  writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
  npm(consumer,['install',path.join(directory,sdk.filename),path.join(directory,content.filename),'--offline','--ignore-scripts','--no-audit','--no-fund']);
  return {directory,consumer,sdk,content};
}
