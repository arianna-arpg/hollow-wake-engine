import {procDeliveryDecision} from '../adapters/hollow-wake/integrate-proc-delivery.mjs';
import {verifyInstalledProcFaults} from './verify-installed-proc-faults.mjs';

const direct = 'private executeProc = this.engineProcDelivery.execute;';
verifyInstalledProcFaults({
  label:'proc-delivery',decisionKey:'procDeliveryDecision',decision:procDeliveryDecision,binding:'procDelivery',
  faults:world=>[
    ['power-fold','runtime','scaleProcEffect(proc.effect, power)','proc.effect','power-skill-context'],
    ['charge-threshold','runtime','?? 0) > before','?? 0) >= before','gainCharge-capped'],
    ['buff-duration','runtime',"ports.stat(caster, 'effectDuration', instance), depth + 1)",'1, depth + 1)','buff-scaled-duration'],
    ['burst-shield-flag','runtime','enemy.esBroke = false;','void 0;','burst-shield-break'],
    ['explosion-story','runtime','ports.sameStory(target, enemy)','ports.sameStory(caster, enemy)','explosion-target-story'],
    ['arc-tie','runtime','distance <= nearest','distance < nearest','arc-tie'],
    ['arc-presentation','binding','step <= 3','step <= 2','arc-tie'],
    ['summon-owner','runtime',"key = '__proc:' + proc.id, owner = caster.owner ?? caster","key = '__proc:' + proc.id, owner = caster",'summon-cap-resolved-owner'],
    ['summon-forward','binding',"w['forwardSummonSockets'](inst, summon.skills)",'void inst','summon-forwarded-support'],
    ['census-owner','binding','actor.owner === owner && !actor.dead','!actor.dead','summon-cap-other-owner'],
    ['census-dead','binding','!actor.dead && actor.sourceSkillId === key','actor.sourceSkillId === key','summon-cap-dead'],
    ['census-key','binding',' && actor.sourceSkillId === key','', 'summon-cap-other-key'],
    ['birth-host','runtime','!!target && site === target','false','birth-self-target-owner'],
    ['cleanse-class','runtime','fx.hardCC && def.hardCC','false','authored-unbound'],
    ['cast-depth','runtime','depth + 1, fx.cast, aim','depth, fx.cast, aim','authored-answering_gale'],
    world.includes(direct)
      ? ['world-depth','world',direct,'private executeProc = (...args: Parameters<typeof this.engineProcDelivery.execute>) => { args[4] = (args[4] ?? 0) + 1; return this.engineProcDelivery.execute(...args); };','extraHit-missing-instance']
      : ['world-depth','world','this.engineProcDelivery.execute(proc, caster, inst, target, depth, aim)','this.engineProcDelivery.execute(proc, caster, inst, target, depth + 1, aim)','extraHit-missing-instance'],
    ['rider-tail','binding',"w['fireProcRiders'](def, actor, inst, target, depth)",'void def','extraHit-missing-instance'],
  ],
});
