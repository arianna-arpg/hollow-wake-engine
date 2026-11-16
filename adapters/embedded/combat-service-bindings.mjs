import {combatPortContracts} from './combat-port-contracts.mjs';

/** Setup-only linker. Algorithms remain in SDK services; the consuming host
 * cannot fill these ports with replacement combat rules. finish() is mandatory
 * before public admission and rejects every missing or noncallable binding.
 * Runtime calls use the linked function directly, without a proxy or lookup. */
export class CombatServiceBindings {
  #pending = [];
  #records = [];
  #finished = false;
  constructor(owner, queries) {this.owner = owner; this.queries = queries;}
  ports(contract, overrides = {}) {
    if (this.#finished) throw Error('Combat assembly is already closed');
    const names = combatPortContracts[contract];
    if (!names) throw Error('Unknown combat service contract: ' + contract);
    for (const key of Object.keys(overrides)) if (!names.includes(key)) throw Error(`Unknown combat port: ${contract}.${key}`);
    const ports = {};
    this.#records.push(ports);
    for (const name of names) {
      if (Object.hasOwn(overrides, name)) {
        if (typeof overrides[name] === 'string') {
          this.#pending.push({ports, contract, name, ownerName: overrides[name]});
          continue;
        }
        if (typeof overrides[name] !== 'function') throw TypeError(`Noncallable combat port: ${contract}.${name}`);
        ports[name] = overrides[name];
      } else if (typeof this.queries[name] === 'function') ports[name] = this.queries[name];
      else this.#pending.push({ports, contract, name});
    }
    // Constructors retain this record, but no command may use it before finish.
    return ports;
  }
  missing() {return this.#pending.filter(row => typeof this.owner[row.ownerName ?? row.name] !== 'function').map(row => `${row.contract}.${row.name} -> ${row.ownerName ?? row.name}`);}
  finish() {
    if (this.#finished) throw Error('Combat assembly is already closed');
    const missing = this.missing();
    if (missing.length) throw Error('Incomplete combat assembly: ' + missing.join(', '));
    for (const {ports, name, ownerName} of this.#pending) ports[name] = this.owner[ownerName ?? name];
    for (const ports of this.#records) Object.freeze(ports);
    this.#pending.length = 0;
    this.#records.length = 0;
    this.#finished = true;
  }
}
