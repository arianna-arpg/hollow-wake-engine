import type {ChallengeSpec} from './challenge-types.js';

export interface ChallengeContentInstance {
  def: {tree?: unknown};
  treeNodes?: readonly string[];
}
export interface ChallengeContentPorts<I extends ChallengeContentInstance> {
  patch(definition: I['def'], nodeId: string): ChallengeSpec | undefined;
}
export interface ChallengeDeviceDelivery {
  type: 'construct'; kind: 'pylon'; look: 'construct_totem';
  range: number; duration: number; maxActive: number; life: number;
  placeRange: number; interval: number; taunt: true; castSkillId: 'goad_device_call';
}

/** Ordered assembly over trusted, shared authored definitions. Patches are
 * borrowed, including their nested rows; this is not an untrusted-data parser.
 * No actor, selection, compiled specification or delivery is cached. */
export class ChallengeContent<I extends ChallengeContentInstance> {
  constructor(private readonly ports: ChallengeContentPorts<I>) {}

  spec(inst: I): ChallengeSpec | undefined {
    if (!inst.def.tree || !inst.treeNodes?.length) return undefined;
    let out: ChallengeSpec | undefined;
    for (const id of [...inst.treeNodes].sort()) {
      const patch = this.ports.patch(inst.def, id);
      if (patch) Object.assign(out ??= {}, patch);
    }
    return out;
  }

  delivery(inst: I): ChallengeDeviceDelivery | undefined {
    const s = this.spec(inst), d = s?.device;
    return d ? {type: 'construct', kind: 'pylon', look: 'construct_totem', range: d.radius,
      duration: d.duration, maxActive: s.deviceCap ?? 1, life: d.life, placeRange: d.range,
      interval: d.interval, taunt: true, castSkillId: 'goad_device_call'} : undefined;
  }
}
