import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256,writeJSON,listFiles,verifyReference} from './reference-utils.mjs';
import {accepted,readVocationFixture,prepareVocationObserver,captureVocationObserver} from './vocation-reference.mjs';

const ref=path.join(root,'.reference'),lock=JSON.parse(fs.readFileSync('baseline/source-lock.json'));
verifyReference(ref,lock);
const expectedBytes=readVocationFixture('survey'), expected=JSON.parse(expectedBytes);
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const directory=fs.mkdtempSync(path.join(root,'.artifacts/vocation-source-faults-')),game=path.join(directory,'game'),src=path.join(game,'src');
fs.mkdirSync(game);fs.cpSync(path.join(ref,'src'),src,{recursive:true,force:false,errorOnExist:true});
fs.symlinkSync(path.join(ref,'node_modules'),path.join(game,'node_modules'),process.platform==='win32'?'junction':'dir');
const entry=prepareVocationObserver('survey',game,directory);
const quest=path.join(src,'quests/vocations.ts'),world=path.join(src,'engine/world.ts');
const originals=new Map([quest,world].map(file=>[file,fs.readFileSync(file,'utf8')]));
for(const file of originals.keys())assert.equal(sha256(fs.readFileSync(file)),accepted.sources[path.relative(src,file).split(path.sep).join('/')],file);
const source=originals.get(world),ast=ts.createSourceFile('world.ts',source,ts.ScriptTarget.Latest,true);
const cls=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');
const method=cls.members.find(m=>ts.isMethodDeclaration(m)&&m.name.getText(ast)==='grantVocation');
assert.equal(sha256(method.getText(ast).replaceAll('\r\n','\n')),accepted.methods.grantVocation.sha256);
const course=(d,id)=>d.grants.find(r=>r.trial.id===id), gate=d=>d.gates.some((g,i)=>g.bits!==expected.gates[i].bits);
const faults=[
  ['odyssey-authority',quest,'powerProgressionOpen(ctx.accountLedger,','powerProgressionOpen(ctx.runLedger,',gate],
  ['duplicate-with-spare-cap',quest,'if (ctx.vocations.includes(v.id)) return false;','if (false && ctx.vocations.includes(v.id)) return false;',d=>d.liveCap.repeat],
  ['character-cap',quest,'ctx.vocations.length >= VOCATION_CFG.maxPerCharacter','ctx.vocations.length > VOCATION_CFG.maxPerCharacter',gate],
  ['unlock-authority',quest,'vocationUnlockedOnAccount(ctx.accountLedger, v.id)','vocationUnlockedOnAccount(ctx.runLedger, v.id)',gate],
  ['secret-discovery-ledger',quest,'ctx.runLedger[vocationDiscoveryKey(v.id)]','ctx.accountLedger[vocationDiscoveryKey(v.id)]',gate],
  ['foreign-class',quest,'ctx.classId !== v.classId && !unlocked','false && ctx.classId !== v.classId && !unlocked',gate],
  ['previous-step-ledger',quest,'ctx.runLedger[vocationStepKey(v.id, stepIndex)]','ctx.accountLedger[vocationStepKey(v.id, stepIndex)]',gate,2],
  ['wrong-final-grant',quest,'grantVocation: last ? v.id : undefined','grantVocation: stepIndex === 0 ? v.id : undefined',d=>d.generated[0].reward.grantVocation!==expected.generated[0].reward.grantVocation],
  ['detached-zone',quest,'zone: step.zone,','zone: {...step.zone},',d=>d.identities.some(v=>!v.borrowedZone)],
  ['detached-giver',quest,'turnIn: {\n      giver: givers,','turnIn: {\n      giver: Array.isArray(givers) ? [...givers] : givers,',d=>d.identities.some(v=>!v.sharedGiver)],
  ['undying-unlock',world,'if (this.metaProgressionActive()) {','if (true) {',d=>course(d,'sealed').after.account===1],
  ['increment-account',world,'this.account.ledger[vocationLedgerKey(vocId)] = 1;','this.account.ledger[vocationLedgerKey(vocId)] = (this.account.ledger[vocationLedgerKey(vocId)] ?? 0) + 1;',d=>course(d,'preexisting-ledger').after.account===7],
  ['run-completion-omitted',world,'bumpLedger(this.ledger, vocationLedgerKey(vocId));','void this.ledger;',d=>course(d,'ordinary').after.run===null],
  ['dirty-before-recalc',world,'this.recalcSeat(seat);\n    this.markMetaDirty(seat);','this.markMetaDirty(seat);\n    this.recalcSeat(seat);',d=>JSON.stringify(course(d,'ordinary').events)!==JSON.stringify(course(expected,'ordinary').events)],
  ['wrong-root',world,'m.allocated.add(vocationRootId(vocId));','m.allocated.add(vocId);',d=>!course(d,'ordinary').after.root],
  ['second-cue-anchor',world,'seat.actor.pos.y - 12','seat.actor.pos.y - 40',d=>JSON.stringify(course(d,'move-between-cues').events)!==JSON.stringify(course(expected,'move-between-cues').events)],
];
assert.deepEqual(faults.map(([name])=>name),accepted.faults);
const control=captureVocationObserver(entry,directory,'control');assert(control.bytes.equals(expectedBytes));
const results=[];let passed=false;
try{
  for(const [name,file,needle,after,detected,count=1]of faults){
    const whole=originals.get(file);
    const from=file===world?method.getStart(ast):0,end=file===world?method.end:whole.length;
    const region=whole.slice(from,end).replaceAll('\r\n','\n');
    assert.equal(region.split(needle).length-1,count,name+' changed anchor');
    fs.writeFileSync(file,whole.slice(0,from)+region.replaceAll(needle,after)+whole.slice(end));
    let run;try{run=captureVocationObserver(entry,directory,name);}finally{fs.writeFileSync(file,whole);}
    const observed=JSON.parse(run.bytes);assert.deepEqual(observed.grants.map(r=>r.error),expected.grants.map(r=>r.error),name+' unrelated exception');
    assert(!run.bytes.equals(expectedBytes)&&detected(observed),name+' did not distinguish its expected behavioral change');
    results.push({name,sha256:run.sha256,logSha256:run.logSha256});writeJSON(path.join(directory,'progress.json'),{results});
  }
  passed=true;
}finally{
  for(const file of listFiles(src))assert.equal(sha256(fs.readFileSync(path.join(src,file))),sha256(fs.readFileSync(path.join(ref,'src',file))),file);
  verifyReference(ref,lock);writeJSON(path.join(directory,'verification.json'),{passed,directory,sourceRestored:true,controlSha256:control.sha256,results});
  console.log({passed,directory,detected:results.length});
}
