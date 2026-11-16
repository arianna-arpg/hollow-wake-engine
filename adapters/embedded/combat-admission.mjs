const deliveries = new Set('aura blink carom cone construct dash detonate detonateProjectile ground leap mark melee nova projectile self storm summon target'.split(' '));
const effects = new Set('absorb birth buff cleanse commandMinions companionStance conjure damage detonateMinions dragCorpses drainCharge gainCharge grabSeize grabThrow guardSurge heal ironWard kindle knockback litePour lure mimicSelect minionCast payLedger possess possessEnd pull recallImpales recallMinions reduceCooldowns relocateConstruct restore restoreOverTime restoreSkillCharges rupture shapeshift shatterConstructs shed siphonOrb siphonStatus spawnCorpse spawnZone spreadStatus status tame terrain throngDirect townPortal transfuseStatus vent ward whistleCompanion'.split(' '));
const projectileGeometry = 'arena segsHittable segR viewRectFor doodadsAt doodadRuleOf popBrittle blocksProjectiles hitSurfaceOf shapeContains pushOutOfShape shotGrid shotElev castGridRay groundAt'.split(' ');
const fieldEffects = {terrain: 'terrain', conjure: 'conjure', kindle: 'kindle', vent: 'vent', townPortal: 'portal'};
// Capability structure depends on definitions, supports and trees, not numeric
// skill levels. Omitting levels closes recursive payload graphs without
// repeatedly compounding inherited level bonuses during capability inspection.
const keyOf = i => [i.def.id, i.treeNodes ?? [],
  i.sockets?.map(s => s && [s.def.id, s.level, s.forwarded, s.forwardScale, s.rolled]), i.grafts?.map(s => [s.def.id, s.level, s.rolled]), i.extraMods ?? [], i.comboTreeMods ?? []];

/** INTERNAL pre-payment capability admission. No targeting, spatial calls,
 * random draws, lazy skill caches, resources or actor writes are allowed here.
 * Mutable instances are deliberately re-read; CharacterLive retains their
 * identities while replacing supports, trees and grants. */
