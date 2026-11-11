export interface SummonBirthPoint {x:number;y:number}
export interface SummonBirthShape {maxActive:number;size:number;life:number;damage:number}
export interface SummonBirthSkill<C> {def:{id:string;color:C};companionGrant?:boolean}
export interface SummonBirthShell {lifeFraction:number;sizeScaling?:number;arcDeg:number;regenDelay:number;regenFraction:number;reformFraction:number;strikeSkill:string;shellVisual?:string}
export interface SummonBirthKit {
 shell?:SummonBirthShell;crewSkills?:string[];crewAuras?:string[];
 crewRules?:{monsterIds:string[];skills?:string[];replace?:{from:string;to:string}[]}[];
 strikeRelease?:{skill:string};
}
export interface SummonBirthDelivery<M,T> extends SummonBirthKit {
 type:'summon';monsterId?:string;pool?:{id:string;weight:number}[];maxActive:number;poolGroup?:string;
 persistent?:{reserve:number;respawnTime:number;toggle?:boolean};duration?:number;
 crewMods?:M[];crewInherit?:{stat:string;fromStat:string;ratio:number;offset?:number;kind:'flat'|'more';tags?:T}[];
 crewOnDeath?:unknown[];escort?:{distance:number};decay?:{delay?:number;frac:number;growth:number};devour?:{interval:number};
}
export interface SummonBirthAura<M> {radius:number;allyMods?:M[]}
export interface SummonBirthAuraState<S,F,M> {inst:S;spec:F;allyMods?:M[];radius:number;shape:number;remaining:number;reserved:number;pulseTimer:number;affected:Set<number>;since?:number}
export interface SummonBirthActor<A,S,D extends SummonBirthDelivery<M,T>,F,M,T,C> {
 dead:boolean;team:unknown;level:number;tier:number;life:number;mana:number;reservedMana:number;pos:SummonBirthPoint;radius:number;facing:number;
 shape:unknown;color:C;look?:unknown;material?:unknown;noBounty:boolean;lifelineId?:number;
 sourceSkillId?:string;sourcePoolGroup?:string;summonInst?:S;summonOffspring?:boolean;summonDeathActions?:D['crewOnDeath'];
 summonEscort?:D['escort'];summonShell?:D['shell'];summonShells?:Set<A>;skills:(S|null)[];untargetable:boolean;invulnerable:boolean;
 shellGuard?:{side:'front'|'rear'|'all';arcDeg:number;max:number;pool:number;shellVisual?:string;regenDelay:number;regenRate:number;reformFraction?:number;lastHitAt:number;broken:boolean;color:C};
 decay?:{t:number;dps0:number;growth:number};explodeOnDeath:number;explodeOnLowLife:number;undyingTime:number;bloomIn:number;lifespan:number;manaReserved:number;
 deathHealPct:number;deathHealFlat:number;expiryTriggersDeath:boolean;devour?:{spec:NonNullable<D['devour']>;next:number};activeAuras:Map<string,SummonBirthAuraState<S,F,M>>;
}
export interface SummonBirthContext<T,M> {tags:T;extra:M[]}
export interface SummonBirthOverrides<D> {monsterId?:string;pos?:SummonBirthPoint;delivery?:D;dmgMult?:number;noReplace?:boolean;offspring?:SummonBirthShape}
export interface SummonBirthPorts<A extends{team:unknown},S extends SummonBirthSkill<C>,D,F,M,T,C,B,Q> {
 delivery(inst:S):D|undefined;context(inst:S):Q;
 stat(actor:A,key:string,context:Q,base?:number):number;
 /** Return a fresh ordered snapshot. The command consumes and filters it. */
 minionsOfSkill(owner:A,id:string):A[];minionsOfGroup(owner:A,group:string):A[];
 releaseContract(body:A,scheduleRespawn:false):void;kill(body:A,silent:true):void;
 reservation(owner:A,inst:S,delivery:D):number;maxMana(actor:A):number;availableMaxMana(actor:A):number;cannotSustain(actor:A):void;
 random(min:number,max:number):number;createMonster(id:string,level:number,team:A['team'],owner:A):A;
 lifeline(owner:A):number|undefined;mimicsOwner(id:string):boolean;
 modifier(key:string,kind:'flat'|'more',value:number,tags?:T):M;setSource(actor:A,key:string,modifiers:M[]):void;
 definition(id:string):S['def']|undefined;makeSkill(def:S['def'],level:number,sockets:0):S;
 forwardSockets(inst:S,skills:(S|null)[]):void;inheritStats(body:A,owner:A,inst:S):void;
 maxLife(actor:A):number;applyBloom(actor:A,duration:number):void;fillResources(actor:A):void;
 clamp(point:SummonBirthPoint,radius:number,mover:A):SummonBirthPoint;actors():A[];
 trackStrikeRelease(owner:A,body:A):void;activateCrewAura(body:A,inst:S):void;attachTethers(body:A,inst:S,owner:A):void;
 arrivalDamage(point:SummonBirthPoint,radius:number,amount:number,color:C,team:A['team'],tier:number):void;
 distance(a:SummonBirthPoint,b:SummonBirthPoint):number;heal(actor:A,amount:number):number;healingText(point:SummonBirthPoint,amount:number):void;mendFlash(point:SummonBirthPoint):void;
 sockets(inst:S):{def:{devour?:D extends{devour?:infer V}?V:never;minionAura?:F}}[];
 spawnBuff(inst:S):B|undefined;addBuff(actor:A,buff:B):void;auraPool(inst:S):F[]|undefined;pick(pool:F[]):F;
 time():number;accrueSummon(actor:A):void;presenceArrival(actor:A,owner:A,inst:S):boolean;arrivalFlash(point:SummonBirthPoint,radius:number,color:C):void;
}
/** Replacements read the original kit. Later matching rules win; additions keep
 * authored order and share the same de-duplication as native/strike skills. */
