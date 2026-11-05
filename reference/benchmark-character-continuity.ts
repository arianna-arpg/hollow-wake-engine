import fs from 'node:fs';
import assert from 'node:assert/strict';
import {CLASSES} from '../src/data/classes';
import {makeAccount,STARTER_SKILLS} from '../src/meta/account';
import {CLASS_BUNDLES,reconcileClassBundleGems,isSkillUnlockedForSelection,settleClassUnlocks} from '../src/meta/unlocks';

const skills=[...new Set(CLASS_BUNDLES.flatMap(bundle=>bundle.skillIds))];
assert.equal(skills.length,CLASS_BUNDLES.reduce((total,bundle)=>total+bundle.skillIds.length,0));
const observations:{name:string;calls:number;nanoseconds:number;state:number[]}[]=[];
function measure(name:string,fn:(index:number)=>number,expected:number[],passes:number) {
  for(let i=0;i<expected.length;i++)assert.equal(fn(i),expected[i],name);
  for(let i=0;i<10000;i++)fn(i%expected.length);
  const start=process.hrtime.bigint();
  let sum=0;
  for(let pass=0;pass<passes;pass++)for(let i=0;i<expected.length;i++)sum+=fn(i);
  const nanoseconds=Number(process.hrtime.bigint()-start);
  assert.equal(sum,passes*expected.reduce((total,value)=>total+value,0));
  observations.push({name,calls:passes*expected.length,nanoseconds,state:expected});
}
for(const mode of ['starter','pending','active'] as const) {
  const account=makeAccount();
  if(mode!=='starter')for(const bundle of CLASS_BUNDLES) {
    account.unlockedClasses.add(bundle.classId);
    if(mode==='pending')account.pendingClassUnlocks.add(bundle.classId);
  }
  reconcileClassBundleGems(account);
  const expected=skills.map(id=>Number(mode==='active'||STARTER_SKILLS.includes(id)));
  measure(mode+'-reward-selection',index=>Number(isSkillUnlockedForSelection(account,skills[index])),expected,mode==='starter'?100000:5000);
}
for(const mode of ['starter','mixed','owned'] as const) {
  const account=makeAccount();
  for(let i=0;i<CLASSES.length;i++)if(mode==='owned'||(mode==='mixed'&&i%2===0))account.unlockedClasses.add(CLASSES[i].id);
  measure(mode+'-class-settlement',()=>settleClassUnlocks(account).length,[0],100000);
}
fs.writeFileSync(process.argv[2],JSON.stringify(observations)+'\n',{flag:'wx'});
