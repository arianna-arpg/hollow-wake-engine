import type {AttackSequenceSpec, SequenceMeleeDelivery, SequenceProjectileDelivery, SequenceSkill} from './attack-sequence-types.js';

export type SequencePayloadDefinition<F, M, Tag, D> = Omit<F,
  'tree' | 'attackSequence' | 'trigger' | 'delivery' | 'tags' | 'innateMods' | 'leveling' | 'thresholds' |
  'cooldown' | 'manaCost' | 'useTime' | 'effects' | 'followUp' | 'castCycle'> & {
  tree: undefined; attackSequence: undefined; trigger: undefined;
  delivery: D; tags: Tag[]; innateMods: M[]; leveling: {perLevel: M[]}; thresholds: undefined;
  cooldown: number; manaCost: number; useTime: number; effects: {type: 'damage'}[];
  followUp: undefined; castCycle: undefined;
};
export interface AttackSequenceContentPorts<I extends SequenceSkill<I, M, Tag, D>, M, Tag extends string, D extends {type: string}> {
  patch(definition: I['def'], nodeId: string): AttackSequenceSpec<M, D> | undefined;
  innateMods(instance: I): M[];
  tags(instance: I): ReadonlySet<Tag>;
  make(definition: SequencePayloadDefinition<I['def'], M, Tag, D>, level: number): I;
}

/** Stateless assembly over a host's shared skill compiler. The owned sweep-tag
 * vocabulary is content configuration; no selected skill or actor is cached. */
export class AttackSequenceContent<
  I extends SequenceSkill<I, M, Tag, D>, M, Tag extends string, D extends {type: string}
> {
  private readonly sweepTags: readonly Tag[];
  constructor(private readonly ports: AttackSequenceContentPorts<I, M, Tag, D>, sweepTags: readonly Tag[]) {
    this.sweepTags = [...sweepTags];
  }
  spec(inst: I): AttackSequenceSpec<M, D> | undefined {
    if (inst.sequenceRole === 'payload') return undefined;
    let out = inst.def.attackSequence && {...inst.def.attackSequence};
    for (const id of [...(inst.treeNodes ?? [])].sort()) {
      const patch = this.ports.patch(inst.def, id);
      if (patch) {
        const {castSweeps, ...fields} = patch;
        Object.assign(out ??= {}, fields);
        if (castSweeps) out.castSweeps = [...(out.castSweeps ?? []), ...castSweeps];
      }
    }
    return out;
  }
  delivery(inst: I): (D & SequenceProjectileDelivery) | undefined {
    if (inst.sequenceRole) return undefined;
    return this.spec(inst)?.thrown;
  }
  payload(host: I, delivery: D, tags?: Tag[]): I {
    const definition: I['def'] = host.def;
    const inst = this.ports.make({...definition, tree: undefined, attackSequence: undefined, trigger: undefined,
      delivery, tags: tags ?? [...this.ports.tags(host)], innateMods: this.ports.innateMods(host),
      leveling: {perLevel: []}, thresholds: undefined, cooldown: 0, manaCost: 0, useTime: 0,
      effects: [{type: 'damage'}], followUp: undefined, castCycle: undefined}, 1);
    inst.sockets = [...host.sockets]; inst.grafts = host.grafts && [...host.grafts];
    inst.sequenceHost = host.sequenceHost ?? host; inst.sequenceRole = 'payload'; inst.procChainDepth = 1;
    return inst;
  }
  sweeps(host: I): I[] {
    return (this.spec(host)?.castSweeps ?? []).map(sweep => this.sweep(host, sweep.delivery));
  }
  sweep(host: I, delivery: D & SequenceMeleeDelivery): I {
    const inst = this.payload(host, delivery, [...this.sweepTags]);
    inst.level = host.level; inst.bonusLevels = host.bonusLevels;
    inst.procChainDepth = Math.max(host.procChainDepth ?? 0, host.state?.trigDepth ?? 0);
    return inst;
  }
  statuses(inst: I): string[] {
    const spec = this.spec(inst);
    return spec?.rhythm ? ['bleed', 'impaled'] : spec?.recovery || spec?.impactBleed ? ['bleed'] : [];
  }
}

/** Original authoring diagnostic, preserving its recursive nonnegative-number
 * policy and modifier exemption. This is not a general untrusted-input parser. */
export function attackSequenceErrors(spec: AttackSequenceSpec<unknown, {type: string}>): string[] {
  const errors: string[] = [];
  const scan = (value: unknown, path: string): void => {
    if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) errors.push(`invalid attackSequence.${path}`);
    if (value && typeof value === 'object') for (const [key, field] of Object.entries(value)) if (key !== 'mods') scan(field, path + '.' + key);
  };
  scan(spec, '');
  if (spec.hitCycle && (!Number.isInteger(spec.hitCycle.max) || spec.hitCycle.max < 1)) errors.push('invalid attackSequence hit-cycle maximum');
  if (spec.cycleMax !== undefined && (!Number.isInteger(spec.cycleMax) || spec.cycleMax < 1)) errors.push('invalid attackSequence cycle maximum');
  if (spec.flightRain && spec.flightRain.interval <= 0) errors.push('attackSequence rain requires a positive interval');
  if (spec.bounce && (spec.bounce.seconds <= 0 || spec.bounce.radius <= 0)) errors.push('attackSequence bounce requires positive time and radius');
  if (spec.catchBuff && (!Number.isInteger(spec.catchBuff.max) || spec.catchBuff.max < 1 || spec.catchBuff.repeatInterval <= 0)) errors.push('invalid attackSequence catch rhythm');
  if (spec.thrown && (spec.thrown.speed <= 0 || spec.thrown.range <= 0 || spec.thrown.radius <= 0)) errors.push('invalid attackSequence projectile');
  return errors;
}