export function summonBirthKitIds(d:SummonBirthKit,monsterId:string,native:string[]):string[]{
 let ids=d.shell?[d.shell.strikeSkill]:[...native];
 const rules=(d.crewRules??[]).filter(r=>r.monsterIds.includes(monsterId));
 ids=ids.map(id=>rules.flatMap(r=>r.replace??[]).reverse().find(r=>r.from===id)?.to??id);
 return[...new Set([...ids,...(d.strikeRelease?[d.strikeRelease.skill]:[]),...(d.crewSkills??[]),...(d.crewAuras??[]),...rules.flatMap(r=>r.skills??[])])];
}
/** Ordered synchronous birth over borrowed state. The host owns the actual body
 * factory, death, placement and presentation. Exceptions retain earlier writes;
 * this command neither clones a World nor offers an atomic save transaction. */
export class SummonBirth<A extends SummonBirthActor<A,S,D,F,M,T,C>,S extends SummonBirthSkill<C>,D extends SummonBirthDelivery<M,T>,F extends SummonBirthAura<M>,M,T,C,B,Q> {
 constructor(private readonly p:SummonBirthPorts<A,S,D,F,M,T,C,B,Q>){}
 spawn(caster:A,inst:S,overrides?:SummonBirthOverrides<D>):A|null {
  const requested=overrides?.delivery,d=requested??this.p.delivery(inst);if(!d||(requested!=null&&d.type!=='summon'))return null;
  const context=this.p.context(inst);
  const maxActive=Math.max(1,Math.round(this.p.stat(caster,'minionMaxCount',this.p.context(inst),d.maxActive)));
  const existing=inst.companionGrant?[]:d.poolGroup?this.p.minionsOfGroup(caster,d.poolGroup):this.p.minionsOfSkill(caster,inst.def.id);
  if(overrides?.offspring){
   if(this.p.minionsOfSkill(caster,inst.def.id).filter(a=>a.summonOffspring).length>=overrides.offspring.maxActive)return null;
   existing.length=0;
  }else for(let i=existing.length-1;i>=0;i--)if(existing[i]!.summonOffspring)existing.splice(i,1);
  if(overrides?.noReplace&&existing.length>=maxActive)return null;
  while(existing.length>=maxActive){const oldest=existing.shift();if(oldest){this.p.releaseContract(oldest,false);this.p.kill(oldest,true);}}
  let reserve=0;
  if(d.persistent&&!d.persistent.toggle){reserve=this.p.reservation(caster,inst,d);if(caster.reservedMana+reserve>this.p.maxMana(caster)){this.p.cannotSustain(caster);return null;}}
  const typeId=overrides?.monsterId??this.rollType(d),minion=this.p.createMonster(typeId,caster.level,caster.team,caster);
  minion.noBounty=true;minion.lifelineId=this.p.lifeline(caster);
  if(this.p.mimicsOwner(typeId)){minion.shape=caster.shape;minion.color=caster.color;minion.radius=caster.radius;minion.facing=caster.facing;minion.look=caster.look;minion.material=caster.material;}
  minion.sourceSkillId=inst.def.id;minion.sourcePoolGroup=d.poolGroup;minion.summonInst=inst;minion.summonOffspring=!!overrides?.offspring;minion.summonDeathActions=d.crewOnDeath;
  if(overrides?.offspring){minion.radius*=overrides.offspring.size;this.p.setSource(minion,'summon:offspring',[this.p.modifier('life','more',overrides.offspring.life-1),this.p.modifier('damage','more',overrides.offspring.damage-1)]);}
  minion.summonEscort=d.escort;minion.summonShell=d.shell;
  if(d.shell){(caster.summonShells??=new Set()).add(minion);minion.skills=[];minion.untargetable=true;minion.invulnerable=true;}
  const crewIds=summonBirthKitIds(d,typeId,minion.skills.flatMap(s=>s?[s.def.id]:[]));
  minion.skills=minion.skills.filter(s=>!s||crewIds.includes(s.def.id));
  for(const sid of crewIds)if(this.p.definition(sid)&&!minion.skills.some(s=>s?.def.id===sid))minion.skills.push(this.p.makeSkill(this.p.definition(sid)!,1+Math.floor(minion.level/4),0));
  if(d.crewMods?.length)this.p.setSource(minion,'summon:crew',d.crewMods);
  if(d.crewInherit?.length)this.p.setSource(minion,'summon:inherit',d.crewInherit.map(g=>this.p.modifier(g.stat,g.kind,this.p.stat(caster,g.fromStat,context)*g.ratio+(g.offset??0),g.tags)));
  this.p.forwardSockets(inst,minion.skills);this.p.inheritStats(minion,caster,inst);
  if(d.shell){const s=d.shell,max=Math.max(1,this.p.maxLife(minion)*s.lifeFraction*this.p.stat(caster,'guardStrength',context)*Math.pow(this.p.stat(caster,'minionSize',context),s.sizeScaling??0));minion.shellGuard={side:'front',arcDeg:s.arcDeg,max,pool:max,shellVisual:s.shellVisual,regenDelay:s.regenDelay,regenRate:max*s.regenFraction,reformFraction:s.reformFraction,lastHitAt:-999,broken:false,color:inst.def.color};}
  if(overrides?.dmgMult!==undefined&&overrides.dmgMult!==1)this.p.setSource(minion,'ramp',[this.p.modifier('damage','more',Math.min(3,Math.max(.2,overrides.dmgMult))-1)]);
  if(d.decay){const lifeMult=Math.max(.1,this.p.stat(caster,'minionLife',context));minion.decay={t:-(d.decay.delay??0),dps0:(this.p.maxLife(minion)/lifeMult)*d.decay.frac*this.p.stat(caster,'minionDecayRate',context),growth:d.decay.growth};}
  minion.explodeOnDeath=Math.max(minion.explodeOnDeath,this.p.stat(caster,'minionExplodeDeath',context));minion.explodeOnLowLife=this.p.stat(caster,'minionExplodeLowLife',context);minion.undyingTime=this.p.stat(caster,'minionUndying',context);
  {const bloom=this.p.stat(caster,'minionBloom',context);if(bloom>0){minion.bloomIn=bloom;this.p.applyBloom(minion,bloom);}}
  if(d.duration)minion.lifespan=d.duration*this.p.stat(caster,'effectDuration',context);
  if(reserve>0){minion.manaReserved=reserve;caster.reservedMana+=reserve;caster.mana=Math.min(caster.mana,this.p.availableMaxMana(caster));}
  this.p.fillResources(minion);minion.tier=caster.tier;
  const angle=this.p.random(0,Math.PI*2);
  minion.pos=overrides?.pos?this.p.clamp({x:overrides.pos.x,y:overrides.pos.y},minion.radius,minion):this.p.clamp({x:caster.pos.x+Math.cos(angle)*50,y:caster.pos.y+Math.sin(angle)*50},minion.radius,minion);
  if(minion.summonShell){minion.pos={...caster.pos};minion.facing=caster.facing;}
  this.p.actors().push(minion);
  if(d.strikeRelease)this.p.trackStrikeRelease(caster,minion);
  for(const sid of d.crewAuras??[]){const auraInst=minion.skills.find(s=>s?.def.id===sid);if(auraInst)this.p.activateCrewAura(minion,auraInst);}
  this.p.attachTethers(minion,inst,caster);
  {const impact=this.p.stat(caster,'summonImpact',this.p.context(inst));if(impact>0)this.p.arrivalDamage({x:minion.pos.x,y:minion.pos.y},70,this.p.maxLife(minion)*impact,inst.def.color,caster.team,caster.tier);}
  {
   const current=this.p.context(inst);minion.deathHealPct=this.p.stat(caster,'minionDeathHeal',current);minion.deathHealFlat=this.p.stat(caster,'minionDeathHealFlat',current);minion.expiryTriggersDeath=this.p.stat(caster,'minionExpiryIsDeath',current)>0;
   const mend=this.p.stat(caster,'summonMend',current);
   if(mend>0){for(const ally of this.p.actors()){if(ally.dead||ally.team!==caster.team)continue;if(this.p.distance(minion.pos,ally.pos)>90)continue;const got=this.p.heal(ally,mend);if(got>.5)this.p.healingText(ally.pos,got);}this.p.mendFlash({x:minion.pos.x,y:minion.pos.y});}
  }
  {const devour=d.devour??this.p.sockets(inst).find(s=>s.def.devour)?.def.devour;if(devour)minion.devour={spec:devour,next:this.p.time()+devour.interval};}
  {const buff=this.p.spawnBuff(inst);if(buff)this.p.addBuff(minion,buff);}
  {const pool=this.p.auraPool(inst);if(pool&&pool.length){const spec=this.p.pick(pool);minion.activeAuras.set(inst.def.id+':gift',{inst,spec,allyMods:spec.allyMods,radius:spec.radius,shape:0,remaining:Infinity,reserved:0,pulseTimer:0,affected:new Set(),since:this.p.time()});}}
  for(const socket of this.p.sockets(inst)){if(!socket.def.minionAura)continue;minion.activeAuras.set(inst.def.id+':legion',{inst,spec:socket.def.minionAura,radius:socket.def.minionAura.radius*this.p.stat(caster,'aoeRadius',this.p.context(inst)),shape:0,remaining:Infinity,reserved:0,pulseTimer:0,affected:new Set()});break;}
  this.p.accrueSummon(minion);if(!this.p.presenceArrival(minion,caster,inst))this.p.arrivalFlash({x:minion.pos.x,y:minion.pos.y},20+minion.radius,inst.def.color);
  return minion;
 }
 private rollType(d:D):string {
  if(d.pool&&d.pool.length){let total=0;for(const p of d.pool)total+=p.weight;let roll=this.p.random(0,total);for(const p of d.pool){roll-=p.weight;if(roll<=0)return p.id;}return d.pool[d.pool.length-1]!.id;}
  return d.monsterId!;
 }
}
