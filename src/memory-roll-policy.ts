/** Authored rows are supplied in registry order from validated content. This
 * specialization is only for Memory-only minting: the chosen gem is discarded.
 * Compile once for a captured account/party/zone context, then consume exactly
 * the original selection and rarity draws without allocating throwaway gems. */
export interface MemoryRollDefinition {
 readonly id:string;readonly tags:readonly string[];readonly weight:number;readonly min:number;readonly noDrop?:boolean;
}
export interface MemoryRollContent {
 readonly skills:readonly MemoryRollDefinition[];readonly supports:readonly MemoryRollDefinition[];readonly starters:ReadonlySet<string>;
 readonly rules:{readonly tagWeights:Readonly<Partial<Record<string,number>>>;readonly biasMult:number;readonly floorMult:number;readonly carriedMult:number};
}
export interface MemoryRollContext {
 readonly level:number;readonly all:boolean;readonly skills:ReadonlySet<string>;readonly supports:ReadonlySet<string>;
 readonly carriedSkills:ReadonlySet<string>;readonly carriedSupports:ReadonlySet<string>;
 readonly floor?:{readonly skills:ReadonlySet<string>;readonly supports:ReadonlySet<string>};readonly bias?:readonly string[];
}
export interface MemoryRollPlan {
 readonly skillDraws:1|2;readonly supportDraws:0|1;readonly supportAvailable:boolean;
 skill(random:()=>number):object;
 support(random:()=>number):object|null;
}
const discarded=Object.freeze({});
const weight=(n:number)=>{if(!Number.isFinite(n)||n<0)throw Error('invalid-memory-roll-weight');return n;};
const draw=(random:()=>number)=>{const n=random();if(!Number.isFinite(n)||n<0||n>=1)throw Error('invalid-memory-roll-random');};
export function compileMemoryRollPolicy(content:MemoryRollContent,context:MemoryRollContext):MemoryRollPlan {
 if(!Number.isFinite(context.level)||context.level<0)throw Error('invalid-memory-roll-level');
 const rules=content.rules;weight(rules.biasMult);weight(rules.floorMult);weight(rules.carriedMult);
 for(const n of Object.values(rules.tagWeights))if(n!==undefined)weight(n);
 const total=(rows:readonly MemoryRollDefinition[],unlocked:ReadonlySet<string>,carried:ReadonlySet<string>,floor:ReadonlySet<string>|undefined,skill:boolean,fallback=false)=>{
  let count=0,sum=0;
  for(const row of rows){
   weight(row.weight);if(!Number.isSafeInteger(row.min)||row.min<0)throw Error('invalid-memory-roll-minimum');
   if(skill&&row.noDrop)continue;
   if(fallback?!content.starters.has(row.id):(!(context.all||unlocked.has(row.id)||floor?.has(row.id))||row.min>context.level))continue;
   count++;
   // Preserve the original multiplication order, including underflow to zero.
   let n=row.weight*(floor?.has(row.id)?rules.floorMult:1);
   for(const tag of row.tags)n*=rules.tagWeights[tag]??1;
   if(context.bias&&row.tags.some(tag=>context.bias!.includes(tag)))n*=rules.biasMult;
   if(carried.has(row.id))n*=rules.carriedMult;
   sum+=weight(n);weight(sum);
  }
  return{count,sum};
 };
 let skills=total(content.skills,context.skills,context.carriedSkills,context.floor?.skills,true);
 if(!skills.count)skills=total(content.skills,context.skills,context.carriedSkills,context.floor?.skills,true,true);
 if(!skills.count)throw Error('missing-memory-roll-starter');
 const supports=total(content.supports,context.supports,context.carriedSupports,context.floor?.supports,false);
 const skillDraws=skills.sum>0?2:1,supportDraws=supports.sum>0?1:0,supportAvailable=supports.count>0;
 return Object.freeze({skillDraws,supportDraws,supportAvailable,
  skill(random:()=>number){if(skillDraws===2)draw(random);draw(random);return discarded;},
  support(random:()=>number){if(!supportAvailable)return null;if(supportDraws===1)draw(random);return discarded;}
 });
}
