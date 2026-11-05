import assert from 'node:assert/strict';

/** Independent acceptance rules for the named deviations from frozen original behavior. */
export function assertMemoryRepairs(original,actual){
 const changes={};
 assert.deepEqual(Object.keys(actual),Object.keys(original));
 for(const key of Object.keys(original)){
  if(JSON.stringify(original[key])===JSON.stringify(actual[key]))continue;
  assert(Array.isArray(original[key])&&Array.isArray(actual[key]),key);assert.equal(actual[key].length,original[key].length);
  changes[key]=original[key].flatMap((row,index)=>JSON.stringify(row)===JSON.stringify(actual[key][index])?[]:[{name:row.name,original:row,prototype:actual[key][index]}]);
 }
 assert.deepEqual(Object.keys(changes),['draws','drops']);
const invalidSequences=[];
for(const id of ['custom-discovery','__proto__','constructor','toString']){
 for(const sequence of ['9007199254740991','NaN']){
  for(const prefix of ['receipt-id','receipt-id-retry'])invalidSequences.push(prefix+'/'+id+'/'+sequence);
 }
}
const safeStorage=['receipt-id/__proto__/undefined','receipt-id-retry/__proto__/undefined'];
const overflow=['0','0.5','0.9999999999999998'].map(roll=>'custom-weights/{"skill":1e+308,"support":1e+308}/'+roll);
assert.deepEqual(changes.draws.map(row=>row.name).sort(),[...invalidSequences,...safeStorage,...overflow].sort());
for(const row of changes.draws){
 const value=row.prototype;
 if(safeStorage.includes(row.name)){
  assert.equal(value.ownReceipt,true);
  assert.equal(value.receiptPrototype,'Object.prototype');
  assert.equal(value.storedIdentity,true);
  assert.deepEqual(value.receipt,row.original.receipt);
  assert.deepEqual(value.after.memoryReceipts.__proto__,value.receipt);
  assert.deepEqual(value.after.unlockedSkills,row.original.after.unlockedSkills);
  assert.deepEqual(value.after.unlockedSupports,row.original.after.unlockedSupports);
  assert.deepEqual(value.after.explicitSkillUnlocks,row.original.after.explicitSkillUnlocks);
 }else{
  assert.equal(value.receipt,null);
  assert.equal(value.randomDraws,0);
  assert.deepEqual(value.after,value.before);
  assert.equal(value.receiptPrototype,'Object.prototype');
 }
}
const dropConfigs=['default','drop-weighted','excluded','weight-overrides','debug-bypass-disabled','vault-disabled','both-secondary-kinds','commission-ungated','all-mechanics-ungated'];
const expectedDrops=dropConfigs.flatMap(config=>['__proto__','constructor','toString'].map(id=>config+'/'+id+'/legendary'));
assert.deepEqual(changes.drops.map(row=>row.name).sort(),expectedDrops.sort());
for(const {prototype:value}of changes.drops){
 assert.equal(value.first,false);assert.equal(value.repeat,false);
 assert.deepEqual(value.before,value.after);assert.deepEqual(value.before,value.afterRepeat);
}

 return {changedDraws:changes.draws.length,changedDrops:changes.drops.length};
}

