// Capture the original data fold, including object identity and diagnostics.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {bootSimEngine} from '../src/sim/arena';import {PROC_LIST,scaleProcEffect,type ProcEffect} from '../src/data/procs';
bootSimEngine();assert.equal(PROC_LIST.length,147);
const encode=(v:any):any=>{if(v===undefined)return{$undefined:true};if(typeof v==='number'&&!Number.isFinite(v))return{$number:String(v)};if(v===null||typeof v!=='object')return v;return Array.isArray(v)?v.map(encode):Object.fromEntries(Object.entries(v).map(([k,value])=>[k,encode(value)]));};
const inputs:{id:string;effect:ProcEffect}[]=PROC_LIST.map(p=>({id:p.id,effect:p.effect}));inputs.push({id:'__m39_birth',effect:{type:'birth',birth:{type:'birth',monsterId:'boundary-only',count:[1,2],cap:3}}});
const scalable=new Set(['extraHit','collisionDamage','explosion','arc','displace','status','heal','restore','burst','delayedBurst','ward','cast']);const rows:unknown[]=[];
for(const {id,effect:fx}of inputs)for(const power of [-1,0,1,.5,2,NaN,Infinity]){
 const before=JSON.stringify(encode(fx)),result=scaleProcEffect(fx,power),same=power===1||!(power>0)||!scalable.has(fx.type);assert.equal(result===fx,same,id);assert.equal(JSON.stringify(encode(fx)),before,'Input mutation '+id);assert.equal(result.type,fx.type);
 if(!same){const r=result as any;const scalar=(field:string,value:number)=>assert.equal(r[field],value*power,id+'/'+field);switch(fx.type){
  case 'extraHit':case 'collisionDamage':case 'explosion':case 'arc':scalar('damageScale',fx.damageScale);break;
  case 'displace':scalar('force',fx.force);break;
  case 'status':scalar('magnitude',fx.magnitude??1);break;
  case 'heal':case 'restore':assert.equal(r.flat,fx.flat===undefined?undefined:fx.flat*power);assert.equal(r.pctMax,fx.pctMax===undefined?undefined:fx.pctMax*power);assert(Object.hasOwn(r,'flat')&&Object.hasOwn(r,'pctMax'));break;
  case 'ward':assert.equal(r.flat,fx.flat===undefined?undefined:fx.flat*power);assert.equal(r.pctMaxLife,fx.pctMaxLife===undefined?undefined:fx.pctMaxLife*power);assert(Object.hasOwn(r,'flat')&&Object.hasOwn(r,'pctMaxLife'));break;
  case 'burst':scalar('base',fx.base);scalar('perLevel',fx.perLevel);break;
  case 'delayedBurst':for(const key of ['damage','healAllies']as const){if(fx[key]){assert.notEqual(r[key],fx[key]);assert.equal(r[key].base,fx[key]!.base*power);assert.equal(r[key].perLevel,fx[key]!.perLevel*power);}else assert.equal(r[key],undefined);}break;
  case 'cast':assert.notEqual(r.cast,fx.cast);assert.equal(r.cast.mult,(fx.cast.mult??1)*power);assert.equal(r.cast.count,fx.cast.count);break;
 }}
 const nested=Object.fromEntries(['cast','damage','healAllies','buff','birth'].filter(k=>Object.hasOwn(fx,k)).map(k=>[k,(result as any)[k]===(fx as any)[k]]));rows.push({id,type:fx.type,power:encode(power),sameInput:same,nestedIdentity:nested,keys:Object.keys(result),result:encode(result)});
}
assert.equal(rows.length,1036);assert(process.argv[2]);fs.writeFileSync(process.argv[2],JSON.stringify({scope:'Unaccepted original scaling discovery: 147 initialized catalogue rows plus synthetic birth, seven powers including nonfinite diagnostics. Arithmetic, object identities, own keys and input preservation checked. No new SDK input-validation contract implied.',courses:rows.length,inputs:encode(inputs),rows},null,2)+'\n');
