import test from 'node:test';
import assert from 'node:assert/strict';
import {createClassIdentity,restoreClassIdentity,restoreLifeIdentity,findSavedClass,isClassDiscovered,isClassUnlocked,unlockedClassCount} from '../dist/character-identity.js';
import {kitChoicesFor,resolveClassKit,rememberKitPicks,ownedKitRungs,kitHasOptions,kitRungOf} from '../dist/class-kits.js';
import {claimEarnedEntry,settleClassClaims,activateClassClaim,pendingClassClaims,grantClassBundle} from '../dist/class-claims.js';

test('a created character owns both attribute records and its opening, retaining zero as a skill handle',()=>{
  let reads=0;
  const definition={id:'ember',name:'Ember',bar:[0,null],get attributes(){return {might:++reads};}};
  const value=createClassIdentity(definition,definition.bar);
  assert.equal(value.classDef,definition);
  assert.deepEqual(value.opening,[0,null]);assert.notEqual(value.opening,definition.bar);
  assert.deepEqual([value.baseAttrs.might,value.attrs.might],[1,2]);assert.notEqual(value.attrs,value.baseAttrs);
});

test('save restoration distinguishes a missing opening from an explicitly empty one and sees live stance changes',()=>{
  const definition={name:'Root',bar:[4],attributes:{power:1}},save={opening:[],stances:0,name:'old',baseAttrs:{power:3}};
  const identity=restoreClassIdentity(definition,save,s=>{assert.equal(s,0);save.name='  Meadow  ';return false;});
  assert.equal(identity.name,'Meadow');assert.equal(identity.stances,false);assert.deepEqual(identity.opening,[]);
  assert.notEqual(identity.opening,save.opening);assert.notEqual(identity.baseAttrs,save.baseAttrs);assert.notEqual(identity.baseAttrs,identity.attrs);
  const old=restoreClassIdentity(definition,{name:'  ',baseAttrs:{}},()=>({}));assert.deepEqual(old.opening,[4]);assert.notEqual(old.opening,definition.bar);assert.equal(old.name,'Root');
  assert.equal(restoreLifeIdentity({modeId:'',modeStage:-1,charId:'retained'},'mortal',()=>assert.fail('unnecessary mint')).charId,'retained');
  let minted=0;assert.deepEqual(restoreLifeIdentity({charId:''},'mortal',()=>String(++minted)),{modeId:'mortal',modeStage:0,charId:'1'});assert.equal(minted,1);
});

test('pending and retired identities stay distinct from the registered selectable count',()=>{
  const known={unlockedClasses:new Set(['a','b','orphan']),pendingClassUnlocks:new Set(['a'])};
  const classes=new Array(4);classes[1]={id:'a'};classes[3]={id:'b'};
  assert(isClassDiscovered(known,'a'));assert(!isClassUnlocked(known,'a'));assert(isClassUnlocked(known,'orphan'));assert.equal(unlockedClassCount(classes,known),1);
  assert.equal(findSavedClass([classes[1],{id:'a'}],'a'),classes[1]);assert.equal(findSavedClass([classes[1]],'orphan'),undefined);
});

const fighter={id:'fighter',bar:['swing',null,'guard',null],kit:[
  {tier:'one',skill:'arc',replaces:'swing'},{tier:'two',skill:'slam',replaces:'swing'},
  {tier:'three',skill:'gift'},{tier:'four',skill:'gift'},{tier:'five',skill:'form'},{tier:'six',skill:'sixth'}]};
