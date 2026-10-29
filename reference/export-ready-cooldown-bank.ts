// Observe the original Assault controller; this helper never imports the SDK.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {bootSimEngine, makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {Actor} from '../src/engine/actor';
import {StatSheet, mod} from '../src/engine/stats';
import {makeSkillInstance, type SkillInstance} from '../src/engine/skills';
import {Assaults, ASSAULT} from '../src/engine/assault';
import {SKILLS} from '../src/data/skills';

interface Bank {owner: Actor; host: SkillInstance; bank: number}
interface Probe {court(owner: Actor, host: SkillInstance): Bank; hud(bank: Bank): void}
interface Scenario {
  name: string; mode?: 'refund' | 'command' | 'hud'; remaining?: number | null;
  amount?: number; bank?: number; patient?: boolean; recall?: boolean; base?: number;
  fault?: 'clock' | 'bank' | 'hud' | 'price';
  nestedRefund?: boolean; repriceAfterWrite?: boolean; changeBankOnRead?: boolean;
}
const scenarios: Scenario[] = [
  {name:'no-bank-node',patient:false,bank:8},
  {name:'running-partial'}, {name:'exact-expiry',amount:4},
  {name:'overshoot-never-banks',amount:8},
  {name:'already-ready',remaining:null,amount:2},
  {name:'stored-zero-ready',remaining:0,amount:2},
  {name:'negative-clock-diagnostic',remaining:-1,amount:2},
  {name:'ready-bank-cap',remaining:null,bank:31,amount:4},
  {name:'zero-refund',remaining:null,bank:3,amount:0},
  {name:'negative-refund-running-diagnostic',amount:-2},
  {name:'negative-refund-ready-diagnostic',remaining:null,bank:3,amount:-2},
  {name:'zero-price-bank',remaining:null,bank:3,amount:2,base:0},
  {name:'reduced-price-cap',remaining:null,bank:25,amount:1,base:4},
  {name:'clock-write-failure',fault:'clock'},
  {name:'bank-write-failure',remaining:0,bank:2,fault:'bank'},
  {name:'price-failure-after-delete',remaining:0,bank:2,fault:'price'},
  {name:'hud-failure-after-bank',remaining:null,amount:2,fault:'hud'},
  {name:'nested-ready-refund',remaining:null,amount:2,nestedRefund:true},
  {name:'hud-price-after-clock-write',bank:8,repriceAfterWrite:true},
  {name:'command-empty',mode:'command',bank:0},
  {name:'command-fractional',mode:'command',bank:7.5},
  {name:'command-spends-whole-units',mode:'command',bank:17},
  {name:'command-keeps-excess',mode:'command',bank:40},
  {name:'recall-preserves-bank',mode:'command',bank:17,recall:true},
  {name:'command-without-node',mode:'command',bank:17,patient:false},
  {name:'command-unit-floor',mode:'command',bank:0.35,base:0},
  {name:'command-negative-bank-diagnostic',mode:'command',bank:-2},
  {name:'command-bank-write-failure',mode:'command',bank:17,fault:'bank'},
  {name:'command-hud-write-failure',mode:'command',bank:17,fault:'hud'},
  {name:'hud-disabled',mode:'hud',bank:17,patient:false},
  {name:'hud-partial',mode:'hud',bank:4},
  {name:'hud-full',mode:'hud',bank:32},
  {name:'hud-over-cap',mode:'hud',bank:40},
  {name:'hud-unit-floor',mode:'hud',bank:0.25,base:0},
  {name:'hud-live-second-bank-read',mode:'hud',bank:4,changeBankOnRead:true},
];

