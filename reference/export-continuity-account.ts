import fs from 'node:fs';
import assert from 'node:assert/strict';
import {CLASSES} from '../src/data/classes';
import {makeAccount,serializeAccount,deserializeAccount,isClassDiscovered,isClassUnlocked,unlockedClassCount,isSkillUnlockedForDrop,isSupportUnlockedForDrop,type AccountSave} from '../src/meta/account';
import {bootSimEngine} from '../src/sim/arena';
bootSimEngine();
const base=serializeAccount(makeAccount());
const rows=[],edge=[];
function snapshot(raw:AccountSave,id:string){
  const account=deserializeAccount(raw);
  if(!account)return null;
  const save=serializeAccount(account);
  return {classes:save.unlockedClasses,pending:save.pendingClassUnlocks,tiers:save.unlockedClassTiers,picks:save.kitPicks,
    skills:save.unlockedSkills,explicit:save.explicitSkillUnlocks,supports:save.unlockedSupports,
    classDiscovered:isClassDiscovered(account,id),classSelectable:isClassUnlocked(account,id),selectableClassCount:unlockedClassCount(account),
    check:{skill:isSkillUnlockedForDrop(account,'__skill'),support:isSupportUnlockedForDrop(account,'__support')},
    aliases:{serializedKit:save.kitPicks===account.kitPicks,loadedKitDetached:account.kitPicks!==raw.kitPicks,
      serializedClassListDetached:save.unlockedClasses!==raw.unlockedClasses,
      loadedInnerDetached:!raw.kitPicks?.[id]||account.kitPicks[id]!==raw.kitPicks[id]},
    retainedCredit:save.credits,foreignLedger:account.ledger.unrelated??null};
}
for(const id of [...CLASSES.map(c=>c.id),'__retired','__proto__']){
  for(const discovered of [false,true])for(const pending of [false,true]){
    const picks=Object.fromEntries<Record<string,string>>([[id,{swing:'arc',stale:'retired'}],['other',{base:'other'}]]);
    const current={...base,credits:71,ledger:{unrelated:12},unlockedClasses:discovered?[id,id]:[],pendingClassUnlocks:pending?[id,id]:[],
      unlockedClassTiers:['tier_'+id+'_novice','orphaned-tier'],kitPicks:picks,unlockedSkills:['__skill','__skill'],explicitSkillUnlocks:[],unlockedSupports:['__support','__support']};
    const loaded=deserializeAccount(current);assert(loaded);
    const first=snapshot(current,id),again=snapshot(serializeAccount(loaded),id);assert(first&&again);
    rows.push({id,discovered,pending,first,again});
  }
}
const dirtyPicks=JSON.parse('{"warrior":{"cleave":"carve","bad":4,"empty":""},"rogue":null,"retired":"old","array":["first",3],"__proto__":{"__proto__":"own"}}');
const testCases: [string,Record<string,unknown>][]=[
  ['missing',{unlockedClasses:undefined,pendingClassUnlocks:undefined,unlockedClassTiers:undefined,kitPicks:undefined,unlockedSkills:undefined,explicitSkillUnlocks:undefined,unlockedSupports:undefined}],
  ['dirty',{unlockedClasses:['ranger','retired'],pendingClassUnlocks:['warrior','retired','ranger','swashbuckler',null,17],unlockedClassTiers:['unknown',false,4,'tier_warrior_novice'],kitPicks:dirtyPicks}],
  ['empty',{unlockedClasses:[],pendingClassUnlocks:[],unlockedClassTiers:[],kitPicks:{},unlockedSkills:[],explicitSkillUnlocks:[],unlockedSupports:[]}],
  ['stale-account',{schemaVersion:base.schemaVersion+1,kitPicks:dirtyPicks}],
  ['stale-run',{runVersion:0,unlockedClasses:['ranger'],pendingClassUnlocks:['ranger'],kitPicks:dirtyPicks}],
  ['broken-pending',{pendingClassUnlocks:'ranger'}],['uniterable-skills',{unlockedSkills:7}],['top-kit-array',{kitPicks:[['foo',null],3]}]
];
for(const [label,fragment]of testCases){
  const raw={...base,credits:173,ledger:{unrelated:91},...fragment} as AccountSave;
  try{edge.push({label,read:snapshot(raw,'ranger')});}catch(e){edge.push({label,error:e instanceof TypeError?'TypeError':String(e)});}
}
assert.equal(rows.length,164);assert.equal(edge.filter(e=>'error' in e).length,2);
fs.writeFileSync(process.argv[2],JSON.stringify({rows,edge})+'\n',{flag:'wx'});
