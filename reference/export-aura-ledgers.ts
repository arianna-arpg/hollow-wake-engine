// Original-only ledger phases over authored aura definitions and diagnostic rows.
// Activation, world scheduling and full death are distinct boundaries.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {bootSimEngine,makeSimWorld} from '../src/sim/arena';
import {seedGlobalRandom} from '../src/sim/rng';
import {Actor,type ActiveAura} from '../src/engine/actor';
import {StatSheet,type DamageType} from '../src/engine/stats';
import {SKILLS} from '../src/data/skills';
import {makeSkillInstance,type LedgerSpec} from '../src/engine/skills';
import {applyHit} from '../src/engine/damage';
bootSimEngine();const restore=seedGlobalRandom(0x14ed6e),rows:unknown[]=[];
function fixture(){
 const w=makeSimWorld('magician',0x14ed6e),a=new Actor('ledger bearer','enemy',{x:0,y:0}),target=new Actor('ledger target','player',{x:20,y:0});w.walk=null;w.actors=[a,target];
 for(const actor of [a,target]){actor.sheet=new StatSheet();for(const[key,value]of Object.entries({life:100,mana:100,manaRegen:0,manaRegenPct:0,lifeRegen:0,lifeRegenPct:0}))actor.sheet.setBase(key,value);actor.life=80;actor.mana=0;}
 const events:Record<string,unknown>[]=[],state={balance:0};
 return{w,a,target,state,events,result:undefined as unknown,error:undefined as string|undefined,onText:undefined as undefined|(()=>void),afterBurst:undefined as undefined|(()=>void),beforeBurst:undefined as undefined|(()=>void),onCap:undefined as undefined|(()=>void)};
}
type Context=ReturnType<typeof fixture>;
function add(c:Context,id='reclamation',patch:Partial<LedgerSpec>={},key=id):ActiveAura{
 const original=SKILLS[id].delivery;assert(original.type==='aura'&&original.ledger);
 const delivery={...original,ledger:{...original.ledger,...patch}},inst=makeSkillInstance({...SKILLS[id],id:key,delivery},1);
 const aura:ActiveAura={inst,spec:delivery.aura,radius:12,shape:0,remaining:Infinity,reserved:0,pulseTimer:0,affected:new Set(),since:0,ledger:{balance:0}};
 c.a.activeAuras.set(key,aura);return aura;
}
function hooks(c:Context){
 const{w,a,events}=c,cap=a.ledgerCap.bind(a);a.ledgerCap=spec=>{events.push({kind:'capacity',cap:spec.cap});c.onCap?.();return cap(spec);};
 const text=w.text.bind(w);w.text=(...args)=>{events.push({kind:'text',pos:{...args[0]},text:args[1],color:args[2],size:args[3],balance:c.state.balance,life:a.life,mana:a.mana});c.onText?.();return text(...args);};
 const burstHost=w as unknown as {burstDamage(pos:Actor['pos'],radius:number,amount:number,type:DamageType,color:string,team:Actor['team'],tier?:number,source?:Actor,recoveryCue?:string,visual?:string):void};
 const burst=burstHost.burstDamage.bind(w);burstHost.burstDamage=(...args)=>{events.push({kind:'burst',pos:{...args[0]},radius:args[1],amount:args[2],damageType:args[3],color:args[4],team:args[5],tier:args[6],balance:c.state.balance,mana:a.mana});c.beforeBurst?.();const result=burst(...args);c.afterBurst?.();return result;};
 const kill=w.kill.bind(w);w.kill=(...args)=>{events.push({kind:'kill',who:args[0].name,life:args[0].life,balance:c.state.balance});return kill(...args);};
 const retire=w.deactivateAura.bind(w);w.deactivateAura=(...args)=>{events.push({kind:'retire',key:args[1],mana:args[0].mana});return retire(...args);};
}
const host=(c:Context)=>c.w as unknown as {settleLedger(a:Actor,spec:LedgerSpec,state:{balance:number}):void;updateActorLedgers(a:Actor,dt:number):void};
const spec=(id='arrears',patch:Partial<LedgerSpec>={}):LedgerSpec=>{const d=SKILLS[id].delivery;assert(d.type==='aura'&&d.ledger);return{...d.ledger,...patch};};
function course(label:string,setup:(c:Context)=>void,run:(c:Context)=>void,check:(c:Context)=>void){
 const c=fixture();setup(c);hooks(c);try{run(c);}catch(error){c.error=String(error);}check(c);
 rows.push({label,result:c.result,error:c.error,state:c.state,life:c.a.life,mana:c.a.mana,dead:c.a.dead,hitFlash:c.a.hitFlash,hitFlashType:c.a.hitFlashType,targetLife:c.target.life,
  auras:[...c.a.activeAuras].map(([key,row])=>({key,balance:row.ledger?.balance,remaining:row.remaining})),events:c.events,flashes:c.w.flashes.map(f=>({pos:f.pos,radius:f.radius,color:f.color,life:f.life,maxLife:f.maxLife}))});
}
const okay=(c:Context)=>assert.equal(c.error,undefined);
const settle=(s:LedgerSpec)=>(c:Context)=>host(c).settleLedger(c.a,s,c.state);
const tick=(dt=1)=>(c:Context)=>{c.a.updateTimers(dt);};
const upkeep=(dt=1)=>(c:Context)=>host(c).updateActorLedgers(c.a,dt);
try{
 course('uncapped-does-not-read-pools',c=>{c.a.maxLife=()=>{throw Error('life read');};c.a.maxMana=()=>{throw Error('mana read');};},c=>{c.result=c.a.ledgerCap(spec('arrears',{cap:undefined}));},c=>{okay(c);assert.equal(c.result,Infinity);});
 course('zero-fractions-retain-current-pool-reads',c=>{c.a.maxLife=()=>{c.events.push({kind:'maxLife'});return 200;};c.a.maxMana=()=>{c.events.push({kind:'maxMana'});return 300;};},c=>{c.result=c.a.ledgerCap(spec('arrears',{cap:{flat:7}}));},c=>{okay(c);assert.equal(c.result,7);assert.deepEqual(c.events.map(e=>e.kind),['capacity','maxLife','maxMana']);});
 course('pool-contingent-cap',c=>{c.a.sheet.setBase('life',200);c.a.sheet.setBase('mana',300);},c=>{c.result=c.a.ledgerCap(spec('arrears',{cap:{flat:7,maxLifePct:.5,maxManaPct:.25}}));},c=>{okay(c);assert.equal(c.result,182);});
 course('empty-cap-is-zero',()=>{},c=>{c.result=c.a.ledgerCap(spec('arrears',{cap:{}}));},c=>{okay(c);assert.equal(c.result,0);});
 for(const[balance,expected]of [[0,13],[48,50],[50,50]] as const)course('regen-balance-'+balance,c=>{add(c).ledger!.balance=balance;c.a.sheet.setBase('manaRegen',20);},tick(),c=>{okay(c);assert.equal(c.a.mana,7);assert.equal(c.a.activeAuras.get('reclamation')!.ledger!.balance,expected);});
 course('regen-sequential-shares',c=>{add(c,'reclamation',{rate:.5},'first');add(c,'reclamation',{rate:.5},'second');c.a.sheet.setBase('manaRegen',20);},tick(),c=>{okay(c);assert.equal(c.a.mana,5);assert.deepEqual([...c.a.activeAuras.values()].map(a=>a.ledger!.balance),[10,5]);});
 course('regen-rate-upper-bound',c=>{add(c,'reclamation',{rate:2});c.a.sheet.setBase('manaRegen',20);},tick(.5),c=>{okay(c);assert.equal(c.a.mana,0);assert.equal(c.a.activeAuras.get('reclamation')!.ledger!.balance,10);});
 course('regen-live-map-admission',c=>{add(c,'reclamation',{rate:.5},'first');c.a.sheet.setBase('manaRegen',20);c.onCap=()=>{c.onCap=undefined;add(c,'reclamation',{rate:.5},'second');};},tick(),c=>{okay(c);assert.equal(c.a.mana,5);assert.deepEqual([...c.a.activeAuras.values()].map(a=>a.ledger!.balance),[10,5]);});
 for(const gate of ['dead','downed'] as const)course('regen-'+gate,c=>{add(c);c.a.sheet.setBase('manaRegen',20);c.a[gate]=true;},tick(),c=>{okay(c);assert.equal(c.a.mana,0);assert.equal(c.a.activeAuras.get('reclamation')!.ledger!.balance,0);});
 course('regen-foreign-ledger-source',c=>{add(c,'arrears');c.a.sheet.setBase('manaRegen',20);},tick(),c=>{okay(c);assert.equal(c.a.mana,20);assert.equal(c.a.activeAuras.get('arrears')!.ledger!.balance,0);assert(!c.events.some(e=>e.kind==='capacity'));});
 course('regen-cap-failure-keeps-prior-bank',c=>{add(c,'reclamation',{rate:.5},'first');add(c,'reclamation',{rate:.5},'second');c.a.sheet.setBase('manaRegen',20);let reads=0;c.onCap=()=>{if(++reads===2)throw Error('second cap fails');};},tick(),c=>{assert.match(c.error??'',/second cap fails/);assert.equal(c.a.mana,0);assert.deepEqual([...c.a.activeAuras.values()].map(a=>a.ledger!.balance),[10,0]);});
 course('damage-ledger-uses-current-cap',c=>{add(c,'arrears',{cap:{flat:3}});},c=>{c.result=applyHit(c.target,c.a,{amounts:{physical:20},tags:new Set(['spell']),crit:false,sourceName:'ledger diagnostic'});},c=>{okay(c);assert.equal(c.a.activeAuras.get('arrears')!.ledger!.balance,3);assert.equal(c.a.life,63);});
 for(const due of [0,.49])course('settle-small-'+due,c=>{c.state.balance=due;},settle(spec()),c=>{okay(c);assert.equal(c.state.balance,0);assert.equal(c.a.life,80);assert.equal(c.events.length,0);});
 course('settle-half-point-boundary',c=>{c.state.balance=.5;},settle(spec()),c=>{okay(c);assert.equal(c.state.balance,0);assert.equal(c.a.life,79.5);assert.equal(c.events[0].text,'arrears due: 1');});
 course('settle-dead-clears-without-effects',c=>{c.state.balance=7;c.a.dead=true;},settle(spec()),c=>{okay(c);assert.equal(c.state.balance,0);assert.equal(c.a.life,80);assert.equal(c.events.length,0);});
 course('settle-raw-arrears',c=>{c.state.balance=7;c.a.hitFlashType='fire';c.a.sheet.setBase('damageImmunity',1);},settle(spec()),c=>{okay(c);assert.equal(c.a.life,73);assert.equal(c.a.hitFlash,.2);assert.equal(c.a.hitFlashType,undefined);assert.equal(c.events[0].balance,0);});
 course('settle-lethal-arrears',c=>{c.state.balance=90;},settle(spec()),c=>{okay(c);assert(c.a.dead);assert.deepEqual(c.events.filter(e=>e.kind==='kill').map(e=>e.who),['ledger bearer']);});
 course('settle-text-death-suppresses-kill',c=>{c.state.balance=90;c.onText=()=>{c.a.dead=true;};},settle(spec()),c=>{okay(c);assert(c.a.dead);assert(!c.events.some(e=>e.kind==='kill'));});
 course('settle-text-failure-retains-debit',c=>{c.state.balance=90;c.onText=()=>{throw Error('text fails');};},settle(spec()),c=>{assert.match(c.error??'',/text fails/);assert.equal(c.state.balance,0);assert.equal(c.a.life,-10);assert(!c.a.dead);assert(!c.events.some(e=>e.kind==='kill'));});
 course('settle-none-still-clears',c=>{c.state.balance=7;},settle(spec('arrears',{lapse:'none'})),c=>{okay(c);assert.equal(c.state.balance,0);assert.equal(c.a.life,80);assert.equal(c.events.length,0);});
 course('vent-overflow-still-damages-from-whole-balance',c=>{c.state.balance=10;c.a.mana=72;c.a.reservedMana=25;},settle(spec('reclamation')),c=>{okay(c);assert.equal(c.a.mana,75);assert.equal(c.events.find(e=>e.kind==='burst')!.amount,14);assert.equal(c.target.life,66);assert.equal(c.state.balance,0);});
 course('vent-default-lightning',c=>{c.state.balance=10;},settle(spec('reclamation',{ventDamage:{radius:170,perPoint:1.4}})),c=>{okay(c);assert.equal(c.events.find(e=>e.kind==='burst')!.damageType,'lightning');assert.equal(c.target.life,66);});
 course('vent-without-burst',c=>{c.state.balance=10;},settle(spec('reclamation',{ventDamage:undefined})),c=>{okay(c);assert.equal(c.a.mana,10);assert.deepEqual(c.events.map(e=>e.kind),['text']);assert.equal(c.w.flashes.length,0);});
 course('vent-burst-callback-moves-flash-and-text',c=>{c.state.balance=10;c.afterBurst=()=>{c.a.pos={x:17,y:23};};},settle(spec('reclamation')),c=>{okay(c);assert.deepEqual(c.events.find(e=>e.kind==='burst')!.pos,{x:0,y:0});assert.deepEqual(c.w.flashes.at(-1)!.pos,{x:17,y:23});assert.deepEqual(c.events.find(e=>e.kind==='text'&&e.text==='reclaimed 10')!.pos,{x:17,y:23});});
 course('vent-burst-failure-retains-credit',c=>{c.state.balance=10;c.beforeBurst=()=>{throw Error('burst fails');};},settle(spec('reclamation')),c=>{assert.match(c.error??'',/burst fails/);assert.equal(c.state.balance,0);assert.equal(c.a.mana,10);assert.equal(c.w.flashes.length,0);assert(!c.events.some(e=>e.kind==='text'));});
 course('upkeep-empty',()=>{},upkeep(),c=>{okay(c);assert.equal(c.events.length,0);});
 course('upkeep-zero-balance-skips-base',c=>{add(c,'arrears',{upkeep:{base:5,perPoint:1}});c.a.mana=3;},upkeep(),c=>{okay(c);assert.equal(c.a.mana,3);assert(c.a.activeAuras.has('arrears'));});
 course('upkeep-exact-bill-pays',c=>{add(c,'arrears').ledger!.balance=10;c.a.mana=1;},upkeep(),c=>{okay(c);assert.equal(c.a.mana,0);assert(c.a.activeAuras.has('arrears'));assert.equal(c.a.life,80);});
 course('upkeep-insufficient-retires-and-settles',c=>{add(c,'arrears').ledger!.balance=10;c.a.mana=.5;},upkeep(),c=>{okay(c);assert(!c.a.activeAuras.has('arrears'));assert.equal(c.a.mana,.5);assert.equal(c.a.life,70);assert.deepEqual(c.events.map(e=>e.kind),['text','retire','text']);});
 for(const[mana,balance,vented]of [[20,10,false],[19,1,true],[19,.99,false]] as const)course('upkeep-vent-boundary-'+mana+'-'+balance,c=>{add(c,'reclamation',{ventBelowMana:.2,ventDamage:undefined}).ledger!.balance=balance;c.a.mana=mana;},upkeep(),c=>{okay(c);assert(c.a.activeAuras.has('reclamation'));assert.equal(c.a.mana,mana+(vented?balance:0));assert.equal(c.a.activeAuras.get('reclamation')!.ledger!.balance,vented?0:balance);});
 course('upkeep-charged-before-threshold',c=>{add(c,'reclamation',{upkeep:{base:.5,perPoint:.05},ventBelowMana:.2,ventDamage:undefined}).ledger!.balance=10;c.a.mana=20.5;},upkeep(),c=>{okay(c);assert.equal(c.a.mana,29.5);assert.equal(c.a.activeAuras.get('reclamation')!.ledger!.balance,0);});
 course('upkeep-threshold-uses-reserved-capacity',c=>{add(c,'reclamation',{ventBelowMana:.2,ventDamage:undefined}).ledger!.balance=10;c.a.mana=5;c.a.reservedMana=80;},upkeep(),c=>{okay(c);assert.equal(c.a.mana,5);assert.equal(c.a.activeAuras.get('reclamation')!.ledger!.balance,10);});
 course('upkeep-live-map-admission',c=>{add(c,'arrears',{},'first').ledger!.balance=10;c.onText=()=>{c.onText=undefined;add(c,'arrears',{},'second').ledger!.balance=2;};},upkeep(),c=>{okay(c);assert.equal(c.a.activeAuras.size,0);assert.equal(c.a.life,68);assert.deepEqual(c.events.filter(e=>e.kind==='retire').map(e=>e.key),['first','second']);});
 course('upkeep-notice-failure-does-not-retire',c=>{add(c,'arrears').ledger!.balance=10;c.onText=()=>{throw Error('notice fails');};},upkeep(),c=>{assert.match(c.error??'',/notice fails/);assert(c.a.activeAuras.has('arrears'));assert.equal(c.a.life,80);assert.equal(c.a.activeAuras.get('arrears')!.ledger!.balance,10);});
 assert.equal(rows.length,40);
 writeFileSync(process.argv[2],JSON.stringify({scope:'original-aura-ledgers/v1',rows},(_key,value)=>typeof value==='number'&&!Number.isFinite(value)?{$number:String(value)}:value),{flag:'wx'});
}finally{restore();}
