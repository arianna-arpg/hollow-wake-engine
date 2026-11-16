import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine} from '../src/sim/arena';
import {MONSTERS} from '../src/data/monsters';
import {ATTRIBUTE_BEQUESTS, ATTRIBUTE_BEQUEST_IDS} from '../src/engine/bequests';
import {STATUS_RELAYS, STATUS_RELAY_IDS} from '../src/engine/reception';

// Capture initialized authored data only. Startup is an observation dependency,
// never code to be imported by the installed combat package.
bootSimEngine();
function data(value: unknown, at: string): void {
  if (value === undefined || value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {assert(Number.isFinite(value), at); return;}
  assert(typeof value === 'object', 'Executable or unsupported registry value: ' + at);
  assert(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null, at);
  for (const [key, child] of Object.entries(value)) data(child, at + '.' + key);
}
const registries = {monsters: MONSTERS, bequests: ATTRIBUTE_BEQUESTS, bequestIds: ATTRIBUTE_BEQUEST_IDS, relays: STATUS_RELAYS, relayIds: STATUS_RELAY_IDS};
data(registries, 'combat');
writeFileSync(process.argv[2], JSON.stringify({originalOnly: true, registries,
  courses: [{name: 'initialized-combat-registries', monsters: Object.keys(MONSTERS).length,
    bequests: ATTRIBUTE_BEQUEST_IDS.length, relays: STATUS_RELAY_IDS.length}]}));
