import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine} from '../src/sim/arena';
import {PROCS,PROC_LIST,PROC_RIDER_LIST} from '../src/data/procs';
bootSimEngine();
function data(value:unknown):void {
 if(value===undefined||value===null||typeof value==='string'||typeof value==='boolean')return;
 if(typeof value==='number'){assert(Number.isFinite(value));return;}
 assert(typeof value==='object','Executable proc registration');
 assert(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
 for(const child of Object.values(value))data(child);
}
const registries={procs:PROCS,procIds:PROC_LIST.map(p=>p.id),procRiders:PROC_RIDER_LIST};data(registries);
assert.deepEqual(new Set(registries.procIds),new Set(Object.keys(PROCS)));
writeFileSync(process.argv[2],JSON.stringify({originalOnly:true,registries,courses:[{name:'initialized-procs',procs:PROC_LIST.length,riders:PROC_RIDER_LIST.length}]}));
