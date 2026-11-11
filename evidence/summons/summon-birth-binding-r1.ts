 private engineSummonBirth=new EngineSummonBirth<Actor,SkillInstance,SummonDelivery,AuraDelivery['aura'],Modifier,SkillTag[],string,BuffEffect>({
  delivery:i=>{const d=instanceDelivery(i);return d.type==='summon'?d:undefined;},context:i=>({tags:skillContextTags(i),extra:instanceMods(i)}),
  stat:(a,key,c,base)=>a.sheet.get(key,c.tags,c.extra,base),minionsOfSkill:(a,id)=>this.minionsOfSkill(a,id),minionsOfGroup:(a,g)=>this.minionsOfGroup(a,g),
  releaseContract:(a,schedule)=>this.releaseContract(a,schedule),kill:(a,silent)=>this.kill(a,silent),reservation:(a,i,d)=>summonReservationUnit(a,i,d),
  maxMana:a=>a.maxMana(),availableMaxMana:a=>a.availableMaxMana(),cannotSustain:a=>this.text(a.pos,'cannot sustain','#d05050',12),
  random:(min,max)=>rand(min,max),createMonster:(id,level,team,owner)=>this.createMonster(id,level,team,owner),lifeline:a=>this.conjurationLifeline(a),mimicsOwner:id=>!!MONSTERS[id]?.mimicOwnerForm,
  modifier:(key,kind,value,tags)=>mod(key,kind,value,tags),setSource:(a,key,mods)=>a.sheet.setSource(key,mods),definition:id=>SKILLS[id],makeSkill:(d,level,sockets)=>makeSkillInstance(d,level,sockets),
  forwardSockets:(i,skills)=>this.forwardSummonSockets(i,skills),inheritStats:(a,owner,i)=>this.bakeMinionOwnerStats(a,owner,i),maxLife:a=>a.maxLife(),
  applyBloom:(a,seconds)=>a.applyStatus('blooming',0,seconds/(STATUS_DEFS.blooming?.duration||1),'bloom'),fillResources:a=>a.fillResources(),
  clamp:(point,radius,mover)=>this.clampPos(point,radius,undefined,{mover}),actors:()=>this.actors,
  trackStrikeRelease:(owner,body)=>{let bodies=this.strikeReleaseBodies.get(owner);if(!bodies)this.strikeReleaseBodies.set(owner,bodies=new Set());bodies.add(body);},
  activateCrewAura:(a,i)=>{if(i.def.delivery.type==='aura')this.activateAura(a,i,i.def.delivery,a.sheet.get('aoeRadius',skillContextTags(i),instanceMods(i)));},
  attachTethers:(a,i,owner)=>this.attachObjectTethers(a,i,owner),arrivalDamage:(point,radius,amount,color,team,tier)=>this.burstDamage(point,radius,amount,'physical',color,team,tier),
  distance:(a,b)=>dist(a,b),heal:(a,n)=>a.healBy(n),healingText:(pos,n)=>this.text(pos,'+'+Math.round(n),'#8ae0a8',10),mendFlash:pos=>{this.flashes.push({pos,radius:90,color:'#8ae0a8',life:.25,maxLife:.25});},
  sockets:i=>hostSockets(i),spawnBuff:i=>socketSpec(i,'spawnBuff'),addBuff:(a,b)=>a.addBuff(b),auraPool:i=>socketSpec(i,'minionAuraPool'),pick:pool=>pick(pool),
  time:()=>this.time,accrueSummon:a=>this.sim.deadwakeField?.accrue('summon',isDeathAligned(a.faction)),presenceArrival:(a,owner,i)=>this.presenceArrival(a,owner,i),
  arrivalFlash:(pos,radius,color)=>{this.flashes.push({pos,radius,color,life:.35,maxLife:.35});},
 });
 private engineSummonOffspring=new EngineSummonOffspring<Actor,SkillInstance,SummonDelivery>({
  delivery:i=>{const d=instanceDelivery(i);return d.type==='summon'?d:undefined;},random:(min,max)=>rand(min,max),spawn:(a,i,o)=>this.spawnMinion(a,i,o),
 });
