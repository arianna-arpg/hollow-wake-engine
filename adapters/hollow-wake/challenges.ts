import {Challenges as Controller} from '@hollow-wake/engine/combat/challenges';
import {Actor} from './actor';
import type {World} from './world';
import {mod,type Modifier} from './stats';
import {skillDamageBands} from './damage';
import {instanceMods,makeSkillInstance,skillContextTags,type SkillInstance,type ConstructDelivery} from './skills';
import {challengeOf} from './challengeSpec';
import {SKILLS} from '../data/skills';

export class Challenges extends Controller<Actor,SkillInstance,Modifier,
 World['projectiles'][number],World['pendingRepeats'][number],World['pendingFuses'][number],World['zones'][number],ConstructDelivery> {
 constructor(w:World) {
  super({
   get time(){return w.time;},
   get actors(){return w.actors;},set actors(v){w.actors=v;},
   get projectiles(){return w.projectiles;},set projectiles(v){w.projectiles=v;},
   get pendingRepeats(){return w.pendingRepeats;},set pendingRepeats(v){w.pendingRepeats=v;},
   get pendingFuses(){return w.pendingFuses;},set pendingFuses(v){w.pendingFuses=v;},
   get zones(){return w.zones;},set zones(v){w.zones=v;},
   get flashes(){return w.flashes;},set flashes(v){w.flashes=v;},
   spec:challengeOf,random:()=>Math.random(),tags:skillContextTags,modifiers:instanceMods,
   modifier:mod,damageBands:skillDamageBands,createSkill:makeSkillInstance,deviceCall:SKILLS.goad_device_call,
   allocate:(name,team,pos)=>new Actor(name,team,pos),
   text:(...args)=>w.text(...args),enemiesOf:a=>w.enemiesOf(a),clampPos:(...args)=>w.clampPos(...args),
   spawnProjectile:(...args)=>w.spawnProjectile(...args),spawnConstruct:(...args)=>w.spawnConstruct(...args),
   executeSkill:(...args)=>w.executeSkill(...args),challengeBurst:(...args)=>w.challengeBurst(...args),
   challengeHit:(...args)=>w.challengeHit(...args),retireOwnedZone:z=>w.retireOwnedZone(z),
  });
 }
}
