import type {SkillMergePlan} from './skill-actions.js';

export interface SkillMergeExecutionPorts<Seat,Item,Skill,Support> {
  nearFont(seat:Seat):boolean;
  mergePlan(seat:Seat,skillId:string,rarity:string):SkillMergePlan<Item,Skill>;
  fail(seat:Seat,key:string,reason:string):void;
  sockets(item:Item):readonly (Support|null)[]|undefined;
  remove(seat:Seat,item:Item):void;
  grantSkill(seat:Seat,skill:Skill):void;
  grantSupport(seat:Seat,support:Support):void;
  markCharacterDirty():void;
  announceMerge(seat:Seat,skill:Skill):void;
}

/** Shared ordered body. The owning action supplies bound callbacks and guards
 * reentrancy; all returned sockets are admitted before donor removal begins. */
export function executeSkillMerge<S,T,I,G>(p:SkillMergeExecutionPorts<S,T,I,G>,seat:S,skillId:string,rarity:string):boolean {
  if(!p.nearFont(seat))return false;
  const plan=p.mergePlan(seat,skillId,rarity);
  if(plan.refusal||!plan.result){p.fail(seat,'fontmerge:'+skillId,plan.refusal??'Merging is unavailable.');return false;}
  const returned:G[]=[];
  for(const item of plan.returnSockets){const sockets=p.sockets(item);if(!sockets)return false;for(const support of sockets)if(support)returned.push(support);}
  for(const item of plan.taken)p.remove(seat,item);
  p.grantSkill(seat,plan.result);for(const support of returned)p.grantSupport(seat,support);
  p.markCharacterDirty();p.announceMerge(seat,plan.result);return true;
}
