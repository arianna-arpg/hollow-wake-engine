// Existing hidden-window game courses, with only their build/report destinations isolated.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const argument=name=>{const i=process.argv.indexOf(name);assert.ok(i>=0&&process.argv[i+1],`${name} required`);return path.resolve(process.argv[i+1]);};
const game=argument('--game'),electron=argument('--electron'),dist=argument('--dist');
assert.ok(fs.existsSync(path.join(dist,'index.html')),'Build the isolated game first');
const reports=fs.mkdtempSync(path.join(root,'.artifacts/item-ui-'));
const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),results=[];
for(const name of ['inventory-ui','inventory-pages-ui']) {
  const relative=`balance/${name}.cjs`,input=fs.readFileSync(path.join(game,relative),'utf8');
  const reference=fs.readFileSync(path.join(root,'.reference',relative),'utf8');
  assert.equal(sha256(reference),lock.files[relative],'Reference UI harness changed');
  assert.equal(input.replaceAll('\r\n','\n'),reference.replaceAll('\r\n','\n'),'Game UI harness changed');
  const anchor="const dir = path.join(__dirname, 'reports');";
  assert.equal(input.split(anchor).length,2);
  let source=input.replace(anchor,'const dir = process.env.HOLLOW_WAKE_QA_REPORTS;');
  if(name==='inventory-ui') {
    const output="path.resolve(__dirname, '../dist')";assert.equal(source.split(output).length,2);
    source=source.replace(output,'process.env.HOLLOW_WAKE_QA_DIST');
  }
  const temporary=path.join(game,`balance/sdk-check-ui-${randomUUID()}.cjs`);
  fs.writeFileSync(temporary,source,{flag:'wx'});
  try {
    const output=execFileSync(electron,[temporary],{cwd:game,encoding:'utf8',timeout:90000,
      env:{...process.env,HOLLOW_WAKE_QA_DIST:dist,HOLLOW_WAKE_QA_REPORTS:reports},windowsHide:true});
    fs.writeFileSync(path.join(reports,`${name}.txt`),output);
    const checks=JSON.parse(fs.readFileSync(path.join(reports,`${name}.json`)));
    assert.ok(Array.isArray(checks)&&checks.length>0);
    results.push({name,passed:true,checks:checks.length,harnessSourceSha256Lf:sha256(input.replaceAll('\r\n','\n'))});
    console.log(`${name}: ${checks.length} checks passed`);
  } catch(error) {
    fs.writeFileSync(path.join(reports,`${name}.txt`),String(error.stdout??'')+'\n'+String(error.stderr??error));
    results.push({name,passed:false,error:String(error.stderr??error.message).trim(),harnessSourceSha256Lf:sha256(input.replaceAll('\r\n','\n'))});
    console.error(`${name}: failed; see ${path.join(reports,`${name}.txt`)}`);
  } finally { if(fs.readFileSync(temporary,'utf8')===source)fs.unlinkSync(temporary); }
}
const report={game,dist,reports,results,scope:'Hidden renderer with original input/DOM courses and isolated profiles/saves. Full original game, not a native SDK consumer.'};
writeJSON(path.join(reports,'verification.json'),report);
writeJSON(path.join(root,'.artifacts/game-item-ui-verification.json'),report);
assert.ok(results.every(r=>r.passed),'An Inventory UI course failed; see the retained per-course reports');
