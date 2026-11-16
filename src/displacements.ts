import type {CombatPoint} from './combat-geometry.js';
export interface DisplacementActor {pos:CombatPoint;readonly radius:number;readonly facing:number;tier:number;dash:unknown}
export interface DisplacementFlash {pos:CombatPoint;radius:number;color:string;life:number;maxLife:number;fx:unknown;facing:number;recoveryCueTier?:number}
export interface DisplacementPorts<A,Policy>{
  movementVoice(skillId:string,phase:'depart'|'arrive'):unknown;
  selfVoice(skillId:string,phase:'depart'|'recall'):unknown;
  flash(flash:DisplacementFlash):void;
  clamp(at:CombatPoint,radius:number,options?:{disp?:Policy;mover?:A}):CombatPoint;
}
/** Shared physical displacement boundary. Combat owns layer publication and
 * cancellation of a running dash; the host only resolves the destination. */
export class Displacements<A extends DisplacementActor,Policy>{
  constructor(readonly ports:DisplacementPorts<A,Policy>){}
  teleport(actor:A,dest:CombatPoint,color='#b8c8ff',policy?:Policy,layer?:number,skillId?:string):void{
    const p=this.ports,depart=skillId&&(p.movementVoice(skillId,'depart')??p.selfVoice(skillId,'depart')),
      arrive=skillId&&(p.movementVoice(skillId,'arrive')??p.selfVoice(skillId,'recall'));
    p.flash({pos:{...actor.pos},radius:actor.radius*1.6,color,life:.25,maxLife:.25,fx:depart||undefined,facing:actor.facing,recoveryCueTier:depart?actor.tier:undefined});
    if(layer!==undefined)actor.tier=layer;
    actor.pos=p.clamp({...dest},actor.radius,layer!==undefined?{...(policy?{disp:policy}:{}),mover:actor}:policy?{disp:policy}:undefined);
    actor.dash=null;
    p.flash({pos:{...actor.pos},radius:actor.radius*(arrive?2.4:1.8),color,life:.3,maxLife:.3,fx:arrive||undefined,facing:actor.facing,recoveryCueTier:arrive?actor.tier:undefined});
  }
}
