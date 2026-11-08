import {create as createSession,dispatch as dispatchSession} from '../../experiments/embedded-js/session.mjs';

// Explicit first integration capability. The workshop remains responsible for
// custody, level requirements and durable authorization. This projection never
// silently omits an unsupported item field or effect.
export const equipmentCapability='live-equipment/simple-v1';
const slots=Object.freeze({ring1:'ring',ring2:'ring',amulet:'amulet'});
const bases=Object.freeze(['ring_lapis','ring_coral','amulet_opal']);
const itemFields=Object.freeze(['uid','baseId','ilvl','tier','rarity','name','baseRoll','implicitRolls','affixes','x','y']);
const commands=Object.freeze(['prepareEquipment','publishEquipment','discardEquipment','equipmentView']);
const fail=error=>({ok:false,error});
function need(condition,message){if(!condition)throw new Error(message);}
function fields(value,names){
 need(value && typeof value==='object' && !Array.isArray(value),'object-required');
 need(Object.keys(value).every(key=>names.includes(key)),'unsupported-field');
}
const integer=value=>Number.isSafeInteger(value) && value>0;
function structural(build){
 const {conditions,gauges,...fixed}=build;return JSON.stringify(fixed);
}
export function create(input){
 const root=createSession(input);
 root.equipment={pending:new Map(),nextToken:1};
 return root;
}
function project(root,owner,equipped){
 fields(equipped,Object.keys(slots));
 const build=owner.character.snapshot();
 build.equipped={};delete build.itemInstances;
 const definitions={},seen=new Set();
 for(const [slot,item] of Object.entries(equipped)){
  fields(item,itemFields);
  need(bases.includes(item.baseId) && item.rarity==='common','unsupported-equipment');
  need(integer(item.uid) && !seen.has(item.uid),'invalid-item-identity');seen.add(item.uid);
  need(typeof item.name==='string' && item.name.length>0 && item.name.length<=512,'invalid-item-name');
  need(Array.isArray(item.affixes) && item.affixes.length===0,'unsupported-equipment');
  const base=root.items.pack.bases[item.baseId];
  need(base && base.category===slots[slot],'invalid-equipment-slot');
  need(Array.isArray(item.implicitRolls) && item.implicitRolls.length===(base.implicits?.length??0),'invalid-implicit-rolls');
  need([item.baseRoll,...item.implicitRolls].every(value=>Number.isFinite(value) && value>=0 && value<=1),'invalid-item-roll');
  const id='equipped:'+item.uid;
  definitions[id]={id,name:item.name,category:base.category,slots:[slot],mods:owner.rules.compile(item)};
  build.equipped[slot]=id;
 }
 if(seen.size)build.itemInstances=definitions;
 return owner.engine.character(build);
}
function equipment(root,request){
 try{
  need(request.version===1,'unsupported-protocol');
  fields(request,request.op==='prepareEquipment'?['version','op','handle','capability','equipped']
   :request.op==='equipmentView'?['version','op','handle']:['version','op','handle','token']);
  need(integer(request.handle),'invalid-handle');
  const owner=root.sessions.get(request.handle);
  if(!owner)return fail('stale-handle');
  if(owner.poisoned)return fail('poisoned-session');
  const state=root.equipment,pending=state.pending.get(request.handle);
  if(request.op==='equipmentView'){
   const costs=owner.engine.costs(owner.character,owner.skill);
   return {ok:true,view:{capability:equipmentCapability,attributes:{...owner.character.attributes},
    stats:Object.fromEntries(Object.keys(root.content.pack.stats).map(id=>[id,owner.character.sheet.get(id)])),
    cost:{mana:costs.mana,life:costs.life},cooldown:costs.cooldown,
    preview:owner.engine.preview(owner.character,owner.skill),
    life:owner.casting.life,mana:owner.casting.mana}};
  }
  if(request.op==='prepareEquipment'){
   if(pending)return fail('equipment-pending');
   need(request.capability===equipmentCapability,'unsupported-equipment-capability');
   need(integer(state.nextToken+1),'equipment-token-exhausted');
   const character=project(root,owner,request.equipped);
   // Keep the live character, timers, target, effects and random streams intact.
   const token=state.nextToken++;
   state.pending.set(request.handle,{token,character,source:owner.character,
    structural:structural(owner.character.snapshot())});
   return {ok:true,token};
  }
  need(integer(request.token),'invalid-equipment-token');
  if(!pending || pending.token!==request.token)return fail('stale-equipment-token');
  if(request.op==='discardEquipment'){state.pending.delete(request.handle);return {ok:true};}
  const current=owner.character.snapshot();
  if(owner.character!==pending.source || structural(current)!==pending.structural)return fail('equipment-conflict');
  // Conditions/gauges and resources can change while storage works. Copy only
  // current dynamic build inputs; never restore a prepared combat snapshot.
  pending.character.setConditions(current.conditions??[]);
  pending.character.setGauges(current.gauges??[]);
  const resources={life:Math.min(owner.casting.life,pending.character.sheet.get('life')),
   mana:Math.min(owner.casting.mana,pending.character.sheet.get('mana'))};
  owner.casting.setResources(resources);
  owner.character=pending.character;
  state.pending.delete(request.handle);
  return {ok:true};
 }catch(error){return {ok:false,error:'invalid-equipment',message:String(error.message)};}
}
export function dispatch(root,request){
 if(request && commands.includes(request.op))return equipment(root,request);
 // No structural interleaving while a durable candidate is outstanding.
 // Ordinary simulation commands, snapshots and disposal remain available.
 if(request?.version===1 && request.op==='batch' && root.equipment.pending.has(request.handle) &&
    Array.isArray(request.commands) && request.commands.some(command=>command?.op==='equip'))
  return fail('equipment-pending');
 const result=dispatchSession(root,request);
 if(result.ok && request.op==='destroy')root.equipment.pending.delete(request.handle);
 return result;
}
