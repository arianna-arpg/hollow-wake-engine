import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {installVocationPackages} from './vocation-package-tools.mjs';
import {readVocationFixture} from './vocation-reference.mjs';

const {directory,consumer,sdk,content}=installVocationPackages('character-rules-package-');
const modules={identity:'character-identity',kits:'class-kits',claims:'class-claims'};
const specifier=key=>'@hollow-wake/engine/character/'+key;
let tests=fs.readFileSync(path.join(root,'test/character-rules.test.mjs'),'utf8');
for(const [key,file] of Object.entries(modules)){
  const local="'../dist/"+file+".js'";
  assert.equal(tests.split(local).length,2);tests=tests.replace(local,JSON.stringify(specifier(key)));
}
fs.writeFileSync(path.join(consumer,'contracts.mjs'),tests);
const log=execFileSync(process.execPath,['--test','contracts.mjs'],{cwd:consumer,encoding:'utf8',windowsHide:true});
assert(/(?:#|ℹ) pass 9\b/.test(log));fs.writeFileSync(path.join(directory,'contracts.txt'),log);
const accepted=JSON.parse(fs.readFileSync(path.join(root,'baseline/character-rules/acceptance.json')));
const original=JSON.parse(readVocationFixture('identity',accepted.fixtures));
writeJSON(path.join(consumer,'reference.json'),original.records.map(r=>[r.id,r.before.opening,r.before.base]));
fs.writeFileSync(path.join(consumer,'content.mjs'),`import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createClassIdentity} from '${specifier('identity')}';
import {resolveClassKit} from '${specifier('kits')}';
const read=name=>fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/catalogue/'+name)),'utf8');
const bytes=read('tables/classes.json'),manifest=JSON.parse(read('manifest.json'));
assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.tables.classes.sha256);
const defs=new Map(JSON.parse(bytes).map(row=>[row.id,row.value])),reference=JSON.parse(fs.readFileSync('reference.json'));
const account={unlockedClassTiers:new Set(),kitPicks:{}};
for(const [id,opening,attrs] of reference){
  const def=defs.get(id);assert(def,id);
  const resolved=resolveClassKit(account,def),character=createClassIdentity(def,resolved);
  assert.deepEqual(character.opening,opening,id);assert.deepEqual(character.baseAttrs,attrs,id);
  assert.notEqual(character.attrs,character.baseAttrs);assert.notEqual(character.opening,def.bar);
}
assert.equal(reference.length,39);
`);
execFileSync(process.execPath,['content.mjs'],{cwd:consumer,windowsHide:true});
fs.writeFileSync(path.join(consumer,'consumer.ts'),`import {createClassIdentity,restoreClassIdentity} from '${specifier('identity')}';
import {kitChoicesFor,ownedKitRungs,resolveClassKit} from '${specifier('kits')}';
import {settleClassClaims,type ClassClaimPorts} from '${specifier('claims')}';
const hero={id:'ember',name:'Ember',attributes:{power:2},bar:[null,0],race:'river'};
const created=createClassIdentity(hero,hero.bar);
const power:number=created.attrs.power,skill:number|null=created.opening[0],race:string=created.classDef.race;
const restored=restoreClassIdentity(hero,{opening:[0],baseAttrs:{power:4},stances:{guard:true}},s=>!!s?.guard);
const stance:boolean=restored.stances,level:number=restored.attrs.power;
const kit={id:'ember',bar:['arc',null],kit:[{tier:'one',skill:'wave',replaces:'arc',col:5}]};
const account={unlockedClassTiers:new Set<string>(),kitPicks:{}};
const col:number=ownedKitRungs(account,kit)[0].col;
const slots=kitChoicesFor(account,kit).slots,bar:(string|null)[]=resolveClassKit(account,kit);
type Row={id:string,kind:string,earned:boolean,price:number};
type View={credit:number};
declare const ports:ClassClaimPorts<Set<string>,Row,View>,rows:Row[];
const prices:number[]=settleClassClaims(rows,new Set<string>(),{credit:1},ports).map(r=>r.price);
// @ts-expect-error This host supplies numeric credit.
settleClassClaims(rows,new Set<string>(),{credit:'one'},ports);
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,module:'NodeNext',moduleResolution:'NodeNext',target:'ES2022',lib:['ES2022'],types:[]},include:['consumer.ts']});
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json'],{cwd:consumer,windowsHide:true});
const browserBytes={};
for(const [key,file]of Object.entries(modules)){
  const entry=key+'-browser.mjs',output=path.join(directory,entry);
  fs.writeFileSync(path.join(consumer,entry),"export * from '"+specifier(key)+"';");
  const bundled=await build({absWorkingDir:consumer,entryPoints:[entry],bundle:true,minify:true,platform:'browser',format:'esm',metafile:true,outfile:output});
  assert.deepEqual(Object.keys(bundled.metafile.inputs).sort(),[entry,'node_modules/@hollow-wake/engine/dist/'+file+'.js'].sort());
  browserBytes[key]=fs.statSync(output).size;assert(browserBytes[key]>0&&browserBytes[key]<=3072,key);
}
const report={passed:true,directory,contracts:9,classes:39,browserBytes,types:true,archiveSha256:sha256(fs.readFileSync(path.join(directory,sdk.filename))),catalogueSha256:sha256(fs.readFileSync(path.join(directory,content.filename)))};
writeJSON(path.join(directory,'verification.json'),report);console.log(report);
