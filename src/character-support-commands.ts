import {SupportActions,type SocketSkill} from './support-actions.js';
import {createGemCargo} from './gem-residence.js';
import type {CraftingSessionDefinitions} from './crafting-session-data.js';
import type {CharacterBuild,CharacterBuildService} from './character-builds.js';
import type {ItemInstance,GemSocketRow,GrantedSkillState,SkillGemPayload} from './item-types.js';
import type {InventoryHost,LiveInventoryBoard} from './inventory-host.js';
import type {CharacterCommandDraft} from './character-command-types.js';
import {copySessionJSON,requireSession as need,sessionFields as fields,sessionRecord as record,
  sessionText as text,sessionInteger as integer,type SessionJSON} from './session-json.js';

type Target={residence:'learned';skillId:string}|{residence:'granted';skillId:string;hostUid:number};
type SupportRequest=
  | ({op:'socket';uid:number}&Target)
  | ({op:'unsocket';index:number;supportId:string}&(Target|{residence:'stored';skillId:string;uid:number}));
export interface CharacterSupportPorts {
  builds:Pick<CharacterBuildService,'read'|'canSocket'>;build:CharacterBuild;saved:CharacterCommandDraft;
  inventory:Pick<InventoryHost<ItemInstance>,'remove'|'autoPlace'>;
  definitions:{workshop:CraftingSessionDefinitions};
}
export type CharacterSupportEvent={kind:'dirty'|'recalculate'}|{kind:'resync-supports';skillId:string};
export interface CharacterSupportResult {
  changed:boolean;needsSave:boolean;events:CharacterSupportEvent[];refusal?:string;
  request?:CharacterCommandDraft&{capability:'character-workshop/diagnostic'};
  grants?:{skillId:string;hostUid:number;state:GrantedSkillState}[];
}
function parseRequest(request:SessionJSON):SupportRequest {
  record(request);
  const socket=request.op==='socket',stored=request.residence==='stored',granted=request.residence==='granted';
  need(socket||request.op==='unsocket','unsupported-support-command');
  need(stored||granted||request.residence==='learned','invalid-support-residence');
  need(!stored||!socket,'stored-support-installation-unavailable');
  fields(request,['op','residence','skillId',...(granted?['hostUid']:[]),...(socket||stored?['uid']:[]),...(!socket?['index','supportId']:[])]);
  text(request.skillId);if(granted)integer(request.hostUid,1);
  if(socket||stored)integer(request.uid,1);if(!socket){integer(request.index,0,1023);text(request.supportId);}
  return request as unknown as SupportRequest;
}

/** Detached support custody over admitted ownership. Explicit residence keeps
 * a stale granted request from editing a learned skill of the same identity. */
export function changeCharacterSupport(ports:CharacterSupportPorts,rawRequest:unknown,rawConditions:unknown):CharacterSupportResult {
  // Preserve the original validation order: copy request, then admit conditions.
  const detached=copySessionJSON(rawRequest),conditions=copySessionJSON(rawConditions);
  fields(conditions,['hold']);if(conditions.hold!==null)text(conditions.hold);const hold=conditions.hold;
  const request=parseRequest(detached),socket=request.op==='socket',stored=request.residence==='stored',granted=request.residence==='granted';
  const view=ports.builds.read(ports.build),known=new Map(view.known),grant=new Map(view.grants).get(request.skillId);
  const saved=copySessionJSON(ports.saved) as unknown as CharacterCommandDraft,state=saved.state,events:CharacterSupportEvent[]=[];
  let investment:GrantedSkillState|SkillGemPayload|undefined;
  if(granted){
    need(!known.has(request.skillId),'learned-skill-takes-precedence');
    need(grant&&grant.host===request.hostUid,'foreign-grant-support-host');
    investment={sockets:grant.sockets.map(row=>row?{supportId:row.id,level:row.level,
      ...(row.locked?{locked:true}:{}),...(row.rolled?{rolled:row.rolled}:{})}:null),...(grant.tree?.length?{treeNodes:grant.tree}:{})};
  }else if(stored){
    const gem=state.items.find(item=>item.uid===request.uid)?.gem;
    if(gem?.kind==='skill'&&gem.skillId===request.skillId)investment=gem;
  }else{
    need(known.has(request.skillId),'foreign-learned-support-skill');
    investment=state.skillBook.known.find(row=>row.gem.skillId===request.skillId)?.gem;
  }
  if(!investment||(!socket&&investment.sockets[request.index]?.supportId!==request.supportId))
    return{changed:false,needsSave:false,events,refusal:'stale-socket'};
  const held=investment,inst:SocketSkill<GemSocketRow>={def:{id:request.skillId},sockets:held.sockets};
  const next=()=>{integer(saved.nextUid,1,Number.MAX_SAFE_INTEGER-1);return saved.nextUid++;};
  const unavailable=():never=>{throw Error('Support return cannot restore a learned skill');};
  const cargo=createGemCargo({skill:()=>undefined,support:id=>{try{return ports.definitions.workshop.skills.support(id);}catch{return undefined;}},
    hasForm:()=>false,makeSkill:unavailable,validTreeNodes:unavailable,nextUid:next,
    bagWidth:()=>state.board.w,bagHeight:()=>state.board.h,itemGridSize:(item:ItemInstance)=>ports.definitions.workshop.crafting.items.pack.bases[item.baseId]});
  const rows=state.board.rows;
  const board:LiveInventoryBoard={w:state.board.w,h:state.board.h,...(rows?{open:(x:number,y:number)=>rows[y][x]==='#'}:{})};
  let refusal:string|undefined;
  const actions=new SupportActions<null,SocketSkill<GemSocketRow>,GemSocketRow,ItemInstance>({
    bagItem:(_seat,uid)=>state.items.find(item=>item.uid===uid),
    support:item=>item.gem?.kind==='support'?{supportId:item.gem.supportId,level:item.gem.level,
      ...(item.locked?{locked:true}:{}),...(item.gem.rolled?{rolled:item.gem.rolled}:{})}:undefined,
    known:()=>!granted&&!stored?inst:undefined,granted:()=>granted?inst:undefined,
    fits:row=>ports.builds.canSocket(ports.build,request.skillId,row.supportId,row.rolled),refusal:()=>hold,
    fail:(_seat,_key,reason)=>{refusal=reason;},remove:(_seat,uid)=>ports.inventory.remove(state.items,uid),
    give:(_seat,row)=>{
      const item=cargo.itemOfSocket(row);need(item,'invalid-socket-support');
      if(!ports.inventory.autoPlace(state.items,item,board)){refusal='inventory full';return false;}
      events.push({kind:'dirty'});return true;
    },
    recalculate:()=>events.push({kind:'recalculate'}),resync:()=>events.push({kind:'resync-supports',skillId:request.skillId}),
    dirty:()=>events.push({kind:'dirty'}),stored:()=>stored?held as SkillGemPayload:undefined,
    storedSupport:(_item,index)=>stored?held.sockets[index]??undefined:undefined,
  });
  const changed=socket?actions.socket(null,request.uid,request.skillId):stored?actions.unsocketStored(null,request.uid,request.index):actions.unsocket(null,request.skillId,request.index);
  const needsSave=changed||saved.nextUid!==ports.saved.nextUid;
  return{changed,needsSave,events,...(refusal?{refusal}:{}),...(needsSave?{
    request:{capability:'character-workshop/diagnostic' as const,state,character:saved.character,nextUid:saved.nextUid},
    grants:changed&&granted?[{skillId:request.skillId,hostUid:request.hostUid,state:held}]:[]}: {})};
}
