import type {CharacterPassiveEvent} from './character-passive-commands.js';
import {requireSession as need} from './session-json.js';

export interface CharacterPassiveEffectPorts<S,B> {
 /** Apply this admitted intermediate investment to the current actor and
  * rebuild it. Never restore a preparation-time combat snapshot. */
 rebuild(index:number):undefined;
 captureSummons():readonly B[];
 alive(body:B):boolean;
 learned():Iterable<S>;
 granted():Iterable<S>;
 known(skillId:string):S|undefined;
 refreshSupports(skill:S):undefined;
 refreshSummon(body:B):undefined;
 refreshCompany():undefined;
 markMetaDirty():undefined;
 markCharacterDirty():undefined;
 refusal(key:string,reason:string):undefined;
}
const done=(value:unknown):void=>{need(value===undefined,'passive-effect-must-be-synchronous');};

/** Ordered live playback only. An admitted durable owner supplies the events
 * after acknowledgement and owns recovery if a callback fails. This service
 * cannot authorize a save or admit a character; earlier live effects remain
 * applied on failure. No body, skill or clock is retained between calls. */
export class CharacterPassiveEffects<S,B> {
 readonly #ports:CharacterPassiveEffectPorts<S,B>;#busy=false;
 constructor(ports:CharacterPassiveEffectPorts<S,B>){
  const names=['rebuild','captureSummons','alive','learned','granted','known','refreshSupports','refreshSummon','refreshCompany','markMetaDirty','markCharacterDirty','refusal'] as const;
  this.#ports=Object.fromEntries(names.map(name=>{
   const callback=ports[name];need(typeof callback==='function','passive-effect-'+name+'-required');return[name,callback.bind(ports)];
  })) as unknown as CharacterPassiveEffectPorts<S,B>;
 }
 play(events:readonly CharacterPassiveEvent[]):void {
  need(!this.#busy,'reentrant-passive-effects');this.#busy=true;
  const p=this.#ports;let captured:readonly B[]|undefined;
  try{
   for(const event of events){
    switch(event.kind){
     case 'capture-summons':need(captured===undefined,'passive-summons-already-captured');captured=[...p.captureSummons()];break;
     case 'recalculate':done(p.rebuild(event.rebuild));break;
     case 'resync-owned-supports':{
      // Capture both maps before callbacks. Equal skill IDs and even equal
      // object identities remain separate visits, as in the original loop.
      const skills=[...p.learned(),...p.granted()];for(const skill of skills)done(p.refreshSupports(skill));break;
     }
     case 'resync-supports':{
      need(event.origin==='learned','unexpected-passive-skill-origin');const skill=p.known(event.skillId);if(skill)done(p.refreshSupports(skill));break;
     }
     case 'refresh-captured-summons':
      need(captured,'passive-summons-not-captured');for(const body of captured){const alive=p.alive(body);need(typeof alive==='boolean','passive-alive-must-be-synchronous');if(alive)done(p.refreshSummon(body));}captured=undefined;break;
     case 'refresh-company':done(p.refreshCompany());break;
     case 'meta-dirty':done(p.markMetaDirty());break;
     case 'character-dirty':done(p.markCharacterDirty());break;
     case 'refusal':done(p.refusal(event.key,event.reason));break;
     default:need(false,'unknown-passive-effect');
    }
   }
  }finally{this.#busy=false;}
 }
}
