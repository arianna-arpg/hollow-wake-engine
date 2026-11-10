import {AuraLedgers,auraLedgerCapacity,bankAuraManaRegeneration,type AuraLedgerActor,type AuraLedgerBank,type AuraLedgerPorts,type AuraLedgerSpec} from '@hollow-wake/engine/auras/ledgers';
type Damage='lightning'|'fire';type Color={hex:string};
interface Ledger extends AuraLedgerSpec<Damage>{contentId:string}
interface Actor extends AuraLedgerActor<Ledger>,AuraLedgerBank<Ledger>{maximumLife:number;maximumMana:number;maxLife():number;maxMana():number}
const actor:Actor={life:30,mana:4,dead:false,activeAuras:new Map(),maximumLife:100,maximumMana:80,maxLife(){return this.maximumLife;},maxMana(){return this.maximumMana;},ledgerCap(spec){return auraLedgerCapacity(this,spec);}};
const spec:Ledger={contentId:'reclaim',source:'manaRegen',rate:.5,lapse:'ventMana',cap:{maxManaPct:.5}},state={balance:0};
actor.activeAuras=new Map([['reclaim',{inst:{def:{delivery:{type:'aura',ledger:spec}}},ledger:state}]]);
const ports:AuraLedgerPorts<Actor,Ledger,Damage,Color>={availableMaxMana:a=>a.maxMana(),insufficient:a=>{void a;},retire:(a,id)=>{void a;void id;},settle:(a,s,b)=>runtime.settle(a,s,b),arrears:(a,due)=>{void a;void due;},kill:a=>{a.dead=true;},damageColor:type=>({hex:type==='fire'?'#f00':'#00f'}),burst:(a,r,n,t,c)=>{void a;void r;void n;void t;void c.hex;},ventCue:(a,r,c)=>{void a;void r;void c.hex;},reclaimed:(a,due)=>{void a;void due;}};
const runtime=new AuraLedgers<Actor,Ledger,Damage,Color>(ports,'lightning');
actor.mana+=bankAuraManaRegeneration(actor,10,.5)*.5;runtime.update(actor,.5);runtime.settle(actor,spec,state);
// @ts-expect-error The configured damage vocabulary survives the host boundary.
new AuraLedgers<Actor,Ledger,Damage,Color>(ports,'unadmitted');
// @ts-expect-error The caller retains its complete content-specific ledger type.
runtime.settle(actor,{source:'manaRegen',rate:.5,lapse:'ventMana'},state);
// @ts-expect-error Cue payloads retain the caller's color representation.
ports.ventCue(actor,12,'red');
