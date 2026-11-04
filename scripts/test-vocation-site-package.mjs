import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {installVocationPackages} from './vocation-package-tools.mjs';
import {readVocationFixture} from './vocation-reference.mjs';

const {directory,consumer,sdk,content}=installVocationPackages('vocation-site-package-');
const specifier='@hollow-wake/engine/progression/vocation-sites';
const tests=fs.readFileSync(path.join(root,'test/vocation-sites.test.mjs'),'utf8');
assert.equal(tests.split("'../dist/vocation-sites.js'").length,2);
fs.writeFileSync(path.join(consumer,'contracts.mjs'),tests.replace("'../dist/vocation-sites.js'",JSON.stringify(specifier)));
const log=execFileSync(process.execPath,['--test','contracts.mjs'],{cwd:consumer,encoding:'utf8',windowsHide:true});
assert(/(?:#|ℹ) pass 7\b/.test(log));fs.writeFileSync(path.join(directory,'contracts.txt'),log);
const accepted=JSON.parse(fs.readFileSync(path.join(root,'baseline/vocation-sites/acceptance.json')));
const original=JSON.parse(readVocationFixture('sites',accepted.fixtures));
writeJSON(path.join(consumer,'expected.json'),original.spawns.map(s=>({id:s.vocation,npc:s.npc,count:s.dressing.length})));
fs.writeFileSync(path.join(consumer,'content.mjs'),`import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnVocationSite} from '${specifier}';
Math.random=()=>{throw Error('Ambient random');};globalThis.fetch=()=>{throw Error('Network');};
const read=name=>fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/catalogue/'+name)),'utf8');
const bytes=read('tables/vocations.json'),manifest=JSON.parse(read('manifest.json'));
assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.tables.vocations.sha256);
const rows=new Map(JSON.parse(bytes).map(row=>[row.id,row.value])),order=JSON.parse(read('registry-order.json')).vocations;
const outcomes=[];let ordinal=0;
for(const id of order){
  const definition=rows.get(id);if(!definition.secret)continue;
  let npc,count=0,draws=0,published=false,site=false;
  const rng={range(min,max){draws++;return (min+max)/2;}};
  assert(spawnVocationSite(id,0,rng,{definition:key=>rows.get(key),npcAvailable:key=>key===definition.secret.site.npc,zoneLevel:()=>30,
    createNpc(key){npc=key;return ordinal;},radius:()=>2,clearSpot:at=>at,setPosition(){},publishNpc(){published=true;},
    publishSite(key,handle){assert(published&&key===id&&handle===ordinal);site=true;},radialPoint:()=>0,
    publishDoodad(){assert(site);count++;}}));
  assert.equal(draws,count*4);outcomes.push({id,npc,count});ordinal++;
}
assert.deepEqual(outcomes,JSON.parse(fs.readFileSync('expected.json')));console.log(JSON.stringify(outcomes));
`);
const outcomes=JSON.parse(execFileSync(process.execPath,['content.mjs'],{cwd:consumer,encoding:'utf8',windowsHide:true}));assert.equal(outcomes.length,8);
fs.writeFileSync(path.join(consumer,'types.ts'),`import {placeVocationSites,spawnVocationSite,type VocationPlacementPorts,type VocationSiteSpawnPorts} from '${specifier}';
type Tile={layer:2,x:number,y:number};type Zone={id:string};type Rng={range(min:number,max:number):number,seed:number};
declare const ports:VocationPlacementPorts<Zone,Tile,Rng>,materialize:VocationSiteSpawnPorts<Tile,number>,random:Rng;
placeVocationSites({id:'test'},ports);
const accepted:boolean=spawnVocationSite('stone',{layer:2,x:0,y:0},random,materialize);
const npc:number=materialize.createNpc('keeper',1);
// @ts-expect-error A host tile cannot be replaced with an XYZ translation.
spawnVocationSite('stone',[0,0,0],random,materialize);
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,module:'NodeNext',moduleResolution:'NodeNext',target:'ES2022',lib:['ES2022'],types:[]},include:['types.ts']});
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json'],{cwd:consumer,windowsHide:true});
fs.writeFileSync(path.join(consumer,'browser.mjs'),"export * from '"+specifier+"';");
const file=path.join(directory,'browser.mjs'),built=await build({absWorkingDir:consumer,entryPoints:['browser.mjs'],bundle:true,minify:true,platform:'browser',format:'esm',outfile:file,metafile:true});
assert.deepEqual(Object.keys(built.metafile.inputs).sort(),['browser.mjs',...['vocation-keys','vocation-sites','vocation-site-placement'].map(n=>'node_modules/@hollow-wake/engine/dist/'+n+'.js')].sort());
const bytes=fs.statSync(file).size;assert(bytes>0&&bytes<=4096);
const report={passed:true,directory,consumer,contracts:7,authoredSites:outcomes,browserBytes:bytes,types:true,archiveSha256:sha256(fs.readFileSync(path.join(directory,sdk.filename))),catalogueSha256:sha256(fs.readFileSync(path.join(directory,content.filename)))};
writeJSON(path.join(directory,'verification.json'),report);console.log(report);