export function assertUnlockRepairs(original,actual,rawEdges,edges){
 for(const key of ['courses','masterySteps','earnedSteps'])assert.deepEqual(actual[key],original[key],key);
const allowed=new Set();
const ordinary=['slot','class','classtier','skill','support','feature','graft','pkg_warbands','resurrect_fallen'];
for(const course of ordinary)for(const scenario of ['amount-NaN','credits-NaN','credits-Infinity','investment-NaN','investment-Infinity'])
 allowed.add(course+'/'+scenario);
for(const row of original.traces)if(row.name.startsWith('feature-key-'))allowed.add(row.name);
for(const course of ['power','storage'])for(const scenario of ['investment-NaN','investment-Infinity','retuned-0','retuned-5'])allowed.add(course+'/'+scenario);
for(const course of ['memory_discovery','memory_secondary'])for(const scenario of ['credits-NaN','credits-Infinity','investment-NaN','investment-Infinity'])allowed.add(course+'/'+scenario);
for(const row of original.traces)if(row.name.startsWith('memory-offer-alias/')&&(
 row.name.includes('/amount-')||row.name.includes('/investment-')||row.name.includes('/retuned-')||
 ['/credits-30','/credits-10000','/credits-NaN','/credits-Infinity','/random-0','/random-0.999999'].some(s=>row.name.endsWith(s))))allowed.add(row.name);
const changed=actual.traces.filter((row,i)=>JSON.stringify(row)!==JSON.stringify(original.traces[i])).map(row=>row.name);
assert.deepEqual([...changed].sort(),[...allowed].sort(),'Exact changed-scenario set');
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const held=(state,row)=>row.kind==='power'?state.reliquary.invested:row.kind==='storage'?state.reliquary.stash.invested:
 Object.hasOwn(state.invested,row.id)?state.invested[row.id]:0;
const stripCompletion=row=>{
 const clone=structuredClone(row);
 for(const step of clone.steps){delete step.before.completed;delete step.after.completed;}
 return clone;
};
let refusals=0,aliasReads=0,literalSteps=0,completionCorrections=0;
for(let i=0;i<actual.traces.length;i++){
 const row=actual.traces[i],before=original.traces[i],definition=row.definition;
 assert.equal(row.name,before.name);assert.deepEqual(row.definition,before.definition);
 assert.deepEqual(row.steps[0].before.state,before.steps[0].before.state,'Original input '+row.name);
 const invalidState=!finite(row.steps[0].before.state.credits)||!finite(held(row.steps[0].before.state,definition));
 if(invalidState){
  for(const step of row.steps){
   assert.equal(step.result,step.name==='apply'?false:0,row.name+' '+step.name);
   assert.deepEqual(step.after.state,step.before.state,row.name+' refusal state');
   assert.equal(step.after.draws,step.before.draws);assert.equal(step.error,undefined);refusals++;
  }
  continue;
 }
 if(row.name.endsWith('/amount-NaN')){
  const step=row.steps[0];assert.equal(step.result,0);assert.deepEqual(step.after.state,step.before.state);
  assert.equal(step.after.draws,step.before.draws);refusals++;
 }
 if(row.name.startsWith('memory-offer-alias/')){
  assert.deepEqual(stripCompletion(row),stripCompletion(before),'Only alias completion may differ for finite inputs '+row.name);
  for(const step of row.steps){
   const receipt=step.after.state.memoryReceipts[definition.payload.memoryUnlockId];
   const prior=step.before.state.memoryReceipts[definition.payload.memoryUnlockId];
   assert.equal(step.after.completed,(receipt?.sequence??0)>(prior?.sequence??0));aliasReads++;
  }
 }
 if((definition.kind==='power'||definition.kind==='storage')&&row.name.includes('/retuned-')){
  const expected=structuredClone(before);expected.steps[1].result=false;
  assert.deepEqual(row,expected);assert.equal(row.steps[1].after.completed,false);completionCorrections++;
 }
 if(row.name.startsWith('feature-key-')){
  for(const step of row.steps){
   const b=step.before,a=step.after,spent=b.state.credits-a.state.credits;
   assert(finite(spent)&&spent>=0,row.name);
   assert.equal(a.draws,b.draws);assert.equal(step.error,undefined);
   const skip=new Set(['credits','invested','features']);
   for(const key of Object.keys(b.state))if(!skip.has(key))assert.deepEqual(a.state[key],b.state[key],row.name+' '+key);
   if(step.name!=='apply')assert.equal(spent,step.result);
   if(a.owned){
    assert(a.state.features.includes(definition.payload.flag));
    assert(!Object.hasOwn(a.state.invested,definition.id));
    if(!b.owned)assert.equal(spent,Math.max(0,definition.cost-b.investment));
   }else{
    assert.deepEqual(a.state.features,b.state.features);
    assert.equal(a.investment,b.investment+spent);
    if(spent>0)assert(Object.hasOwn(a.state.invested,definition.id));
   }
   if(step.name==='apply')assert.equal(step.result,a.owned&&!b.owned);
   literalSteps++;
  }
 }
}
assert.equal(edges.rows.length,12);
for(let i=0;i<edges.rows.length;i++){
 const row=edges.rows[i],raw=rawEdges.rows[i];assert.equal(row.name,raw.name);assert.deepEqual(row.before,raw.before);
 if(row.name.startsWith('free-memory-')){
  assert.equal(raw.result,true);assert.equal(row.result,false);assert.equal(row.draws,1);assert.equal(row.completed,false);
  assert.deepEqual(row.after,row.before);
 }else if(row.name.startsWith('invalid-cost-')){
  assert.equal(row.result,0);assert.equal(row.applied,false);assert.deepEqual(row.after,row.before);assert.deepEqual(row.final,row.before);
 }else if(row.name.startsWith('inherited-investment-')){
  const id=row.name.slice('inherited-investment-'.length);assert.equal(row.held,0);assert.equal(row.result,3);
  assert.equal(row.after.credits,row.before.credits-3);assert.equal(row.after.invested[id],3);
  assert.equal(row.own,true);assert.equal(row.prototypeOwn,true);assert.deepEqual(row.after.features,row.before.features);
 }else if(row.name.startsWith('migration-destination-')){
  const id=row.name.slice('migration-destination-'.length);assert.equal(row.own,true);assert.equal(row.prototypeOwn,true);
  assert.equal(row.after.invested[id],4);assert.equal(Object.keys(row.after.invested).length,1);
  assert.equal(row.after.credits,row.before.credits);
 }else assert.fail(row.name);
}

 return {namedChanges:changed.length,refusals,aliasReads,literalSteps,completionCorrections,supplementCases:edges.rows.length};
}
