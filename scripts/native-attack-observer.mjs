// Test-only adaptation of the frozen capturePack observer. Generator frames live
// on an explicit heap stack, so recording deeply nested data during a combat
// callback does not consume additional recursive QuickJS/native stack frames.
// Child visits still run depth first, preserving identity and getter order.
export function createNativeAttackCapturePack(CaptureActor, captureActorRef, captureId) {
  return function capturePack(input) {
    const seen = new WeakMap();
    function* visit(value, at) {
      if (value === undefined) return {$undefined: true};
      if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0)))
        return {$number: Object.is(value, -0) ? '-0' : String(value)};
      if (typeof value === 'function') return {$callable: value.name};
      if (value === null || typeof value !== 'object') return value;
      if (value instanceof CaptureActor) return captureActorRef(value);
      const prior = seen.get(value);
      if (prior !== undefined) return {$ref: prior};
      seen.set(value, at);
      if (value instanceof Set) {
        const items = [...value], out = [];
        for (let i = 0; i < items.length; i++) out.push(yield {value: items[i], at: at + '/' + i});
        return {$set: out};
      }
      if (value instanceof Map) {
        const items = [...value], out = [];
        for (let i = 0; i < items.length; i++) {
          const [k, v] = items[i];
          out.push([yield {value: k, at: at + '/' + i + '/key'}, yield {value: v, at: at + '/' + i + '/value'}]);
        }
        return {$map: out};
      }
      if (Array.isArray(value)) {
        const out = new Array(value.length);
        for (let i = 0; i < out.length; i++) if (i in value) out[i] = yield {value: value[i], at: at + '/' + i};
        return out;
      }
      if (value.def && typeof value.def === 'object' && Array.isArray(value.sockets) && typeof value.level === 'number') {
        const inst = value, d = inst.def;
        return {
          skill: captureId(inst),
          definition: yield {value: {id:d.id,name:d.name,tags:d.tags,delivery:d.delivery,attackSequence:d.attackSequence,
            trigger:d.trigger,innateMods:d.innateMods,leveling:d.leveling,thresholds:d.thresholds,cooldown:d.cooldown,manaCost:d.manaCost,
            useTime:d.useTime,effects:d.effects,followUp:d.followUp,castCycle:d.castCycle,baseDamage:d.baseDamage}, at:at+'/definition'},
          level:inst.level,bonusLevels:inst.bonusLevels,
          treeNodes:yield {value:inst.treeNodes,at:at+'/treeNodes'},
          sockets:yield {value:inst.sockets.map(s=>s&&{id:s.def.id,level:s.level,rolled:s.rolled}),at:at+'/sockets'},
          grafts:yield {value:inst.grafts?.map(s=>({id:s.def.id,level:s.level,rolled:s.rolled})),at:at+'/grafts'},
          extraMods:yield {value:inst.extraMods,at:at+'/extraMods'},
          sequenceRole:inst.sequenceRole,sequenceHost:inst.sequenceHost?captureId(inst.sequenceHost):null,procChainDepth:inst.procChainDepth,
          stateIdentity:inst.state?captureId(inst.state):null,state:yield {value:inst.state,at:at+'/state'},
        };
      }
      const entries = Object.entries(value), out = [];
      for (const [key, child] of entries) out.push([key, yield {value:child,at:at+'/'+key}]);
      return Object.fromEntries(out);
    }
    const pending = [visit(input, '$')];
    let result;
    while (pending.length) {
      const step = pending[pending.length - 1].next(result);
      result = undefined;
      if (step.done) { pending.pop(); result = step.value; }
      else pending.push(visit(step.value.value, step.value.at));
    }
    return result;
  };
}
