/** Authored November combat extensions. Hooks retain the original phase order;
 * the shared hit graph still owns packet preparation, landing and statuses. */
export function installPrototypeHitPorts(w, ports, q) {
  for(const group of ['sequences','challenges','companions','guards','procDelivery'])ports[group].sourceBuff=(effect,skill)=>w.prototypeMechanics.buffWithSource(effect,skill);
  ports.procDelivery.damageText=(...args)=>w.damageText(...args);
  ports.reactions.damageCue=(target,dealt,result)=>w.damageText(target,dealt,result.crit?'#ffd24a':'#ffffff',result.crit?18:13,'dmg');
  ports.aftermath.currentLifeDamageCue=(target,amount)=>w.damageText(target,amount,'#ffe14a',13,undefined,{x:target.pos.x,y:target.pos.y-12});
  ports.statusEffects.damageText=(actor,amount,color,size,height)=>w.damageText(actor,amount,color,size,undefined,height===undefined?undefined:{x:actor.pos.x,y:actor.pos.y-height});
  ports.challenges.initializeCreeper=(actor,spec)=>{actor.look=spec.look??q.SECONDARY_LOOKS.pursuer;actor.fillResources();};
  ports.statusDelivery.enemies=(actor,tier)=>w.enemiesOf(actor,tier);
  ports.statusDelivery.damageText=(...args)=>w.damageText(...args);
  ports.statusDelivery.flash=(at,radius,color,life,tier)=>w.flashes.push({pos:{...at},radius,color,life,maxLife:life,
    ...(tier!==undefined?{recoveryCueTier:tier}:{})});
  ports.preparation.power = (actor, inst, target) => w.cohortArts.power(actor, inst, target);
  ports.preparation.vulnerability = (target, inst, packet) => {
    for (const status of target.statuses) {
      const rule = q.STATUS_DEFS[status.id]?.hitVulnerability;
      if (rule && rule.skills.includes(inst.def.id) && packet.amounts[rule.type])
        packet.amounts[rule.type] *= 1 + status.stacks * rule.perStack * (status.power ?? 1);
    }
  };
  ports.landing.blocked = (target, caster) => w.cohortArts.block(target, caster);
  ports.landing.landed = (caster, inst, target, result, before) => {
    const dealt = result.total, lifeLost = Math.min(dealt, Math.max(0, before - Math.max(0, target.life)));
    if (dealt > 0 || result.poiseBroke) w.battleDoctrines.hit(caster, inst, target, !!result.poiseBroke);
    w.summonArts.hit(caster, inst, target, lifeLost);
    w.frameArts.landed(caster, inst, target, dealt);
    w.cohortArts.landed(caster, inst, target, lifeLost);
  };
  ports.aftermath.projectileLanded = (...args) => w.projectileArts.landed(...args);
  ports.aftermath.echoCeiling=(actor,inst)=>w.echoCeiling(actor,inst);
  ports.aftermath.echoSource=(buff,inst)=>w.prototypeMechanics.buffWithSource(buff,inst);
  ports.statuses.chanceBonus = (inst, status) => w.projectileArts.chance(inst, status);
  ports.statuses.basis = (...args) => w.projectileArts.basis(...args);
  ports.statuses.source = (caster, inst) => ({...w.summonArts.statusSource(caster, inst),
    ...(inst.cohortCast?.statusKey ? {sourceKey: inst.cohortCast.statusKey} : {})});
  ports.statuses.applied = (...args) => w.projectileArts.applied(...args);
}