export function createCombatAdmission(content, host) {
  const q = {...content.queries, ...content.hitQueries};
  const procIds = q.PROC_LIST.map(row => row.id), riderIds = q.PROC_RIDER_LIST.map(row => row.id);
  const neutral = q.makeSkillInstance({id:'__capability_probe',name:'Capability probe',tags:[],delivery:{type:'self'},effects:[],manaCost:0,cooldown:0,useTime:0},1);
  function inspect(actor, root) {
    if (!root?.def || typeof root.def.id !== 'string') return {code: 'invalid-skill'};
    const pending = [root], seen = new Set(), queued = new Set([JSON.stringify(keyOf(root))]);
    let bodies;
    const enqueue = child => {const key = JSON.stringify(keyOf(child)); if (!queued.has(key)) {queued.add(key); pending.push(child);}};
    const missing = (service, skill) => ({code: 'missing-host-service', service, skill});
    const require = (group, name, skill) => typeof host[group]?.[name] === 'function' ? null : missing(group + '.' + name, skill);
    const refs = (value, add, walked = new Set()) => {
      if (typeof value === 'string') {
        if (q.SKILLS[value]) add(value);
        if (q.MONSTERS[value] && !bodies.has(value)) {
          bodies.add(value);
          const body = q.MONSTERS[value];
          refs([body.skills, body.parts, body.deathBurst, body.grants], add, walked);
          // Native kits can add deliveries through pinned trees, probabilistic
          // grants and boon grafts. Inspect every authored possibility without
          // rolling a body or touching the host. Admission is conservative.
          for(const skillId of new Set([...(body.skills??[]),...(body.grants??[]).map(g=>g.skill).filter(Boolean)])) {
            const def=q.SKILLS[skillId];if(!def)continue;
            const child=q.makeSkillInstance(def,1);child.treeNodes=body.skillTrees?.[skillId];
            for(const g of body.grants??[])if(g.support&&q.SUPPORTS[g.support]&&(!g.on||g.on===skillId))
              child.sockets.push({def:q.SUPPORTS[g.support],level:1});
            enqueue(child);
            for(const boon of body.boons??[])for(const option of q.CHOICE_GROUPS[boon.group]?.options??[]) {
              const graft=option.graft&&q.SUPPORTS[option.graft.support];
              enqueue({...child,extraMods:option.mods??[],...(graft?{grafts:[{def:graft,level:option.graft.level??1}]}:{})});
            }
          }
        }
        return;
      }
      if (!value || typeof value !== 'object' || walked.has(value)) return;
      walked.add(value);
      for (const [key, child] of Object.entries(value)) {
        if (['description', 'name', 'label', 'state', 'tree', 'skillTree', 'owner', 'caster'].includes(key)) continue;
        refs(child, add, walked);
      }
    };
    for (let cursor = 0; cursor < pending.length; cursor++) {
      if (cursor >= 4096) return {code: 'content-graph-limit', skill: root?.def?.id};
      const inst = pending[cursor];
      if (!inst?.def || typeof inst.def.id !== 'string') return {code: 'invalid-skill'};
      const id = inst.def.id, key = JSON.stringify(keyOf(inst));
      if (seen.has(key)) continue;
      seen.add(key);
      // A body reached with different inherited investment must be inspected
      // again. The cycle guard belongs to this payload, not the entire request.
      bodies = new Set();
      const d = q.instanceDelivery(inst), fx = q.instanceEffects(inst);
      if (!deliveries.has(d?.type)) return {code: 'unsupported-delivery', skill: id, family: d?.type};
      for (const row of fx) if (!effects.has(row?.type)) return {code: 'unsupported-effect', skill: id, family: row?.type};
      if (d.type === 'projectile') for (const name of projectileGeometry) {const why = require('space', name, id); if (why) return why;}
      if (['dash', 'carom', 'blink', 'leap'].includes(d.type)) {
        for (const name of ['travelHit', 'shotElev']) {const why = require('space', name, id); if (why) return why;}
      }
      const fields = [];
      if (d.leaveTerrain) fields.push('terrain');
      if (d.trailVent) fields.push('vent');
      if (d.trailConjure || (['dash', 'blink', 'leap'].includes(d.type)
        && actor.sheet.get('cloudTrail', q.skillContextTags(inst), q.instanceMods(inst)) > 0)) fields.push('conjure');
      for (const name of fields) {const why = require('fields', name, id); if (why) return why;}
      for (const row of fx) {
        if (fieldEffects[row.type]) {const why = require('fields', fieldEffects[row.type], id); if (why) return why;}
        if (row.type === 'commandMinions' && !content.staticRules.commandKinds.includes(row.command ?? 'assault')) return {code: 'unsupported-command', skill: id, family: row.command};
      }
      for (const row of d.crewOnDeath ?? []) if (row.do !== 'summon' || !row.inheritSummon)
        return {code: 'unsupported-death-action', skill: id, family: row.do};
      // Materialize disposable payload descriptions only. No shared cursor or
      // relocation ledger is touched by inspecting a possible continuation.
      const add = childId => {
        const child = q.makeSkillInstance(q.SKILLS[childId], q.effectiveSkillLevel(inst));
        child.sockets = inst.sockets; child.grafts = inst.grafts;
        enqueue(child);
      };
      refs([d, fx, q.instanceFollowUps(inst), q.instanceMetas(inst), q.instanceConvert(inst), inst.def.comboChain,
        q.instanceBirth(inst), q.instanceSummon(inst), q.instanceTurret(inst), q.instanceBrood(inst), q.instanceSequel(inst),
        q.instanceTrail(inst), q.instanceFissureTrail(inst), q.instanceThrongSources(inst)], add);
      if (inst.def.invokes && actor.runes?.length) {
        const rule = q.resolveInvocation(actor.runes);
        if (rule && q.SKILLS[rule.skillId]) enqueue(q.makeInvocationPayload(inst, q.SKILLS[rule.skillId], actor.runes.at(-1)));
      }
      if (inst.def.mimic) for (const row of actor.mimicBank ?? []) if (q.SKILLS[row.sid]) add(row.sid);
      // Both global and skill-local proc modifiers may introduce another cast
      // or a host field service. Read armed families without rolling them.
      const extra = q.instanceMods(inst);
      const ids = [...actor.sheet.armedFamily('proc_', procIds, extra)];
      const procSeen = new Set(ids);
      const grantedProcs = value => {
        if(!value||typeof value!=='object')return;
        if(typeof value.stat==='string'&&value.stat.startsWith('proc_')&&value.value>0){
          const procId=value.stat.slice(5);if(q.PROCS[procId]&&!procSeen.has(procId)){procSeen.add(procId);ids.push(procId);}
        }
        for(const child of Object.values(value))grantedProcs(child);
      };
      // A cast can grant the very proc that later needs a world provider.
      // Check that future contribution before the granting cast can pay.
      // The structural graph deliberately coalesces numeric skill levels.
      // Include future level/threshold proc declarations so that coalescing
      // cannot hide a provider introduced at a higher inherited payload level.
      grantedProcs([fx,inst.def.leveling,inst.def.thresholds,
        ...[...(inst.sockets??[]),...(inst.grafts??[])].filter(Boolean).map(s=>[s.def.leveling,s.def.thresholds])]);
      for (const procId of ids) {
        const proc = q.PROCS[procId]; if (!proc) continue;
        grantedProcs(proc.effect);
        if (proc.effect.type === 'kindle' || proc.effect.type === 'vent') {
          const why = require('fields', proc.effect.type === 'kindle' ? 'lightwell' : 'vent', id); if (why) return why;
        }
        refs(proc.effect, add);
      }
      const riders = actor.sheet.armedFamily('procRider_', riderIds, extra);
      for (const rider of q.PROC_RIDER_LIST) if (riders.includes(rider.id)) refs(rider.cast, add);
    }
    return null;
  }
  return Object.freeze({inspect, inspectActor: actor => inspect(actor,neutral),
    admit: (w, actor, skill, aim) => {
      if (!aim || !Number.isFinite(aim.x) || !Number.isFinite(aim.y)) return false;
      const refusal = inspect(actor, skill);
      if (!refusal) return true;
      w.signal('combat-refused', refusal); return false;
    },
  });
}
