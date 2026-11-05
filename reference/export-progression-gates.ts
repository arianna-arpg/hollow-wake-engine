import fs from 'node:fs';
import {makeAccount,reachedLevelKey,classLevelLedgerKey,vocationUnlockKey,questDoneKey,LEDGER_QUESTS_COMPLETED} from '../src/meta/account';
import {CLASSES} from '../src/data/classes';
import {UNLOCK_CATALOG} from '../src/meta/unlocks';
import {gateRowMet,gateRowLabel,gateMet,gateRowProgress,gateLevelNeeds,gateClassLevelNeeds,ledgerPrefixHeld,type GateRow} from '../src/meta/gates';

const cls=CLASSES[0],other=CLASSES[1];
const rows:GateRow[]=[
 {},{ledger:'deed'},{ledger:'deed',n:0},{ledger:'deed',n:-2},{ledger:'deed',n:.5},{ledger:'deed',n:4},
 {ledgerPrefix:'family:'},{ledgerPrefix:'family:',n:3},{ledgerPrefix:'',n:2},
 {unlock:'step'},{unlock:''},{feature:'feature'},{feature:''},
 {level:10},{level:0},{level:-2},{level:2.5},
 {classLevel:{classId:cls.id,level:10}},{classLevel:{classId:'__retired',level:10}},
 {vocation:true},{vocation:'path'},{vocation:''},{quest:true},{quest:'quest'},{quest:''},
 {ledger:'deed',level:10,feature:'feature',label:'Override'},
 {ledgerPrefix:'family:',unlock:'step'},{unlock:'step',feature:'feature'},
 {feature:'feature',level:10},{level:10,classLevel:{classId:cls.id,level:20}},
 {classLevel:{classId:cls.id,level:10},vocation:true},{vocation:true,quest:true},
 {ledger:'deed',n:1,label:''},{ledgerPrefix:'family___::',n:2},{ledger:'many_words',n:2},
 {ledger:'deed',n:Number.NaN},{ledger:'deed',n:Number.POSITIVE_INFINITY}
];
const accounts:{name:string;account:ReturnType<typeof makeAccount>;owned:Set<string>}[]=[];
function account(name:string,ledger:Record<string,number>={},features:string[]=[],owned:string[]=[]) {
 const value=makeAccount();value.ledger=ledger;value.features=new Set(features);accounts.push({name,account:value,owned:new Set(owned)});return value;
}
account('empty');
for(const n of [-3,0,.5,1,2,3,4,20])account('counter-'+n,{deed:n,'family:a':n});
account('distributed-prefix',{'family:a':2,'family:b':2});
account('unrelated-prefix',{'other:a':20});
account('all-binary',{},['feature',''],['step','']);
account('lifetime-quest',{[LEDGER_QUESTS_COMPLETED]:1});
account('specific-quest',{[questDoneKey('quest')]:1});
account('unrelated-quest',{[questDoneKey('other')]:1});
account('specific-vocation',{[vocationUnlockKey('path')]:1});
account('unrelated-vocation',{[vocationUnlockKey('other')]:1});
for(const level of [0,1,3,5,9,10,12,20])account('level-'+level,{
 [reachedLevelKey(level)]:1,[classLevelLedgerKey(cls.id,level)]:1
});
account('other-class',{[classLevelLedgerKey(other.id,10)]:1});
const prefix=reachedLevelKey(0).slice(0,-1);
account('numeric-suffixes',{[prefix+'2e0']:1,[prefix+' 05 ']:1,[prefix+'3.5']:1,[prefix+'nope']:20,[prefix+'-1']:1});
account('fractional-stamp',{[prefix+'3.5']:1});
account('zero-stamps',{[reachedLevelKey(10)]:0,[classLevelLedgerKey(cls.id,10)]:0,[vocationUnlockKey('path')]:0,[questDoneKey('quest')]:0});
account('inherited-ledger',Object.assign(Object.create({'family:inherited':4,[reachedLevelKey(5)]:1}),{deed:1}));
const matrix=accounts.map(({name,account,owned})=>({name,rows:rows.map(row=>{
 const calls:string[]=[],has=(id:string)=>{calls.push(id);return owned.has(id);};
 const held=gateRowMet(account,row,has),afterHeld=calls.length,progress=gateRowProgress(account,row,has);
 return {held,progress,calls,afterHeld,label:gateRowLabel(row)};
}),prefix:ledgerPrefixHeld(account,'family:',3)}));
const sequences=[
 undefined,[],[{feature:'missing'},{unlock:'step'}],[{feature:'feature'},{unlock:'step'}],
 [{unlock:'step'},{ledger:'deed'}],[{ledger:'deed'},{unlock:'step'},{quest:true}]
] as const;
const compositions=[];
for(const {name,account,owned}of accounts)for(const mode of ['any','all'] as const)for(const sequence of sequences){
 const calls:string[]=[],held=gateMet(account,sequence,mode,id=>{calls.push(id);return owned.has(id);});
 compositions.push({name,mode,sequence:sequence??null,held,calls});
}
const derivationRows:GateRow[]=[{level:10},{classLevel:{classId:cls.id,level:10}},{level:10},{level:0},{level:Number.NaN},{classLevel:{classId:other.id,level:30}}];
const levels=gateLevelNeeds(derivationRows),classLevels=gateClassLevelNeeds(derivationRows);
const aliased=classLevels[0]===derivationRows[1].classLevel&&classLevels[1]===derivationRows[5].classLevel;
const sparse:GateRow[]=new Array(3);sparse[1]={level:7,classLevel:{classId:cls.id,level:7}};
const authored=UNLOCK_CATALOG.filter(row=>row.reqAnyOf).map(row=>({id:row.id,kind:row.kind,rows:row.reqAnyOf!,
 labels:row.reqAnyOf!.map(gateRowLabel),levels:gateLevelNeeds(row.reqAnyOf),classLevels:gateClassLevelNeeds(row.reqAnyOf),
 states:accounts.map(({name,account,owned})=>({name,any:gateMet(account,row.reqAnyOf,'any',id=>owned.has(id)),all:gateMet(account,row.reqAnyOf,'all',id=>owned.has(id)),progress:row.reqAnyOf!.map(gate=>gateRowProgress(account,gate,id=>owned.has(id)))}))}));
const effects=[];
for(const mode of ['any','all'] as const){
 const a=makeAccount(),calls:string[]=[],sequence:GateRow[]=[{unlock:'mutate'},{ledger:'late'},{unlock:'tail'}];
 const held=gateMet(a,sequence,mode,id=>{calls.push(id);a.ledger.late=1;sequence.push({unlock:'appended'});return mode==='all';});
 effects.push({mode,held,calls,length:sequence.length,late:a.ledger.late});
}
const output={classes:CLASSES.map(row=>({id:row.id,name:row.name})),rows,matrix,compositions,derivation:{levels,classLevels,aliased,absentLevels:gateLevelNeeds(undefined),absentClasses:gateClassLevelNeeds(undefined),sparseLevels:gateLevelNeeds(sparse),sparseClasses:gateClassLevelNeeds(sparse)},authored,effects};
const encode=(_key:string,value:unknown)=>typeof value==='number'&&!Number.isFinite(value)?{number:String(value)}:value;
fs.writeFileSync(process.argv[2],JSON.stringify(output,encode)+'\n',{flag:'wx'});
