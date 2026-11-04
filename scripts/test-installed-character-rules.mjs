import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {readVocationFixture,prepareVocationObserver,captureVocationObserver} from './vocation-reference.mjs';
import {prepareVocationFaultGame} from './vocation-installed-fault-tools.mjs';

const [flag,file]=process.argv.slice(2);assert.equal(flag,'--location');
const location=JSON.parse(fs.readFileSync(path.resolve(file)));
assert(location.characterRulesDecision,'Prepare an integrated character game first');
execFileSync(process.execPath,[path.join(root,'scripts/test-reference-character-rules.mjs'),'--game',location.game],{cwd:root,stdio:'inherit',windowsHide:true});
const {directory,game,copy,verifyUnchanged}=prepareVocationFaultGame(location,'installed-character-rules-');
const {fixtures}=JSON.parse(fs.readFileSync(path.join(root,'baseline/character-rules/acceptance.json')));
const identity=path.join(copy,'dist/character-identity.js'),kits=path.join(copy,'dist/class-kits.js'),claims=path.join(copy,'dist/class-claims.js');
const world=path.join(game,'src/engine/world.ts'),unlocks=path.join(game,'src/meta/unlocks.ts');
const mutations={
  identity:[
    ['pending-selection',identity,'isClassDiscovered(access, id) && !access.pendingClassUnlocks.has(id)','isClassDiscovered(access, id)'],
    ['registered-count',identity,'return count;','return access.unlockedClasses.size;'],
    ['owned-opening',identity,'opening: [...opening]','opening: opening'],
    ['saved-attribute-alias',identity,'baseAttrs: { ...save.baseAttrs }','baseAttrs: save.baseAttrs'],
    ['saved-opening',identity,'...(save.opening ?? classDef.bar)','...classDef.bar'],
    ['saved-name',identity,'save.name?.trim() || classDef.name','save.name || classDef.name'],
    ['mode-stage',identity,'modeStage: save.modeStage ?? 0','modeStage: 0'],
    ['retired-class',identity,'return classes.find(definition => definition.id === id);','return classes.find(definition => definition.id === id) ?? classes[0];']
  ],
  kits:[
    ['unowned-rung',kits,'classTierOwned(account, definition.id, row.tier));','true);',r=>r.matrix.map(m=>m.owned)],
    ['replacement-slot',kits,'row.replaces === base','row.replaces !== base',r=>r.matrix.map(m=>m.choice)],
    ['explicit-pick',kits,'readPick(picks, base) ?? slot?.picked ?? base','slot?.picked ?? readPick(picks, base) ?? base'],
    ['unseated-grant',kits,'bar[free] = grant.skill;','void grant.skill;'],
    ['stale-memory',kits,'delete account.kitPicks[definition.id];','void kept;'],
    ['lose-resolved-opening',world,'const bar = kit ?? classDef.bar;','const bar = classDef.bar;'],
    ['host-starting-opening',world,'engineIdentity.createClassIdentity(classDef,bar)','engineIdentity.createClassIdentity(classDef,classDef.bar)',r=>r.hands.map(h=>h.opening)]
  ],
  claims:[
    ['merged-ledger',unlocks,'isUnlockVisible(view ? {...a,ledger:view} : a,u)','isUnlockVisible(a,u)'],
    ['investment-clear',claims,'ports.clearInvestment(account, row.id);','void row.id;'],
    ['pending-grant',claims,'ports.markPending(account, row);','void row;'],
    ['acknowledgment',unlocks,'a.pendingClassUnlocks.delete(u.payload.classId)','a.pendingClassUnlocks.has(u.payload.classId)'],
    ['gem-support-grant',claims,'account.unlockedSupports.add(id);','void id;'],
    ['chained-settlement',claims,'while (grew) {','if (grew) {']
  ]
};
const results=[];let passed=false;
try {
  for(const [name,changes] of Object.entries(mutations)){
    const entry=prepareVocationObserver(name,game,directory,fixtures),expected=readVocationFixture(name,fixtures);
    if(name==='claims'){
      const code=fs.readFileSync(entry,'utf8'),positive='assert(first.length>0&&second.length===0);';
      assert.equal(code.split(positive).length,2);fs.writeFileSync(entry,code.replace(positive,''));
    }
    const capture=label=>captureVocationObserver(entry,directory,name+'-'+label);
    assert(capture('control').bytes.equals(expected));
    const faults=new Map(fixtures[name].faults.map(r=>[r.name,r.sha256]));
    assert.deepEqual(changes.map(c=>c[0]),[...faults.keys(),...(name==='kits'?['host-starting-opening']:[])]);
    for(const [fault,target,needle,replacement,project] of changes){
      const source=fs.readFileSync(target,'utf8');assert.equal(source.split(needle).length,2,fault);
      fs.writeFileSync(target,source.replace(needle,replacement));
      try{
        const outcome=capture(fault);
        assert(!outcome.bytes.equals(expected),fault);
        // Availability uses a separate fast predicate. A fault in the chooser
        // must change its own results even when the fast predicate stays correct.
        // A host passing the wrong opening can likewise leave the live bar intact.
        if(project)assert.notDeepEqual(project(JSON.parse(outcome.bytes)),project(JSON.parse(expected)),fault);
        else assert.equal(outcome.sha256,faults.get(fault),fault);
        results.push({name,fault,sha256:outcome.sha256,matchedOriginalFault:faults.has(fault)?outcome.sha256===faults.get(fault):null});
      }finally{fs.writeFileSync(target,source);}
    }
    assert(capture('restored').bytes.equals(expected));
  }
  passed=true;
}finally{
  verifyUnchanged();
  writeJSON(path.join(directory,'verification.json'),{passed,directory,results,sourceRestored:true,packageRestored:true,contractSha256:sha256(fs.readFileSync(path.join(root,'baseline/character-rules/acceptance.json')))});
  console.log({passed,directory,detected:results.length});
}
