import {SkillBarActions,type BarSkill,type BarBody} from './skill-bar.js';
import type {CharacterBuild,CharacterBuildService} from './character-builds.js';
import {copySessionJSON,requireSession as need,sessionFields as fields,sessionRecord as record,
  sessionInteger as integer,sessionText as text} from './session-json.js';

export interface CharacterBarPorts {builds:Pick<CharacterBuildService,'read'>;build:CharacterBuild}
export type CharacterBarEvent=
  | {kind:'remember-skill-slot';skillId:string;slot:number}
  | {kind:'bar-rebound';skillIds:string[]};
export interface CharacterBarResult {
  accepted:boolean;changed:boolean;needsSave:boolean;events:CharacterBarEvent[];bar:(string|null)[];
}

/** Detached binding preparation over admitted learned/granted ownership.
 * Events survive no-op edits; no live rebind or account preference is applied. */
export function changeCharacterBar(ports:CharacterBarPorts,rawRequest:unknown):CharacterBarResult {
  const request=copySessionJSON(rawRequest);record(request);
  const bind=request.op==='bind';need(bind||request.op==='swap','unsupported-bar-command');
  fields(request,bind?['op','slot','skillId']:['op','a','b']);
  if(bind){integer(request.slot,0,7);if(request.skillId!==null)text(request.skillId);}
  else{integer(request.a,0,7);integer(request.b,0,7);}
  const view=ports.builds.read(ports.build);
  const resolved=new Map<string,BarSkill>([...view.grants,...view.known].map(([id])=>[id,{def:{id}}]));
  const body:BarBody<BarSkill>={skills:view.bar.map(row=>{
    if(!row)return null;const skill=resolved.get(row.id);need(skill,'unresolved-command-bar');return skill;
  })};
  const before=body.skills.slice(),events:CharacterBarEvent[]=[];
  const remember=(_seat:null,touched:readonly (BarSkill|null|undefined)[])=>{
    for(const skill of touched)if(skill)events.push({kind:'remember-skill-slot',skillId:skill.def.id,slot:body.skills.indexOf(skill)});
  };
  const unavailable=():never=>{throw Error('Private bar preparation cannot execute live effects');};
  const actions=new SkillBarActions<null,BarBody<BarSkill>,BarSkill>({hero:()=>body,resolve:(_seat,id)=>resolved.get(id)??null,remember,
    rebind:(_seat,touched)=>{remember(null,touched);events.push({kind:'bar-rebound',skillIds:[...new Set(touched.filter((skill):skill is BarSkill=>!!skill).map(skill=>skill.def.id))]});},
    actor:unavailable,recalculate:unavailable,isFlask:unavailable,clearFields:unavailable,resync:unavailable,
    localSeat:unavailable,provisioning:unavailable,rememberSlot:unavailable,preferencesDirty:unavailable});
  const accepted=bind?actions.bind(null,request.slot as number,request.skillId as string|null):actions.swap(null,request.a as number,request.b as number);
  const changed=before.some((skill,index)=>skill!==body.skills[index]);
  return{accepted,changed,needsSave:changed,events,bar:body.skills.map(skill=>skill?.def.id??null)};
}
