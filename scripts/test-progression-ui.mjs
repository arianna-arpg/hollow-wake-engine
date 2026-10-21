import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';
const argument=name=>{const i=process.argv.indexOf(name);assert(i>=0&&process.argv[i+1],`${name} required`);return path.resolve(process.argv[i+1]);};
const game=argument('--game'),dist=argument('--dist'),electron=argument('--electron');assert(fs.existsSync(path.join(dist,'index.html')));
const reports=fs.mkdtempSync(path.join(root,'.artifacts/progression-ui-')),source=fs.readFileSync(path.join(root,'adapters/hollow-wake/progression-ui.cjs'));
const temporary=path.join(game,`balance/sdk-check-${randomUUID()}.cjs`);fs.writeFileSync(temporary,source,{flag:'wx'});let passed=false;
try{const output=execFileSync(electron,[temporary],{cwd:game,encoding:'utf8',timeout:150000,windowsHide:true,env:{...process.env,HOLLOW_WAKE_QA_REPORTS:reports,HOLLOW_WAKE_QA_DIST:dist}});fs.writeFileSync(path.join(reports,'course.txt'),output);assert(output.includes('PASS:'));passed=true;console.log(output);}
catch(error){fs.writeFileSync(path.join(reports,'course.txt'),String(error.stdout??'')+'\n'+String(error.stderr??error));throw error;}
finally{if(fs.readFileSync(temporary).equals(source))fs.unlinkSync(temporary);writeJSON(path.join(root,'.artifacts/progression-ui-verification.json'),{game,dist,reports,passed,harnessSha256:sha256(source),scope:'Fresh Warrior earns every spent point through real World.grantXp, then actual passive choice, stat rebuild, Font refund and reselection controls. Hidden desktop renderer; no device or persistence claim.'});}
