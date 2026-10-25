// Raw original proc and rider definitions. Data is not executable capability proof.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine} from '../src/sim/arena';
import {PROCS,PROC_LIST,PROC_RIDERS,PROC_RIDER_LIST,procStat,procPowerStat,procRiderStat} from '../src/data/procs';
import {STAT_DEFS,StatSheet,type SkillTag} from '../src/engine/stats';import {SKILLS} from '../src/data/skills';
import {PASSIVE_NODES} from '../src/data/passives';
import {DEFENSE_CFG} from '../src/engine/defense';
bootSimEngine();const omissions:string[]=[];
function data(value:unknown,at:string,parents=new Set<object>()):unknown{
 if(value===undefined){omissions.push(at);return undefined;}
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(typeof value!=='object')throw new Error('Nonportable proc data at '+at);
 if(parents.has(value))throw new Error('Cyclic proc data at '+at);parents.add(value);
 let result:unknown;
 if(Array.isArray(value)){const children:unknown[]=[];for(let index=0;index<value.length;index++){if(!(index in value)||value[index]===undefined)throw new Error('Sparse proc data at '+at);children.push(data(value[index],at+'/'+index,parents));}result=children;}
 else{if(Object.getPrototypeOf(value)!==Object.prototype)throw new Error('Nonplain proc data at '+at);result=Object.fromEntries(Object.entries(value).map(([key,child])=>[key,data(child,at+'/'+key,parents)]).filter(([,child])=>child!==undefined));}
 parents.delete(value);return result;
}
assert.equal(new Set(PROC_LIST.map(p=>p.id)).size,PROC_LIST.length);
assert.deepEqual(PROC_LIST.map(p=>p.id),Object.keys(PROCS));
assert(PROC_LIST.every(p=>PROCS[p.id]===p&&STAT_DEFS[procStat(p.id)]&&STAT_DEFS[procPowerStat(p.id)]));
assert.deepEqual(PROC_RIDER_LIST.map(p=>p.id),Object.keys(PROC_RIDERS));
assert(PROC_RIDER_LIST.every(p=>PROC_RIDERS[p.id]===p));
const missingRiderDisplayStats=PROC_RIDER_LIST.filter(p=>!STAT_DEFS[procRiderStat(p.id)]).map(p=>p.id);
assert.deepEqual(missingRiderDisplayStats,['static_shrapnel']);
const sheet=new StatSheet(),riderStat=procRiderStat('static_shrapnel'),ungranted=sheet.get(riderStat);
assert.equal(ungranted,0);const passive=PASSIVE_NODES.cl_gam_shrapnel;assert(passive.mods);sheet.setSource('authored-rider-passive',passive.mods);
const spell=sheet.get(riderStat,new Set<SkillTag>(['spell'])),attack=sheet.get(riderStat,new Set<SkillTag>(['attack']));
assert.equal(spell,.75);assert.equal(attack,0);
const procs=PROC_LIST.map((p,index)=>({id:p.id,ordinal:index,value:data(p,'procs/'+p.id)}));
const riders=PROC_RIDER_LIST.map((p,index)=>{const hosts=Array.isArray(p.proc)?p.proc:[p.proc];assert(hosts.every(id=>!!PROCS[id]));assert(SKILLS[p.cast.skillId]);return {id:p.id,ordinal:index,value:data(p,'riders/'+p.id)};});
const result={schemaVersion:1,kind:'authored-proc-catalogue',source:'hollow-wake-frozen-baseline',procs,riders,ruleConfiguration:data(DEFENSE_CFG.procs,'rules'),omissions,riderStatObservation:{missingDisplayDefinitions:missingRiderDisplayStats,stat:riderStat,ungranted,authoredPassive:'cl_gam_shrapnel',spell,attack,explanation:'The original StatSheet accepts unregistered stat names with a zero base. The authored spell-scoped passive grants the rider chance; no new default is invented.'},scope:'Preserved original definitions and insertion order. Rider host/skill references, ordinary proc display stats and the unregistered rider-stat behavior checked. This is not proof that all effects execute in the standalone SDK.'};
assert(process.argv[2]);fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');
