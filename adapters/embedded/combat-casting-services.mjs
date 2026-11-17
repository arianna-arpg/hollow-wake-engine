import {SkillRequest} from '@hollow-wake/engine/casting/request';
import {SkillDispatch} from '@hollow-wake/engine/casting/dispatch';
import {CastingContinuation} from '@hollow-wake/engine/casting/continuation';
import {guardAiHold} from '@hollow-wake/engine/casting/guard';
import {stampSkillCooldown, refundSkillCooldown} from '@hollow-wake/engine/combat/cooldown-lifecycle';
import {combatCastingBindings} from './combat-casting-bindings.mjs';

/** Internal composition. Public command/content admission must precede request,
 * including all nested payloads; a request itself may already consume resources. */
export function installCombatCasting(w, content) {
  const q = content.hitQueries;
  const bindings = combatCastingBindings(w, q);
  if(content.prototypeMechanics)bindings.dispatch.strikeTimings=q.instanceStrikeTimings;
  if(content.prototypeMechanics)bindings.request.resolve=(actor,inst,aim,seatPress)=>{
    const frame=w.frameArts.view(actor,inst);
    if(frame){if(!w.frameArts.ready(actor,inst)||w.castSealed(actor,inst))return false;inst=frame;}
    inst=w.cohortArts.view(actor,inst);
    const command=w.summonArts.commandView(actor,inst);
    if(command)return w.summonArts.commandReady(actor,inst)&&w.useSkill(actor,command,aim,seatPress);
    if(inst.def.delivery.type==='summon'){
      const delivery=q.instanceDelivery(inst);
      if(delivery.type==='summon'&&!w.summonArts.canSpawn(actor,inst,delivery))return false;
    }
    return inst;
  };
  w.skillInstances = bindings.instances;
  w.sdkSkillRequest = new SkillRequest(bindings.request);
  const dispatch = new SkillDispatch(bindings.dispatch);
  const continuation = new CastingContinuation(bindings.continuation, {
    channelGrace: q.LOS_CFG.channelGrace, focusSlack: q.CONCENTRATION_CFG.slack,
  });
  w.sdkGuardCasting = () => bindings.guard;
  w.sdkChannelCasting = () => bindings.channel;
  w.sdkChargedCasting = () => bindings.charged;
  w.refreshGuardBash = (actor, state) => bindings.guard.refresh(actor, state);
  w.aiHoldOf = guardAiHold;
  w.aiNeedsFireLine = (actor, inst) => w.host.intent?.needsFireLine?.(actor.id, inst.def.id) ?? false;
  w.castPress = actor => continuation.press(actor);
  w.castSealed = (actor, inst) => bindings.intent.castSealed(actor, inst);
  w.castReqRefusal = (actor, inst) => w.battleDoctrines?.refusal(actor, inst) ?? bindings.intent.requirementRefusal(actor, inst);
  w.comboCursorOf = (actor, inst) => bindings.instances.cursor(actor, inst);
  w.comboStepOf = (actor, inst, index) => bindings.instances.step(actor, inst, index);
  w.mintMetaInstance = (actor, inst, id) => bindings.instances.meta(actor, inst, id);
  w.sdkAmmunitionPress = {
    bank: (actor, inst) => actor.skillChargeBank(inst),
    spend: (actor, inst) => actor.spendSkillCharge(inst),
    finalRoundDamage: (actor, inst) => actor.sheet.get('finalRoundDamage', q.skillContextTags(inst.def), q.instanceMods(inst)),
    stampCooldown: (actor, inst, duration) => w.stampSkillCooldown(actor, inst, duration),
  };
  const cooldowns = {price: content.queries.skillCooldownSeconds, ultimateCap: () => Infinity};
  w.stampSkillCooldown = (actor, inst, duration) => stampSkillCooldown(actor, inst, duration, cooldowns);
  w.refundSkillCooldown = refundSkillCooldown;
  w.updateCasting = (actor, dt) => continuation.advance(actor, dt);
  // The owning session supplies its validated wrapper as useSkill. Redirects
  // and proc casts must enter that same admission boundary.
  return Object.freeze({...bindings, dispatch, continuation});
}
