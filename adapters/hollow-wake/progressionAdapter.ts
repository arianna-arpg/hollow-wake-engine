import {CharacterProgression,ProgressionHost,type ProgressionPack} from '@hollow-wake/engine/character/progression';
import {PROGRESSION} from '../data/classes';
import {CLASS_LEVEL_MILESTONES} from '../meta/account';
import {catalogLevelMilestones,catalogClassLevelMilestones} from '../meta/unlocks';
import {reliquaryExperience} from './accountReliquary';
import {relicPowerActive} from './relicPower';
import type {Actor} from './actor';
import type {World,Seat} from './world';

const sourceExperience=PROGRESSION.xpForLevel,sourcePoints=PROGRESSION.passivePointsAtLevel;
const equal=(a:readonly number[],b:readonly number[])=>a.length===b.length&&a.every((v,i)=>v===b[i]);
/** Cache immutable compiled policy per class, refreshing numeric edits and
 * observed milestone arrays without serializing the entire content catalog. */
export function createProgressionHost(world:World,blessingFraction:number):ProgressionHost<Seat,Actor>{
 const cache=new Map<string,{values:number[];global:number[];standing:number[];classLevels:number[];rules:CharacterProgression}>();
 const rules=(seat:Seat)=>{
  if(PROGRESSION.xpForLevel!==sourceExperience||PROGRESSION.passivePointsAtLevel!==sourcePoints)throw new Error('Progression function changed; recompile its explicit SDK policy');
  const id=seat.meta.classDef.id,global=catalogLevelMilestones(),standing=CLASS_LEVEL_MILESTONES,classLevels=catalogClassLevelMilestones(id),hit=cache.get(id);
  const {startingPassivePoints,passivePointsPerLevel,lifePerLevel,manaPerLevel}=PROGRESSION;
  if(hit&&hit.values[0]===startingPassivePoints&&hit.values[1]===passivePointsPerLevel&&hit.values[2]===lifePerLevel&&hit.values[3]===manaPerLevel&&equal(hit.global,global)&&equal(hit.standing,standing)&&equal(hit.classLevels,classLevels))return hit.rules;
  const pack:ProgressionPack={schemaVersion:1,capability:'character-progression/v1',contentId:'hollow-wake-live-progression:'+id,
   tuning:{startingPassivePoints,passivePointsPerLevel,lifePerLevel,manaPerLevel,accuracyPerLevel:4,experience:{scale:45,exponent:1.55}},
   milestones:[5,100,10,20,30,40,50,60,70,80,90,...global].map(level=>({level,key:`reached_level_${level}`})),
   classes:[{id,milestones:[...new Set([...standing,...classLevels])].map(level=>({level,key:`class_${id}_level_${level}`}))}]};
  const compiled=new CharacterProgression(pack);cache.set(id,{values:[startingPassivePoints,passivePointsPerLevel,lifePerLevel,manaPerLevel],global:[...global],standing:[...standing],classLevels:[...classLevels],rules:compiled});return compiled;
 };
 return new ProgressionHost<Seat,Actor>({
  state:seat=>seat.meta,hero:seat=>world.seatHero(seat),classId:seat=>seat.meta.classDef.id,eligible:seat=>!seat.actor.dead&&!seat.merc,rules,
  blessing:()=>world.mireilleXpBuff>0?blessingFraction:0,
  experienceMultiplier:(seat,hero)=>reliquaryExperience(seat.meta.containers.reliquary??[],relicPowerActive(hero,seat.meta.relicEnabled)),
  markDirty:seat=>world.markMetaDirty(seat),recalculate:seat=>world.recalcSeat(seat),fillResources:hero=>hero.fillResources(),
  announce:seat=>world.text(seat.actor.pos,'LEVEL UP!','#ffd700',24),local:seat=>seat===world.localSeat,
  resyncMercenary:()=>world.resyncMercenary(),accountOwned:seat=>world.accountSeat(seat),ledger:()=>world.ledger,
 });
}