bootSimEngine();
const restore = seedGlobalRandom(0xba4c), world = makeSimWorld('warrior', 0xba4c);
const rows: unknown[] = [];
try {
  assert.equal(ASSAULT.maxHits,5); assert.equal(SKILLS.command_assault.cooldown,8);
  for (const scenario of scenarios) {
    const owner = new Actor('bank-owner','player',{x:500,y:500});
    const body = new Actor('bank-recipient','player',{x:510,y:500});
    world.localSeat.actor=owner;
    const controller=new Assaults(world), probe=controller as unknown as Probe;
    owner.sheet=new StatSheet();
    owner.sheet.setSource('bank-fixture',[
      mod('cooldownRecovery','override',1),mod('addedCooldown','override',0),mod('effectDuration','override',1)]);
    const definition=scenario.base===undefined?SKILLS.command_assault:{...SKILLS.command_assault,cooldown:scenario.base};
    const host=makeSkillInstance(definition,1);
    host.treeNodes=scenario.patient===false?['killing_signal']:['patient_signal','killing_signal'];
    owner.skills=[host];
    const bank=probe.court(owner,host), events: unknown[][]=[];
    let value=scenario.bank??0, hud: Actor['assaultHud']={hits:2,progress:0.5};
    let bankReads=0, nested=false;
    Object.defineProperty(bank,'bank',{configurable:true,get(){
      const result=value;events.push(['bank','get',result]);
      if(scenario.changeBankOnRead&&++bankReads===1)value+=4;
      return result;
    },set(next:number){events.push(['bank','set',next]);if(scenario.fault==='bank')throw Error('bank rejected');value=next;}});
    Object.defineProperty(owner,'assaultHud',{configurable:true,get:()=>hud,set(next:Actor['assaultHud']){
      events.push(['hud',next??null]);if(scenario.fault==='hud')throw Error('hud rejected');hud=next;
    }});
    const remaining=scenario.remaining===undefined?4:scenario.remaining;
    owner.cooldowns=new Map(remaining===null?[]:[[host.def.id,remaining]]);
    owner.cooldownTotals=new Map([[host.def.id,8]]);
    const get=owner.cooldowns.get.bind(owner.cooldowns),set=owner.cooldowns.set.bind(owner.cooldowns),del=owner.cooldowns.delete.bind(owner.cooldowns);
    owner.cooldowns.get=id=>{const result=get(id);events.push(['clock','get',id,result??null]);return result;};
    owner.cooldowns.set=(id,seconds)=>{events.push(['clock','set',id,seconds]);if(scenario.fault==='clock')throw Error('clock rejected');
      const result=set(id,seconds);if(scenario.repriceAfterWrite)owner.sheet.setSource('reprice',[mod('addedCooldown','override',2)]);return result;};
    owner.cooldowns.delete=id=>{events.push(['clock','delete',id]);const result=del(id);
      if(scenario.nestedRefund&&!nested){nested=true;events.push(['nested','begin']);controller.refund(owner,host,1);events.push(['nested','end']);}return result;};
    const read=owner.sheet.get.bind(owner.sheet);
    owner.sheet.get=(...args)=>{const result=read(...args);events.push(['stat',args[0],args[1]?[...args[1]]:null,args[2]??null,result]);
      if(scenario.fault==='price'&&args[0]==='addedCooldown')throw Error('price rejected');return result;};
    const state=()=>({clocks:[...owner.cooldowns],totals:[...owner.cooldownTotals],bank:value,hud:hud??null,
      preparation:body.assaultPreparation?{hits:body.assaultPreparation.hits,until:body.assaultPreparation.until,policy:body.assaultPreparation.policy}:null});
    const before=state();let failure: string | null=null;
    try {
      if(scenario.mode==='command')controller.command(owner,host,[body],scenario.recall??false);
      else if(scenario.mode==='hud')probe.hud(bank);
      else controller.refund(owner,host,scenario.amount??1);
    } catch(error) {failure=(error as Error).message;}
    assert.equal(failure!==null,!!scenario.fault,scenario.name);
    const after=state();assert.deepEqual(after.totals,before.totals,scenario.name+' retains the clock denominator');
    if(scenario.name==='overshoot-never-banks')assert.equal(after.bank,0);
    if(scenario.name==='already-ready')assert.equal(after.bank,2);
    if(scenario.name==='ready-bank-cap')assert.equal(after.bank,32);
    if(scenario.name==='nested-ready-refund')assert.equal(after.bank,3);
    if(scenario.name==='command-spends-whole-units'){assert.equal(after.bank,1);assert.equal(after.preparation?.hits,3);}
    if(scenario.name==='recall-preserves-bank'){assert.equal(after.bank,17);assert.equal(after.preparation,null);}
    if(scenario.name==='command-keeps-excess'){assert.equal(after.bank,8);assert.equal(after.preparation?.hits,5);}
    if(scenario.name==='hud-live-second-bank-read')assert.deepEqual(after.hud,{hits:1,progress:0});
    rows.push({name:scenario.name,mode:scenario.mode??'refund',scenario,before,after,events,failure});
  }
} finally {restore();}
assert.equal(rows.length,35);assert(process.argv[2]);
fs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,courses:rows.length,rows},null,2)+'\n',{flag:'wx'});
