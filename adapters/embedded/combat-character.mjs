/** Connect the memory-only character owner to existing combat identities.
 * Investment preparation remains off the frame path. No account/save service. */
export function combatCharacter(owner, content, admission, kit, character, actor, seat) {
  const {w} = owner, q = {...content.queries, ...content.hitQueries};
  if (kit.rules.contentId !== content.characterBuildId) throw Error('Character and combat content mismatch');
  let sourceOrder = [], captured = [];
  const find = id => seat.meta.knownSkills.get(id) ?? seat.grantedInsts?.get(id);
  const materialize = row => {
    const def = q.SKILLS[row.id]; if (!def) throw Error('Unknown character combat skill: ' + row.id);
    const inst = q.makeSkillInstance(def, row.level);
    inst.bonusLevels = row.bonus; inst.treeNodes = row.tree?.slice();
    const gem = s => s && {def: q.SUPPORTS[s.id], level: s.level, ...(s.rolled ? {rolled: {...s.rolled}} : {})};
    inst.sockets = row.sockets.map(gem); inst.grafts = row.grafts?.map(gem);
    return inst;
  };
  function check(change) {
    // A cold stat fork retains transient combat contributions without lending
    // them to the character builder or mutating live investment/skill caches.
    const candidate = Object.create(actor); candidate.sheet = actor.sheet.fork();
    for (const id of sourceOrder) candidate.sheet.setSource(id, []);
    for (const [id, mods] of change.build.sources) candidate.sheet.setSource(id, mods);
    const nativeWhy=admission.inspectActor(candidate);if(nativeWhy)return nativeWhy;
    for (const [, row] of [...change.build.known, ...change.build.grants, ...change.build.companions]) {
      const refusal = admission.inspect(candidate, materialize(row));
      if (refusal) return refusal;
    }
    return null;
  }
  const frame = {actor, seat, meta: seat.meta,
    attributes: (attrs, mods) => {seat.meta.attrs = attrs; actor.sheet.setSource('attributes', mods);},
    conduits: value => {actor.wornConduits = value;},
    deriveCompanions: (definitions, sourceName, relicKey) => w.companionGrants.derive(actor, definitions, sourceName,
      body => w.kill(body, true), (body, inst) => {
        const fraction = body.life / body.maxLife();
        w.relevelActor(body, actor.level); body.radius = q.MONSTERS[body.defId]?.radius ?? body.radius;
        w.bakeMinionOwnerStats(body, actor, inst); body.life = Math.min(body.maxLife(), fraction * body.maxLife());
      }, relicKey),
    deactivateAura: id => w.deactivateAura(actor, id), dismissSummon: id => w.dismissSummonToggle(actor, id),
    syncGuard: () => w.guardArts.sync(actor), refreshBonds: () => w.companionBonds.refresh(actor),
  };
  const publisher = kit.live(frame, {
    retire(inst) {
      if (actor.activeAuras.get(inst.def.id)?.inst === inst) w.deactivateAura(actor, inst.def.id);
      if (actor.summonToggles.get(inst.def.id)?.inst === inst) w.dismissSummonToggle(actor, inst.def.id);
      w.clearSummonTreeBodies(actor, inst); w.clearTreeFields(actor, inst);
      if (actor.casting?.inst === inst) actor.casting = null;
    },
    event(event) {
      const inst = event.skillId ? find(event.skillId) : undefined;
      switch (event.kind) {
        case 'text': w.text({x:actor.pos.x + event.offset.x,y:actor.pos.y + event.offset.y},event.message,event.color,event.size,event.category); break;
        case 'capture-summons': captured = w.actors.filter(a => !a.dead && a.owner === actor && !a.construct && !a.companion && a.summonInst); break;
        case 'dismiss': w.dismissSummonToggle(actor, event.skillId); break;
        case 'clear-summons': if (inst) w.clearSummonTreeBodies(actor, inst); break;
        case 'clear-fields': if (inst) w.clearTreeFields(actor, inst); break;
        case 'resync-supports': if (inst) w.resyncMinionSupports(inst); break;
        case 'resync-owned-supports': for (const s of [...seat.meta.knownSkills.values(), ...(seat.grantedInsts?.values() ?? [])]) w.resyncMinionSupports(s); break;
        case 'refresh-captured-summons':
          for (const a of captured) {
            if (a.dead) continue;
            const s = a.summonInst;
            if (s.def.throng || s.def.hivecall) w.bakeMinionOwnerStats(a, actor, s, s.def.throng ? q.batchScaleOf(s.def.throng) : 1);
            else {
              const inherited = w.minionInheritance.resolve(actor, s, a.defId);
              a.sheet.setSource('owner', inherited.ownerMods); a.sheet.setSource('minionCombat', inherited.combatMods);
              a.guardMode = inherited.guard; w.applyMinionPlyBonus(a, inherited.plyBonus);
              w.bequests.sync(a, s.relicSource ? q.RELIQUARY_CFG.minion.ordinaryStats : 1, inherited.tags, inherited.extra);
            }
            a.life = Math.min(a.life, a.maxLife());
          }
          captured = []; break;
        case 'reset-trigger': if (inst) {if (event.changed && inst.state) {delete inst.state.triggerOff; delete inst.state.trigDepth;} delete inst.replenishmentPaused;} break;
        case 'awaken': if (inst) {
          (inst.state ??= {}).treeAwokeAt = w.time;
          w.flashes.push({pos: {...actor.pos}, radius: actor.radius + 14, color: '#d8b86a', life: .9, maxLife: .9});
        } break;
        case 'level-up': if (!actor.downed && !actor.dead) {actor.life = actor.maxLife(); actor.mana = actor.availableMaxMana();} break;
        // Hired campaign company is an optional game consequence, separate
        // from skill-owned companions (which are derived above).
        case 'refresh-company': w.observers.refreshCompany?.(actor); break;
      }
      w.signal('character-event', {actor: actor.id, event: structuredClone(event)});
    },
  });
  const current = character.current(), refusal = check(current);
  if (refusal) throw Error('Combat admission: ' + JSON.stringify(refusal));
  return {
    view() {
      const skill = s => s ? {id: s.def.id, level: s.level, bonus: s.bonusLevels,
        sockets: s.sockets.map(g => g ? {id: g.def.id, level: g.level, ...(g.locked ? {locked: true} : {}), ...(g.rolled ? {rolled: g.rolled} : {})} : null),
        tree: s.treeNodes, grafts: s.grafts?.map(g => ({id: g.def.id, level: g.level})), host: s.grantedHostUid, source: s.grantedBy} : null;
      return structuredClone({bar: actor.skills.map(skill), known: [...seat.meta.knownSkills].map(([id,s]) => [id,skill(s)]),
        grants: [...(seat.grantedInsts ?? [])].map(([id,s]) => [id,skill(s)]),
        companions: [...(owner.lifetimes.grantState(actor).grants ?? [])].map(([id,row]) => [id,skill(row.inst)]),
        equipped: seat.meta.equipped, attrs: seat.meta.attrs,
        sources: sourceOrder.map(id => [id,actor.sheet.getSourceMods(id)]), ...(actor.wornConduits ? {conduits: actor.wornConduits} : {})});
    },
    initialize() {publisher.initialize(current); sourceOrder = current.data.sourceOrder.slice(); actor.fillResources();},
    check(change) {for (const step of character.previewSteps(change)) {const why = check(step); if (why) return why;} return null;},
    commit(change) {character.commit(change, {publish(step) {publisher.publish(step); sourceOrder = step.data.sourceOrder.slice();}});},
  };
}
