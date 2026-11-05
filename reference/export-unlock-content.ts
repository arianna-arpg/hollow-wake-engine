
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {World} from '../src/engine/world';
import {UNLOCK_CATALOG,CLASS_BUNDLES,SLOT_TIERS,VAULT_TABS,VAULT_KIND_LABELS,VAULT_SHELF_CFG,INVEST_CFG,classBundleId,resurrectUnlockId} from '../src/meta/unlocks';
import {PACKAGES} from '../src/packages/registry';
import {CLASS_WEB_CFG} from '../src/data/classTiers';
import {MEMORY_UNLOCK_CFG} from '../src/data/memoryUnlocks';
import {RELIQUARY_CFG} from '../src/data/reliquary';
import {RELIC_STASH} from '../src/data/stashes';
import {VENDOR_CFG} from '../src/data/vendors';
import {CLASSES} from '../src/data/classes';
import {RUNESCRIPT,encipher,decipher,runeOf,runeLetterOf,revealScript} from '../src/data/runescript';
import {powerProgressionRefusal} from '../src/data/powerProgression';
import {FEATURE,STARTER_SKILLS,makeAccount} from '../src/meta/account';
import {gateRowLabel} from '../src/meta/gates';
void World;
const encode=(_key:string,value:unknown):unknown=>typeof value==='number'&&!Number.isFinite(value)?{number:String(value)}:value;
const numbers=[undefined,-Infinity,-1,0,Number.MIN_VALUE,.5,1,2,3,4,5,6,8,10,12,15,20,100,101,Infinity,NaN];
const predicates:unknown[]=[];
for(const pkg of PACKAGES){
 const definitions=[{id:pkg.id+'/base',test:pkg.unlock.test},...(pkg.tiers??[]).map(t=>({id:pkg.id+'/'+t.id,test:t.test}))];
 for(const definition of definitions){
  const source=definition.test.toString();
  const ledgerKeys=[...new Set([...source.matchAll(/\b\w+\.ledger\.([A-Za-z_$][\w$]*)/g)].map(m=>m[1]))];
  const level=/\b\w+\.account\.level\b/.test(source);
  const cases:{name:string;level:number;ledger:Record<string,number>}[]=[{name:'missing',level:0,ledger:{}}];
  for(const key of ledgerKeys)for(const value of numbers){
   cases.push({name:key+'='+String(value),level:0,ledger:value===undefined?{}:{[key]:value}});
  }
  if(level)for(const value of numbers)if(value!==undefined)cases.push({name:'level='+String(value),level:value,ledger:{}});
  if(ledgerKeys.length>1)for(const value of [-1,0,1,100,NaN]){
   cases.push({name:'all='+String(value),level:0,ledger:Object.fromEntries(ledgerKeys.map(key=>[key,value]))});
  }
  const observations=cases.map(input=>{
   const reads:string[]=[];
   const account=makeAccount();
   Object.defineProperty(account,'level',{get(){reads.push('account.level');return input.level;},configurable:true});
   const ledger=new Proxy(input.ledger,{get(target,key,receiver){if(typeof key==='string')reads.push('ledger.'+key);return Reflect.get(target,key,receiver) as unknown;}});
   const result=definition.test({account,ledger});
   assert.equal(typeof result,'boolean');
   return {input,result,reads};
  });
  predicates.push({id:definition.id,source,ledgerKeys,level,observations});
 }
}
const packages=PACKAGES.map(p=>({id:p.id,label:p.label,blurb:p.blurb,cost:p.cost,alwaysOn:p.alwaysOn,
 pressureless:p.pressureless,defaultEnabled:p.defaultEnabled,
 unlock:{id:p.unlock.id,label:p.unlock.label,predicateId:p.id+'/base'},
 tiers:(p.tiers??[]).map(t=>({id:t.id,label:t.label,requirement:t.requirement,cost:t.cost,predicateId:p.id+'/'+t.id}))}));
const phrases=[...new Set([
 '', 'THing AND thunder', 'Thing thing 123! ᚦ🙂', '日本語 café AAAAA a-a', 'unknown calling',
 CLASS_WEB_CFG.unknownRumor,...UNLOCK_CATALOG.flatMap(u=>u.kind==='class'?[u.payload.rumor??'',u.payload.hint??'']:[]),
 ...UNLOCK_CATALOG.flatMap(u=>(u.reqAnyOf??[]).map(gateRowLabel)),
])];
const runeObservations=phrases.map(text=>({text,cipher:encipher(text),plain:decipher(encipher(text)),
 reveals:[-Infinity,-1,0,Number.MIN_VALUE,.001,.1,.25,.499,.5,.9,.999,1,2,Infinity,NaN].map(fraction=>({fraction,value:revealScript(text,fraction)}))}));
const data={
 catalog:UNLOCK_CATALOG,classBundles:CLASS_BUNDLES,slotTiers:SLOT_TIERS,tabs:VAULT_TABS,kindLabels:VAULT_KIND_LABELS,
 shelfConfig:VAULT_SHELF_CFG,investConfig:INVEST_CFG,classWeb:CLASS_WEB_CFG,
 memoryConfig:{legacyGemBundles:MEMORY_UNLOCK_CFG.legacyGemBundles,showDebugCodex:MEMORY_UNLOCK_CFG.showDebugCodex},
 classes:CLASSES.map(({id,name})=>({id,name})),starterSkills:STARTER_SKILLS,reliquaryFeature:FEATURE.RELIQUARY,
 reliquaryConfig:RELIQUARY_CFG,relicStash:{id:RELIC_STASH.id,board:RELIC_STASH.board,initialPages:RELIC_STASH.initialPages,maxPages:RELIC_STASH.maxPages,pageCostBase:RELIC_STASH.pageCostBase},
 commissionNeed:VENDOR_CFG.commission.need,awakeningRefusal:powerProgressionRefusal('awakening'),alphabet:RUNESCRIPT,packages,
 keySamples:['','mage','constructor','__proto__','with spaces','日本語'].map(id=>({id,classId:classBundleId(id),resurrectId:resurrectUnlockId(id)})),
};
fs.writeFileSync(process.argv[2],JSON.stringify({data,predicates,runeObservations,
 runeLetters:[...RUNESCRIPT.map(r=>r.letter),'TH','Z','?', '🙂'].map(letter=>({letter,rune:runeOf(letter)})),
 reverseRunes:[...RUNESCRIPT.map(r=>r.rune),'?', '🙂'].map(rune=>({rune,letter:runeLetterOf(rune)})),
},encode)+'\n',{flag:'wx'});
