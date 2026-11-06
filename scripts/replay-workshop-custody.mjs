import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {root} from './reference-utils.mjs';
import {itemPack} from './compile-item-content.mjs';
import {craftingPack} from './compile-crafting-content.mjs';
import {skillProgressionPack} from './compile-skill-progression.mjs';
import {CraftingSession} from '@hollow-wake/engine/crafting/session';
import {WorkshopSupports} from '@hollow-wake/engine/skills/workshop-supports';
import {ItemContent} from '@hollow-wake/engine/items';
import {CraftingContent} from '@hollow-wake/engine/crafting/content';
import {SkillProgression} from '@hollow-wake/engine/skills/progression';
import {gemItemRarityOf} from '@hollow-wake/engine/inventory/gems';

export function replayCustody(fits,read){
  const original=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'baseline/milestone-twenty-one/support-actions.json.gz'))));
  const items=new ItemContent(itemPack()),defs={crafting:new CraftingContent(craftingPack(items),items),skills:new SkillProgression(skillProgressionPack()),
    memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}};
  const steps=new Map(original.courses.flatMap(c=>c.steps.map(s=>[s.label,s])));
  // The original wrapper IDs were omitted from these observations. Assign
  // local IDs and compare every retained cargo field, position and skill row.
  const plans=[
    ['socket-locked-levelled-gem','install','splitting'],['unsocket-roundtrip','return',0],
    ['incompatible-gem','install','faultfinder'],['all-sockets-occupied','install','splitting'],
    ['hot-blood-socket','install','splitting'],['cooled-socket','install','splitting'],
    ['hot-blood-unsocket','return',0],['cooled-unsocket','return',0],
    ['full-bag-unsocket','return',0],['one-space-unsocket','return',0],
    ['stored-cargo-return','stored',1],['stored-cargo-return-once','stored',1],
    ['full-bag-keeps-stored-cut','stored',0],['one-cell-returns-stored-cut','stored',0],
    ['crew-only-support-reaches-existing-minion','install','splitting'],['remove-key-unboards-live-crew','return',0],
    ['remote-socket','install','splitting',1],['remote-unsocket','return',0,1],
  ];
  for(const [label,op,arg,seat=0] of plans){
    const step=steps.get(label),before=step.before.seats[seat],after=step.after.seats[seat];
    const bag=before.items.map(({gem,locked,x,y},i)=>({uid:i+1,baseId:gem.kind+'_gem',ilvl:1,tier:1,
      name:gem.skillId??gem.supportId,rarity:gemItemRarityOf(gem),baseRoll:0,implicitRolls:[],affixes:[],gem,locked,x,y}));
    const bar=before.skills.map(s=>s.payload);
    const rack=[...bar.map(gem=>({gem})),...Array(8-bar.length).fill(null)];
    const state={board:{w:12,h:8},items:bag,equipped:{},rack,overflow:[],essences:{},account:{craftLore:{},ledger:{},features:[],progression:true}};
    const sdk=new CraftingSession(defs,1,new WorkshopSupports());
    const cmd=(op,args={})=>JSON.parse(JSON.stringify(sdk.command({op,profile:1,...args})));
    assert(cmd('open',{state,seed:0,nextUid:10000}).ok,label);
    const note=step.events.find(e=>e.name==='failNote'&&e.phase==='before');
    const hold=note?.key.endsWith(':discipline')?note.reason:null;
    let result;
    if(op==='install'){
      const item=bag.find(r=>r.gem.supportId===arg);
      result=cmd('socket-support',{skillId:bar[0].skillId,uid:item.uid,hold,fits:fits(bar,item.gem,read)[0].fits});
    }else{
      const carrier=op==='stored'?bag.find(r=>r.gem.kind==='skill'):null,gem=carrier?.gem??bar[0];
      result=cmd('unsocket-support',{skillId:gem.skillId,index:arg,supportId:gem.sockets[arg]?.supportId??'splitting',hold,...(carrier?{uid:carrier.uid}:{})});
    }
    assert.equal(result.result.changed,step.result,label);
    if(note)assert.equal(result.result.refusal,note.reason,label);
    const saved=cmd('save').save;
    assert.equal(saved.nextUid-10000,step.events.filter(e=>e.phase==='before'&&e.name==='grantSupportGemItem').length,label);
    assert.deepEqual(saved.state.items.map(i=>({gem:i.gem,locked:i.locked??false,x:i.x,y:i.y})),after.items,label);
    assert.deepEqual(saved.state.rack.filter(Boolean).map(r=>r.gem),after.skills.map(s=>s.payload),label);
    assert.deepEqual(saved.state.overflow,[],label);
  }
  return plans.length;
}
