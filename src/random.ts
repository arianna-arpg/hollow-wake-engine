import type { RandomState } from './types.js';
import { integer } from './validation.js';

/** Instance-local stream with an explicit continuation state. Zero seed retains the reference convention. */
export class Random {
  private state: number;
  private count = 0;
  constructor(seed: number) {
    integer(seed, 0, 'seed');
    if (seed > 0xffffffff) throw new Error('Seed must be uint32');
    this.state = seed === 0 ? 0x9e3779b9 : seed;
  }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    this.count++;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  get draws(): number { return this.count; }
  snapshot(): RandomState { return { algorithm: 'mulberry32/v1', state: this.state, draws: this.count }; }
  static restore(snapshot: RandomState): Random {
    if (snapshot.algorithm !== 'mulberry32/v1') throw new Error('Unsupported random algorithm');
    integer(snapshot.state, 0, 'random state'); integer(snapshot.draws, 0, 'random draws');
    if (snapshot.state > 0xffffffff) throw new Error('Random state must be uint32');
    const random = new Random(snapshot.state);
    random.state = snapshot.state; // A zero continuation state is valid; only seeds normalize zero.
    random.count = snapshot.draws;
    return random;
  }
}
