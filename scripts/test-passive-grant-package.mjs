import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {root,writeJSON} from './reference-utils.mjs';
import {buildPassiveGrants} from './compile-passive-grants.mjs';
import {buildPassiveContent} from './compile-passive-content.mjs';
import {buildCatalogue} from './catalogue-tools.mjs';
const artifacts=path.join(root,'.artifacts'),grants=path.join(artifacts,'passive-grant-package'),policy=path.join(artifacts,'passive-package'),catalogue=path.join(artifacts,'catalogue-package');
buildPassiveGrants(grants);buildPassiveContent(policy);buildCatalogue(catalogue);
const npmCli=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const packages=[root,grants,policy,catalogue].map(cwd=>JSON.parse(execFileSync(process.execPath,[npmCli,'pack','--json','--pack-destination',artifacts,'--cache',path.join(artifacts,'npm-cache')],{cwd,encoding:'utf8'}))[0]);
assert.ok(packages[1].unpackedSize<1024*1024,'Passive grant content exceeded the 1 MiB bound');
assert.deepEqual(packages[1].files.map(f=>f.path).sort(),['LICENSE.md','README.md','grants.json','manifest.json','package.json']);
const consumer=fs.mkdtempSync(path.join(os.tmpdir(),'hollow-grants-'));writeJSON(path.join(consumer,'package.json'),{private:true,type:'module'});
execFileSync(process.execPath,[npmCli,'install',...packages.map(p=>path.join(artifacts,p.filename)),'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(consumer,'cache')],{cwd:consumer,stdio:'pipe'});
fs.writeFileSync(path.join(consumer,'run.mjs'),`
import fs from 'node:fs';import assert from 'node:assert/strict';
Math.random=()=>{throw new Error('Ambient randomness');};globalThis.fetch=()=>{throw new Error('Network');};
for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});
const {PassivePolicy}=await import('@hollow-wake/engine/passives');
const {PassiveGrants}=await import('@hollow-wake/engine/passives/grants');
const {StatRules,StatSheet}=await import('@hollow-wake/engine');
const read=id=>JSON.parse(fs.readFileSync(new URL(import.meta.resolve(id))));
const policy=new PassivePolicy(read('@hollow-wake/passives/passives.json'));
const grants=new PassiveGrants(read('@hollow-wake/passive-grants/grants.json'));
const stats=Object.fromEntries(read('@hollow-wake/catalogue/tables/stats.json').map(r=>[r.id,r.value]));
const trades=read('@hollow-wake/catalogue/tables/rules.json').find(r=>r.id==='statTrades').value;
const rules=new StatRules(stats,trades);let checked=0;
for(const {value:c} of read('@hollow-wake/catalogue/tables/classes.json')) {
 const build=policy.create({classId:c.id,allocated:[c.startNode],choices:{},grafts:{},vocations:[],passivePoints:10,vocationPoints:0,realmPoints:{}});
 const values=()=>{const s=build.snapshot(),g=grants.begin(c.attributes,new Set(s.allocated),s.choices),sheet=new StatSheet(rules);sheet.setSource('attributes',g.attributeModifiers());sheet.setSource('class',c.innate??[]);sheet.setSource('passives',g.passiveModifiers);return {attributes:g.attributes(),life:sheet.get('life'),mana:sheet.get('mana'),damage:sheet.get('damage')};};
 const initial=values();
 for(const id of policy.pack.adjacency[c.startNode]) {
  const node=policy.node(id),group=policy.group(node);
  if(!build.allocate(id,{ledger:{}},group?.options[0].id).accepted)continue;
  const changed=values();assert.ok(Number.isFinite(changed.life));assert.equal(build.refund(id).refusal,null);assert.deepEqual(values(),initial);checked++;
 }
}
assert.ok(checked>100);console.log(JSON.stringify({installedConsumer:true,policyToGrantsToStats:true,checked,contentId:grants.pack.contentId}));
`);
const result=JSON.parse(execFileSync(process.execPath,['run.mjs'],{cwd:consumer,encoding:'utf8',env:{...process.env,NODE_PATH:''}}));
writeJSON(path.join(artifacts,'passive-grant-package-verification.json'),{...result,node:process.version,archiveBytes:packages[1].size,unpackedBytes:packages[1].unpackedSize});console.log(result);
