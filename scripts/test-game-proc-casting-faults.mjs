import {procCastingDecision} from '../adapters/hollow-wake/integrate-proc-casting.mjs';
import {verifyInstalledProcFaults} from './verify-installed-proc-faults.mjs';

const faults = [
  ['multiplier', 'runtime', 'spec.mult ?? 1', '(spec.mult ?? 1) * 2', 'cast-captured-multiplier'],
  ['shared-launch', 'runtime', 'payload, from, direction,', 'payload, ports.copyPosition(from), direction,', 'cast-shared-spawn-position'],
  ['synthetic-depth', 'binding', 'procChainDepth: depth', 'procChainDepth: 0', 'cast-real-flight'],
  ['anchor-lock', 'binding', 'hits.set(anchor.id, Infinity)', 'hits.set(-1, Infinity)', 'cast-projectile-target'],
  ['fan-direction', 'binding', 'bearing + radians', 'bearing - radians', 'cast-spread-60-3'],
  ['held-world', 'world', 'return this.engineProcCasting.held(actor, skillId);', 'return null;', 'cast-own-bar'],
  ['cast-world-depth', 'world', 'this.engineProcCasting.cast(caster, inst, target, depth, cast, aim)', 'this.engineProcCasting.cast(caster, inst, target, depth + 1, cast, aim)', 'cast-real-flight'],
  ['learned-binding', 'binding', 'seat.meta.knownSkills.get(id)', 'undefined', 'cast-own-learned'],
];

verifyInstalledProcFaults({label:'proc-casting',decisionKey:'procCastingDecision',decision:procCastingDecision,binding:'procCasting',faults});
