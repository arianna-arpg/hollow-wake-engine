import {CasterEffects} from '../../dist/caster-effects.js';

export function installCombatCaster(w, content, recovery, fields, controls, orders) {
  const q = {...content.queries, ...content.hitQueries};
  return new CasterEffects({...recovery, ...controls, ...orders, fields: fields.cast, mimic: w.mimic,
    statuses: {siphon: (...args) => w.statusDelivery.siphon(...args), recall: (...args) => w.statusDelivery.recall(...args)},
  }, {
    time: () => w.time, actorById: id => w.actorById(id), controller: actor => w.seatOf(actor), hasHome: seat => !!seat.home,
    fuse: q.instanceFuse, fuseDelay: (actor, tags, modifiers) => actor.sheet.get('fuseDelay', tags, modifiers),
    bankBuff: row => {w.pendingFuses.push(row);},
    fuseTell: (actor, inst, label) => w.text({x: actor.pos.x, y: actor.pos.y - actor.radius - 10}, label, inst.def.color, 11),
    definition: id => q.SKILLS[id],
    mimicSelected: (actor, definition) => w.text({x: actor.pos.x, y: actor.pos.y - 24}, definition.name, definition.color, 12),
    mimicEmpty: actor => w.failNote(actor, 'mimic:none', 'no art captured'),
    guardSurged: (actor,tier) => {
      w.text(actor.pos, 'TRANSGRESSION!', '#8ab8d8', 14, 'combat');
      w.flashes.push({...(tier!==undefined?{recoveryCueTier:tier}:{}),pos: {...actor.pos}, radius: actor.radius + 16, color: '#8ab8d8', life: .3, maxLife: .3});
    },
  });
}
