import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';
import {CraftingSession} from '@hollow-wake/engine/crafting/session';
import {WorkshopRack} from '@hollow-wake/engine/skills/workshop-rack';
import {ItemContent} from '@hollow-wake/engine/items';
import {CraftingContent} from '@hollow-wake/engine/crafting/content';
import {SkillProgression} from '@hollow-wake/engine/skills/progression';
import {itemPack} from './compile-item-content.mjs';
import {craftingPack} from './compile-crafting-content.mjs';
import {skillProgressionPack} from './compile-skill-progression.mjs';
import {root,sha256} from './reference-utils.mjs';

const [output]=process.argv.slice(2);
assert(output&&!fs.existsSync(output),'Supply a new report filename');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file)));
const proof=read('evidence/content-tables/windows.json'),raw=fs.readFileSync(path.join(root,proof.raw.file));
assert.equal(sha256(raw),proof.raw.sha256);
const large=JSON.parse(gunzipSync(raw)).course.rows.map(r=>r.expected.save).find(s=>s?.state.items.length===128);
const sample=read('examples/godot-inventory/cargo-sample.json');
const skill=sample.find(i=>i.gem?.kind==='skill');
const small={board:{w:2,h:2},items:sample,equipped:{},overflow:[],essences:{},account:{craftLore:{},ledger:{},features:[],progression:true}};
// Put the sample gem in the last retained ring's cell. All 3,929 lore rows and
// other item bodies stay intact. Content compilation happens before timing.
const last=large.state.items.at(-1);
large.state.items[127]={...skill,x:last.x,y:last.y};
const items=new ItemContent(itemPack()),defs={crafting:new CraftingContent(craftingPack(items),items),
  skills:new SkillProgression(skillProgressionPack()),memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}};

function workload(state){
  const session=new CraftingSession(defs,1,new WorkshopRack());
  const cmd=(op,args={})=>session.command({profile:1,op,...args});
  assert(cmd('open',{state,seed:17}).ok);
  let uid=skill.uid;
  const times={move:[],snapshot:[]};
  for(let pair=0;pair<36;pair++){
    for(const learn of [true,false]){
      const start=performance.now();
      const reply=learn?cmd('learn-skill',{uid,slot:4,meets:true,blocked:{}}):cmd('unlearn-skill',{skillId:skill.gem.skillId,blocked:{}});
      const moved=performance.now();
      const checkpoint=cmd('save');
      const saved=performance.now();
      assert(reply.ok&&reply.result.changed&&reply.result.needsSave&&checkpoint.ok);
      if(!learn){uid=reply.nextUid-1;assert.equal(checkpoint.save.state.items.at(-1).uid,uid);}
      if(pair>=4){times.move.push(moved-start);times.snapshot.push(saved-moved);}
    }
  }
  const quantiles=values=>{
    values.sort((a,b)=>a-b);
    return {p50:values[Math.ceil(values.length*.5)-1],p95:values[Math.ceil(values.length*.95)-1]};
  };
  return {items:state.items.length,lore:Object.keys(state.account.craftLore).length,measuredActions:times.move.length,
    moveMs:quantiles(times.move),snapshotMs:quantiles(times.snapshot)};
}
const report={version:read('package.json').version,node:process.version,cpu:os.cpus()[0].model,platform:process.platform,
  scope:'Owned SDK learn/return and portable snapshot request measured separately in Node. Excludes rendering, native wire and SQLite.',
  small:workload(small),loaded:workload(large.state)};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(report);
