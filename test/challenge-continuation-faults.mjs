export const challengeContinuationFaults = [
  {name: 'lost-absolute-deadline', module: 'challenge-continuation', from: 'guaranteedAt: original.guaranteedAt', to: 'guaranteedAt: 0'},
  {name: 'lost-secondary-generation', module: 'challenge-continuation', from: 'generation: original.generation', to: 'generation: 0'},
  {name: 'shared-orbit-ledger', module: 'challenge-continuation', from: 'orbitTargets: new Set(original.orbitTargets)', to: 'orbitTargets: original.orbitTargets'},
  {name: 'lost-retired-identity', module: 'challenge-continuation', from: 'if (known) knownCasts.set(target, cast(known));', to: 'if (known && !known.state.retired) knownCasts.set(target, cast(known));'},
  {name: 'revived-retired-state', module: 'challenge-continuation', from: 'retired: original.retired', to: 'retired: false'},
  {name: 'shared-policy', module: 'challenge-continuation', from: 'spec: spec(original.spec)', to: 'spec: original.spec'},
  {name: 'shared-delivery', module: 'challenge-continuation', from: 'd: delivery(value.d)', to: 'd: value.d'},
  {name: 'lost-shocks', module: 'challenge-continuation', from: 'shocks, used: true', to: 'shocks: [], used: true'},
  {name: 'lost-pursuer-slot', module: 'challenge-continuation', from: 'effigies.set(original, target); return target;', to: 'if (target.creeper === undefined) delete target.creeper; effigies.set(original, target); return target;'},
  {name: 'lost-admission-marker', module: 'challenges', from: 'this.used = true;', to: 'this.used = false;'},
  {name: 'reusable-import', module: 'challenge-continuation', from: 'shocks, used: true', to: 'shocks, used: false'},
  {name: 'collapsed-cast-alias', module: 'challenge-continuation', from: 'casts.set(original, target); return target;', to: 'return target;'},
];
