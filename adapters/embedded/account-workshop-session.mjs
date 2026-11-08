import {AccountWorkshopSession} from '@hollow-wake/engine/account/workshops';
import {decodeContentTable} from '@hollow-wake/engine/content/table';
import {ItemContent} from '@hollow-wake/engine/items';
import {CraftingContent} from '@hollow-wake/engine/crafting/content';
import {SkillProgression} from '@hollow-wake/engine/skills/progression';
import {WorkshopVestiges} from '@hollow-wake/engine/items/vestiges/workshop';
import {EquipmentSlots} from '@hollow-wake/engine/inventory/equipment';

function packs(table){
  const value=decodeContentTable(table);
  const required=['items','crafting','skills','unlocks','memories','gates'];
  if(!value||typeof value!=='object'||Array.isArray(value)||
    required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!required.includes(key)&&key!=='equipment'))
    throw new Error('Invalid shared account content');
  return value;
}

// This factory consumes an exclusively owned native JSON argument. The public
// content-table decoder remains non-mutating. Release transport rows and each
// decoded pack as soon as its validated owner has detached what it needs.
export function create(table){
  let {items:ip,crafting:cp,skills:sp,unlocks,memories,gates,equipment}=packs(table);
  table.nodes.length=0;
  const items=new ItemContent(ip);ip=null;
  const crafting=new CraftingContent(cp,items);cp=null;
  const skills=new SkillProgression(sp);sp=null;
  const rack=new WorkshopVestiges(items);
  const slots=equipment===undefined?undefined:new EquipmentSlots(equipment);equipment=null;
  const session=new AccountWorkshopSession({progression:{unlocks,memories,gates},
    workshop:{crafting,skills,memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}},rack,equipment:slots});
  unlocks=memories=gates=null;
  return {session,items,crafting,skills,rack,slots};
}

const fail=reason=>({ok:false,reason});
const shaped=(request,keys)=>Object.keys(request).length===keys.length&&keys.every(key=>Object.hasOwn(request,key));
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const textOps=new Set(['open-account-text','open-workshop-text','restore-account-text','restore-workshop-text',
  'account-command-text','workshop-command-text']);

function parseText(request,keys){
  if(!shaped(request,keys)||typeof request.text!=='string'||request.text.length>524288)return fail('invalid-request');
  try{return {value:JSON.parse(request.text)};}catch{return fail('invalid-json');}
}

// Normalize without executing: every member of a prepared batch must be
// admitted before the core can stage even its first operation.
function normalize(request){
  const {op,account,profile}=request;
  const keys=op==='open-account-text'?['op','account','key','seed','text']:
    op==='open-workshop-text'?['op','profile','account','seed','progression','nextUid','text']:
    op==='restore-workshop-text'?['op','profile','account','text']:
    ['op',op==='restore-account-text'||op==='account-command-text'?'account':'profile','text'];
  const parsed=parseText(request,keys);if(parsed.ok===false)return parsed;
  const body=parsed.value;if(!record(body))return fail('invalid-request');
  if(op==='open-account-text'){
    if(Object.keys(body).some(key=>!['state','craftLore','extra'].includes(key)))return fail('invalid-request');
    return {request:{op:'open-account',account,key:request.key,seed:request.seed,...body}};
  }
  if(op==='open-workshop-text')return {request:{op:'open-workshop',profile,account,
    seed:request.seed,progression:request.progression,...(request.nextUid===0?{}:{nextUid:request.nextUid}),state:body}};
  if(op==='restore-account-text')return {request:{op:'restore-account',account,save:body}};
  if(op==='restore-workshop-text')return {request:{op:'restore-workshop',profile,account,save:body}};
  return {request:op==='account-command-text'?{op:'account',account,command:body}:{op:'workshop',profile,command:body}};
}

// Engine serializers handle only these small envelopes. Arbitrary account maps,
// item IDs, opaque payloads and random continuation remain complete JSON text.
export function dispatch(host,request){
  if(!record(request))return fail('invalid-request');
  const {op,account,profile}=request;
  if(op==='prepare-text'){
    const parsed=parseText(request,['op','text']);if(parsed.ok===false)return parsed;
    if(!Array.isArray(parsed.value)||parsed.value.length===0||parsed.value.length>16)return fail('invalid-command-batch');
    const commands=[];
    for(const row of parsed.value){
      if(!record(row)||!['account-command-text','workshop-command-text'].includes(row.op))return fail('invalid-prepared-operation');
      const result=normalize(row);if(result.ok===false)return result;commands.push(result.request);
    }
    const reply=host.session.command({op:'prepare',commands});if(!reply.ok)return reply;
    const {replies,...metadata}=reply;return {...metadata,text:JSON.stringify(replies)};
  }
  if(op==='account-save-text'||op==='workshop-save-text'||op==='prepared-save-text'){
    const isAccount=op==='account-save-text';
    const prepared=op==='prepared-save-text';
    if(!shaped(request,prepared?['op','token','kind','handle']:['op',isAccount?'account':'profile']))return fail('invalid-request');
    const reply=host.session.command(prepared?{op:'prepared-save',token:request.token,kind:request.kind,handle:request.handle}:
      isAccount?{op:'account-save',account}:{op:'workshop-save',profile});
    if(!reply.ok)return reply;
    const {save,...metadata}=reply;return {...metadata,text:JSON.stringify(save)};
  }
  if(!textOps.has(op))return host.session.command(request);
  const result=normalize(request);return result.ok===false?result:host.session.command(result.request);
}
