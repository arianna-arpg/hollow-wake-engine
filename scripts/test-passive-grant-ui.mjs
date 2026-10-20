import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { root, sha256, writeJSON } from './reference-utils.mjs';
const argument=name=>{const i=process.argv.indexOf(name);assert.ok(i>=0&&process.argv[i+1],`${name} required`);return path.resolve(process.argv[i+1]);};
const game=argument('--game'),electron=argument('--electron'),dist=argument('--dist');
assert.ok(fs.existsSync(path.join(dist,'index.html')));
const reports=fs.mkdtempSync(path.join(root,'.artifacts/passive-grant-ui-'));
const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),results=[];
for(const name of ['passive-attributes-ui','font-passives-ui','passive-grant-editor-ui',...(process.argv.includes('--policy')?['passive-policy-editor-ui']:[])]) {
  const own=name.endsWith('editor-ui'),relative=`balance/${name}.cjs`;
  const input=fs.readFileSync(path.join(own?path.join(root,'adapters/hollow-wake'):path.join(game,'balance'),`${name}.cjs`),'utf8');
  let source=input;
  if(!own) {
    const reference=fs.readFileSync(path.join(root,'.reference',relative),'utf8');
    assert.equal(sha256(reference),lock.files[relative]);
    assert.equal(input.replaceAll('\r\n','\n'),reference.replaceAll('\r\n','\n'),'Original UI assertions changed');
    for(const [before,after] of [["const dir = path.join(__dirname, 'reports');",'const dir = process.env.HOLLOW_WAKE_QA_REPORTS;'],["path.resolve(__dirname, '../dist')",'process.env.HOLLOW_WAKE_QA_DIST']]) {
      assert.equal(source.split(before).length,2);source=source.replace(before,after);
    }
  }
  const temporary=path.join(game,`balance/sdk-check-${randomUUID()}.cjs`);
  fs.writeFileSync(temporary,source,{flag:'wx'});
  try {
    const output=execFileSync(electron,[temporary],{cwd:game,encoding:'utf8',timeout:150000,windowsHide:true,
      env:{...process.env,HOLLOW_WAKE_QA_REPORTS:reports,HOLLOW_WAKE_QA_DIST:dist}});
    fs.writeFileSync(path.join(reports,`${name}.txt`),output);
    const log=own?output:fs.readFileSync(path.join(reports,`${name}.log`),'utf8');
    assert.ok(log.includes('PASS:'),'Course must reach its complete success marker');
    results.push({name,passed:true,harnessSha256Lf:sha256(input.replaceAll('\r\n','\n'))});
    console.log(`${name}: passed`);
  }catch(error){fs.writeFileSync(path.join(reports,`${name}.txt`),String(error.stdout??'')+'\n'+String(error.stderr??error));results.push({name,passed:false});console.error(`${name}: failed; see ${reports}`);}
  finally {if(fs.readFileSync(temporary,'utf8')===source)fs.unlinkSync(temporary);}
}
const receipt={game,dist,reports,results,scope:'Unchanged original attribute-choice and Font courses plus actual mounted editor cache refresh, with isolated saves and profiles.'};
writeJSON(path.join(reports,'verification.json'),receipt);writeJSON(path.join(root,'.artifacts/passive-grant-ui-verification.json'),receipt);
assert.ok(results.every(r=>r.passed),'Passive grant UI course failed');
