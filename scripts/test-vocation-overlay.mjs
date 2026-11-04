import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,writeJSON} from './reference-utils.mjs';
import {integrateVocations,renderVocationGrant} from '../adapters/hollow-wake/integrate-vocations.mjs';

fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const directory=fs.mkdtempSync(path.join(root,'.artifacts/vocation-overlay-'));
const source=fs.readFileSync(path.join(root,'.reference/src/engine/world.ts'),'utf8');
const questSource=fs.readFileSync(path.join(root,'.reference/src/quests/vocations.ts'));
const output=renderVocationGrant(source);
assert.equal((output.match(/\bvocationRootId\b/g)??[]).length,0);
assert(renderVocationGrant(source+'\nvoid vocationRootId;\n').includes('vocationRootId,'));
assert.equal(renderVocationGrant(source.replaceAll('\r\n','\n').replaceAll('\n','\r\n')).replaceAll('\r\n','\n'),output.replaceAll('\r\n','\n'));
assert.throws(()=>renderVocationGrant(source.replace('m.vocations.push(vocId)','m.vocations.unshift(vocId)')),/Unreviewed vocation grant/);
assert.throws(()=>renderVocationGrant(source+'\nvoid bindVocationGrants;'),/collision/);

function setup(name) {
  const game=path.join(directory,name),world=path.join(game,'src/engine/world.ts'),quest=path.join(game,'src/quests/vocations.ts');
  fs.mkdirSync(path.dirname(world),{recursive:true});fs.mkdirSync(path.dirname(quest),{recursive:true});
  fs.writeFileSync(world,source);fs.writeFileSync(quest,questSource);
  return {game,world,quest,target:path.join(path.dirname(world),'vocationGrantAdapter.ts')};
}

const {game,world,quest,target}=setup('game');
integrateVocations(game,false);
assert.equal(fs.readFileSync(world,'utf8'),source);assert(fs.readFileSync(quest).equals(questSource));assert(!fs.existsSync(target));
fs.appendFileSync(quest,'\n// unrelated change');assert.throws(()=>integrateVocations(game),/Unreviewed vocation quest/);
assert.equal(fs.readFileSync(world,'utf8'),source);assert(!fs.existsSync(target));fs.writeFileSync(quest,questSource);
const rename=fs.renameSync;
try{
  fs.renameSync=(from,to)=>{if(to===world)throw Error('injected World failure');return rename(from,to);};
  assert.throws(()=>integrateVocations(game),/injected World failure/);
}finally{fs.renameSync=rename;}
assert.equal(fs.readFileSync(world,'utf8'),source);assert(fs.readFileSync(quest).equals(questSource));assert(!fs.existsSync(target));
assert(!fs.readdirSync(path.dirname(quest)).some(name=>name.startsWith('.engine-')));
integrateVocations(game);
assert.equal(fs.readFileSync(world,'utf8'),output);
assert(fs.readFileSync(quest).equals(fs.readFileSync(path.join(root,'adapters/hollow-wake/vocationQuests.ts'))));
assert(fs.readFileSync(target).equals(fs.readFileSync(path.join(root,'adapters/hollow-wake/vocationGrantAdapter.ts'))));
assert.throws(()=>integrateVocations(game),/Unreviewed vocation/);
const other=setup('concurrent');
try{
  fs.renameSync=(from,to)=>{if(to===other.world){fs.writeFileSync(other.quest,'independent writer');throw Error('publication conflict');}return rename(from,to);};
  assert.throws(()=>integrateVocations(other.game),/publication conflict/);
}finally{fs.renameSync=rename;}
assert.equal(fs.readFileSync(other.world,'utf8'),source);assert.equal(fs.readFileSync(other.quest,'utf8'),'independent writer');assert(!fs.existsSync(other.target));
const locked=setup('locked');
try{
  fs.renameSync=(from,to)=>{
    if(to===locked.world)throw Error('injected World failure');
    if(to===locked.quest&&path.basename(from)==='previous')throw Error('locked destination');
    return rename(from,to);
  };
  assert.throws(()=>integrateVocations(locked.game),/Original retained at/);
}finally{fs.renameSync=rename;}
const backups=fs.readdirSync(path.dirname(locked.quest)).filter(f=>f.startsWith('.engine-vocation-'));
assert.equal(backups.length,1);
const backup=path.join(path.dirname(locked.quest),backups[0],'previous');assert(fs.readFileSync(backup).equals(questSource));
assert.equal(fs.readFileSync(locked.world,'utf8'),source);assert(!fs.existsSync(locked.target));
fs.renameSync(backup,locked.quest);fs.rmdirSync(path.dirname(backup));
integrateVocations(locked.game);assert.equal(fs.readFileSync(locked.world,'utf8'),output);
writeJSON(path.join(directory,'verification.json'),{passed:true,directory,originalPreflight:true,sourceGuards:true,rollback:true,retry:true,concurrentWriterPreserved:true,lockedRollbackRetainsOriginal:true});
console.log({passed:true,directory});
