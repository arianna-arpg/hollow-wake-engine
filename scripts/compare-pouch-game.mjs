// Optional upgrade audit. All generated observers, tsx caches and captured
// rows live in a disposable SDK directory; both game trees are read-only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {root,sha256,git} from './reference-utils.mjs';
import {PouchRecall} from '@hollow-wake/engine/inventory/pouch-recall';
import {validatePouchContent} from './compile-pouch-recall.mjs';

const game=fs.realpathSync(process.argv[2]),out=process.argv[3],contentOut=process.argv[4];
for(const target of [out,contentOut].filter(Boolean))assert(!fs.existsSync(target),'Output already exists: '+target);
const artifacts=fs.realpathSync(path.join(root,'.artifacts'));
const scratch=fs.mkdtempSync(path.join(artifacts,'pouch-source-comparison-'));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const accepted=name=>JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline',name,'observations.json.gz'))));
function run(dir,name,variant){
  const source=fs.readFileSync(path.join(root,'reference','export-'+name+'.ts'),'utf8');
  const script=path.join(scratch,variant+'-'+name+'.mts'),target=script+'.json';
  const code=source.replace(/from '(\.\.\/src\/[^']+)'/g,(_,p)=>{
    const filename=path.join(dir,p.slice(3)+'.ts');
    assert(fs.statSync(filename).isFile(),filename);
    return 'from '+JSON.stringify(pathToFileURL(filename).href);
  });
  fs.writeFileSync(script,code+(name==='pouch-recall'?`
    const labels=['source_0','["old-zone","cache"]','found','quest','crypt_lich'];
    const labelPouch=makeMemoryItem('rough',labels.map(d=>({d,s:1})));
    world.localSeat.meta.items.length=0;
    world.localSeat.meta.items.push({...labelPouch,x:0,y:0});
    fs.writeFileSync(process.argv[2]+'.labels',JSON.stringify(world.memoryRecallView(seat,labelPouch.uid)?.groups.map(g=>[g.d,g.name])));
    const explicit=[];
    for(const [k,defs] of [['skill',Object.values(SKILLS)],['support',Object.values(SUPPORTS)]])for(const [i,def] of defs.entries()){
      const unit={d:'found',s:(0xffffffff-i)>>>0,g:{k,id:def.id,l:1}};
      const cut=world['resolveMemoryCut'](seat,unit);
      const item=cut.kind==='skill'?makeSkillGemItem(makeSkillGem(cut.def,cut.level,cut.rarity)):makeSupportGemItem(mintSupportInstance(cut.def,cut.level,cut.rand));
      explicit.push({unit,gem:item.gem});
    }
    fs.writeFileSync(process.argv[2]+'.pinned',JSON.stringify(explicit));
  `:''),{flag:'wx'});
  execFileSync(process.execPath,['--import','tsx',script,target],{cwd:dir,env:{...process.env,TMP:scratch,TEMP:scratch,TMPDIR:scratch,NODE_COMPILE_CACHE:path.join(scratch,'node-cache')},
    windowsHide:true,timeout:180000,stdio:['ignore','pipe','pipe'],maxBuffer:8*1024*1024});
  return {raw:fs.readFileSync(target),labels:name==='pouch-recall'?JSON.parse(fs.readFileSync(target+'.labels')):undefined,
    pins:name==='pouch-recall'?JSON.parse(fs.readFileSync(target+'.pinned')):undefined};
}
function normalizedAction(row){
  const initial=new Map(row.before.map((item,i)=>[item.uid,i+1]));
  const id=n=>initial.get(n)??(n===row.result?.itemUid?'mint':n);
  return {...row,uid:id(row.uid),before:row.before.map(item=>({...item,uid:id(item.uid)})),bagOrder:row.bagOrder.map(id),
    view:row.view&&{...row.view,uid:id(row.view.uid)},item:row.item&&{...row.item,uid:id(row.item.uid)},
    result:row.result&&{...row.result,itemUid:id(row.result.itemUid)}};
}
try{
  const pinned=path.join(root,'.reference'),beforeHead=git(game,['rev-parse','HEAD']).trim();
  const observedFiles=['src/engine/world.ts','src/engine/memories.ts','src/engine/supportbase.ts','src/core/rng.ts',
    'src/data/skills.ts','src/data/supports.ts','src/data/monsters.ts','src/meta/memoryUnlocks.ts'];
  const fingerprint=()=>Object.fromEntries(observedFiles.map(f=>[f,sha256(fs.readFileSync(path.join(game,f)))]));
  const files=fingerprint(),comparisons={},registries={};
  let provenance,currentContent,explicitPins;
  for(const name of ['pouch-recall','pouch-interactions']){
    const control=run(pinned,name,'control'),digest=JSON.parse(fs.readFileSync(path.join(root,'baseline',name,'acceptance.json'))).sha256;
    assert.equal(sha256(control.raw),digest,'Relocated observer failed its pinned-source control');
    const observed=run(game,name,'game'),prior=accepted(name),current=JSON.parse(observed.raw);
    const repeat=run(game,name,'repeat');
    assert(observed.raw.equals(repeat.raw)&&same(observed.labels,repeat.labels)&&same(observed.pins,repeat.pins),'Inconsistent current-game captures');
    assert.equal(current.cases.length,prior.cases.length);
    const differences=current.cases.flatMap((row,i)=>same(row,prior.cases[i])?[]:[i]);
    const row={total:prior.cases.length,matched:prior.cases.length-differences.length,differentIndexes:differences};
    if(name==='pouch-recall'){
      currentContent=validatePouchContent(current.defs);
      const library=new PouchRecall(currentContent),hosts=current.profiles.map(p=>library.forActor(p));
      for(const c of current.cases)assert.deepEqual(hosts[c.profile].cut(c.unit,c.facet),{name:c.name,gem:c.gem});
      for(const p of observed.pins)assert.deepEqual(hosts[0].cut(p.unit).gem,p.gem,'explicit '+p.unit.g.id);
      explicitPins=observed.pins.length;
      row.identicalAccess=same(prior.profiles,current.profiles);
      row.changedActions=current.actions.filter((a,i)=>!same(normalizedAction(a),normalizedAction(prior.actions[i]))).map(a=>a.mode);
      row.actions=current.actions.length;
      for(const [k,value] of Object.entries(prior.defs)){
        const right=current.defs[k];
        if(same(value,right))continue;
        if(Array.isArray(value)&&value.every(r=>r?.id)&&Array.isArray(right)){
          const old=new Map(value.map(r=>[r.id,r])),now=new Map(right.map(r=>[r.id,r]));
          registries[k]={added:[...now.keys()].filter(id=>!old.has(id)),removed:[...old.keys()].filter(id=>!now.has(id)),
            changed:[...now.keys()].filter(id=>old.has(id)&&!same(old.get(id),now.get(id)))};
        }else if(k==='monsters'){
          registries[k]={added:Object.keys(right).filter(id=>!Object.hasOwn(value,id)),removed:Object.keys(value).filter(id=>!Object.hasOwn(right,id)),
            changed:Object.keys(right).filter(id=>Object.hasOwn(value,id)&&!same(value[id],right[id]))};
        }else registries[k]={pinnedSha256:sha256(JSON.stringify(value)),gameSha256:sha256(JSON.stringify(right))};
      }
      provenance={pinned:control.labels,game:observed.labels};
    }else{
      row.identicalAccess=same(prior.skills,current.skills)&&same(prior.supports,current.supports)
        &&same(prior.options.map(o=>[o.level,o.all]),current.options.map(o=>[o.level,o.all]));
      row.identicalWeightTables=same(prior.options.map(o=>o.weights),current.options.map(o=>o.weights));
      const hosts=current.options.map(o=>new PouchRecall({...currentContent,rules:{...currentContent.rules,tagWeights:o.weights}})
        .forActor({level:o.level,all:o.all,skills:current.skills,supports:current.supports}));
      for(const c of current.cases)assert.deepEqual(hosts[c.profile].cut(c.unit,c.facet).gem,c.gem);
    }
    comparisons[name]=row;
  }
  assert.deepEqual(fingerprint(),files,'Live source moved during comparison');
  assert.equal(git(game,['rev-parse','HEAD']).trim(),beforeHead);
  const content=JSON.stringify(currentContent)+'\n';
  const report={gameHead:beforeHead,observedFiles:files,comparedWorkingFiles:true,comparisons,changedRecallContent:registries,provenance,
    portableContent:{sha256:sha256(content),bytes:Buffer.byteLength(content),doubleCapture:true,seededCuts:3024,explicitPins,
      addedSkillsOutsideNormalDrops:currentContent.skills.filter(s=>registries.skills?.added.includes(s.id)&&s.noDrop).length}};
  if(contentOut)fs.writeFileSync(contentOut,content,{flag:'wx'});
  if(out)fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({gameHead:beforeHead,comparisons:Object.fromEntries(Object.entries(comparisons).map(([k,v])=>[k,{total:v.total,matched:v.matched,
    actions:v.actions,changedActions:v.changedActions,identicalAccess:v.identicalAccess}])),changedTables:Object.keys(registries),provenance}));
}finally{
  assert.equal(path.dirname(fs.realpathSync(scratch)),artifacts);
  fs.rmSync(scratch,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
