import {PassiveActions as BorrowedActions} from 'candidate/borrowed-passive-actions';
import type {PassiveActionPorts} from '../../src/passive-actions.js';
import type {PassiveBuildState} from '../../src/passive-policy.js';
import type {CharacterCommandDraft} from '../../src/character-command-types.js';
import type {CharacterBuildView} from '../../src/character-builds.js';
import {changeCharacterPassive} from 'candidate/passive-commands';
import {CharacterPassiveEffects} from 'candidate/passive-effects';

/** Test adapter for the live-effect boundary only. It deliberately does not
 * stand in for complete character admission, account authority or persistence. */
interface Ports<S,I,B> extends PassiveActionPorts<S,I,B>{
 writePassives(seat:S,value:PassiveBuildState):undefined;
 learned(seat:S):Iterable<I>;
 granted(seat:S):Iterable<I>;
}
export class PassiveActions<S,I,B>{
 readonly #ports:Ports<S,I,B>;readonly #borrowed:BorrowedActions<S,I,B>;#busy=false;
 constructor(ports:Ports<S,I,B>){this.#ports=ports;this.#borrowed=new BorrowedActions(ports);}
 #execute(seat:S,request:Record<string,unknown>):boolean{
  if(this.#busy)throw Error('Reentrant planned World action');this.#busy=true;
  try{
   const p=this.#ports,session=p.session(seat),{schemaVersion:_,capability:__,contentId:___,...passives}=session.snapshot();
   const projection:CharacterBuildView={known:[...p.knownIds(seat)].map(id=>[id,{id,level:1,sockets:[]}]),grants:[],bar:[],companions:[],equipped:{},attrs:{},sources:[]};
   type Row=CharacterCommandDraft&{projection:CharacterBuildView};
   const rows=new WeakMap<object,Row>(),previous=Object.freeze({});
   rows.set(previous,{state:{board:{w:1,h:1},items:[],equipped:{},overflow:[],essences:{},skillBook:{known:[],bar:Array(8).fill(null)}},
    character:{schemaVersion:2,capability:'workshop-character/progression-diagnostic',contentId:'live-effects-test-only',level:1,baseAttrs:{},containers:{},abilityEssences:{},passives},nextUid:1,projection});
   const read=(token:object)=>rows.get(token)!;
   const access=request.op==='allocate'||request.op==='ensureOpenRoots'?p.access(seat):{ledger:{}};
   const result=changeCharacterPassive({policy:session.policy,previous,read,
    rebuild:(_previous,next)=>{const token=Object.freeze({});rows.set(token,{...next,projection});return token;}},request,
    {refundRefusal:request.op==='refund'?p.refundRefusal(seat):null,openAllRealms:access.openAllRealms??false,runLedger:access.ledger});
   const player=new CharacterPassiveEffects<I,B>({
    rebuild:index=>{p.writePassives(seat,read(result.rebuilds[index].after).character.passives);p.recalculate(seat);},
    captureSummons:()=>p.summons(seat),alive:body=>p.alive(body),learned:()=>p.learned(seat),granted:()=>p.granted(seat),known:id=>p.known(seat,id),
    refreshSupports:inst=>p.resyncSupports(inst),refreshSummon:body=>p.refreshSummon(seat,body),refreshCompany:()=>p.refreshCompany(seat),
    markMetaDirty:()=>p.markMetaDirty(seat),markCharacterDirty:()=>p.markCharacterDirty(),refusal:(key,reason)=>p.fail(seat,key,reason)
   });
   player.play(result.events);return result.accepted;
  }finally{this.#busy=false;}
 }
 allocate(seat:S,nodeId:string,option?:string):boolean{return this.#execute(seat,{op:'allocate',nodeId,...(option===undefined?{}:{option})});}
 refund(seat:S,nodeId:string):boolean{return this.#execute(seat,{op:'refund',nodeId});}
 bindGraft(seat:S,key:string,skillId:string|null):boolean{return this.#execute(seat,{op:'bindGraft',key,skillId});}
 ensureOpenRoots(seat:S):void{this.#execute(seat,{op:'ensureOpenRoots'});}
 // Award authority and explicit realm grants are deliberately outside this
 // planner's player-command surface; use the already qualified borrowed path.
 ensureRealmRoots(seat:S,realm:string):void{this.#borrowed.ensureRealmRoots(seat,realm);}
 grantRealmPoints(seat:S,currency:string,amount:number):void{this.#borrowed.grantRealmPoints(seat,currency,amount);}
}