function kitAccount(){return {unlockedClassTiers:new Set(),kitPicks:{fighter:{swing:'arc'},other:{locked:'keep'}}};}
test('opening choices preserve authored order, row identity and ownership',()=>{
  const a=kitAccount();assert(!kitHasOptions(a,fighter));assert.deepEqual(resolveClassKit(a,fighter,{swing:'arc'}),fighter.bar);
  for(const row of fighter.kit)a.unlockedClassTiers.add('tier_fighter_'+row.tier);
  assert.equal(ownedKitRungs(a,fighter)[0],fighter.kit[0]);
  const menu=kitChoicesFor(a,fighter);assert.deepEqual(menu.slots[0],{base:'swing',options:['swing','arc','slam'],picked:'arc'});assert(kitHasOptions(a,fighter));
  assert.deepEqual(resolveClassKit(a,fighter,{swing:'slam'}),['slam','gift','guard','form']);
  assert.deepEqual(resolveClassKit(a,fighter,{swing:'absent'}),['swing','gift','guard','form']);
  assert.deepEqual(fighter.bar,['swing',null,'guard',null]);assert.equal(kitRungOf(fighter,'arc',()=>undefined).label,'one');
});
test('invalid and unowned choices are forgotten without touching another class',()=>{
  const a=kitAccount();a.unlockedClassTiers.add('tier_fighter_one');
  rememberKitPicks(a,fighter,{swing:'arc'});assert.deepEqual(a.kitPicks.fighter,{swing:'arc'});
  rememberKitPicks(a,fighter,{swing:'slam'});assert(!Object.hasOwn(a.kitPicks,'fighter'));assert.deepEqual(a.kitPicks.other,{locked:'keep'});
  assert(!kitHasOptions(a,{id:'fighter',bar:['other'],kit:[fighter.kit[0]]}));
});
function claimsSession(){
  const account={owned:new Set(),pending:new Set(),log:[],invested:{a:1,b:2}};
  const ports={
    owned:(a,r)=>a.owned.has(r.id),
    visible:(a,r,view)=>Boolean(view?.deed)&&(!r.dependency||a.owned.has(r.dependency)),
    clearInvestment:(a,id)=>{a.log.push('clear:'+id);delete a.invested[id];},
    grant:(a,r)=>{a.log.push('grant:'+r.id);a.owned.add(r.id);},
    markPending:(a,r)=>{a.log.push('pending:'+r.id);a.pending.add(r.id);},
    pending:(a,r)=>a.pending.has(r.id),activate:(a,r)=>a.pending.delete(r.id)
  };
  return {account,ports};
}
const first={id:'a',kind:'class',earned:true},last={id:'b',kind:'class',earned:true,dependency:'a'},view={deed:1};
test('claims settle chained doors, preserve catalogue display order, and acknowledge once',()=>{
  const {account,ports}=claimsSession(),catalog=[last,first];
  assert.deepEqual(settleClassClaims(catalog,account,undefined,ports),[]);
  assert.deepEqual(settleClassClaims(catalog,account,view,ports),[first,last]);
  assert.deepEqual(account.log,['clear:a','grant:a','pending:a','clear:b','grant:b','pending:b']);
  assert.deepEqual(settleClassClaims(catalog,account,view,ports),[]);assert.deepEqual(pendingClassClaims(catalog,account,ports),catalog);
  assert(activateClassClaim(account,first,ports));assert(!activateClassClaim(account,first,ports));
  assert.deepEqual(pendingClassClaims(catalog,account,ports),[last]);assert.deepEqual(account.invested,{});
});
test('settlement reports a broken grant contract before repeating an award',()=>{
  const {account,ports}=claimsSession();ports.grant=(a,r)=>a.log.push('bad:'+r.id);
  assert.throws(()=>settleClassClaims([first],account,view,ports),/ownership/);
  const broken=claimsSession();broken.ports.grant=(a,r)=>{a.owned.clear();a.owned.add(r.id);a.log.push(r.id);};
  assert.throws(()=>settleClassClaims([last,first],broken.account,view,broken.ports),/ownership/);
  assert.deepEqual(broken.account.log.filter(s=>s==='a'||s==='b'),['a','b']);
});
test('manual earned nonclass grants skip class activation and bundle awards retain insertion order',()=>{
  const {account,ports}=claimsSession(),row={id:'feature',kind:'feature',earned:true};
  assert(claimEarnedEntry(account,row,view,ports));assert(!activateClassClaim(account,row,ports));assert.equal(account.pending.size,0);
  const target={unlockedClasses:new Set(),unlockedSkills:new Set(['x']),unlockedSupports:new Set()};
  grantClassBundle(target,{classId:'weaver',skillIds:['fire','x','ice'],supportIds:['pulse','pulse']});
  assert.deepEqual([...target.unlockedClasses],['weaver']);assert.deepEqual([...target.unlockedSkills],['x','fire','ice']);assert.deepEqual([...target.unlockedSupports],['pulse']);
});

test('host-defined IDs that coincide with object properties round-trip as ordinary kit picks',()=>{
  const def={id:'__proto__',bar:['__proto__'],kit:[{tier:'one',skill:'alt',replaces:'__proto__'}]};
  const a={unlockedClassTiers:new Set(['tier___proto___one']),kitPicks:{}},inherited=Object.create({['__proto__']:'alt'});
  assert.deepEqual(resolveClassKit(a,def,inherited),['__proto__']);
  const picks=JSON.parse('{"__proto__":"alt"}');rememberKitPicks(a,def,picks);
  assert.equal(Object.getPrototypeOf(a.kitPicks),Object.prototype);
  assert.equal(Object.getPrototypeOf(a.kitPicks[def.id]),Object.prototype);
  assert.deepEqual(JSON.parse(JSON.stringify(a.kitPicks)),JSON.parse('{"__proto__":{"__proto__":"alt"}}'));
  assert.deepEqual(resolveClassKit(a,def),['alt']);
});
