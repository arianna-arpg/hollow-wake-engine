import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {root,sha256,writeJSON} from './reference-utils.mjs';
import {installVocationPackages} from './vocation-package-tools.mjs';
import {buildCharacterContinuity} from './compile-character-continuity.mjs';
import {npmCli} from './npm-cli.mjs';

const {directory,consumer,sdk,content}=installVocationPackages('character-continuity-package-');
const contentDirectory=path.join(directory,'character-content');
buildCharacterContinuity(contentDirectory);
const npm=(cwd,args)=>execFileSync(process.execPath,[npmCli(),...args,'--cache',path.join(root,'.artifacts/npm-cache')],{cwd,encoding:'utf8',windowsHide:true});
const character=JSON.parse(npm(contentDirectory,['pack','--json','--ignore-scripts','--pack-destination',directory]))[0];
npm(consumer,['install',path.join(directory,character.filename),'--offline','--ignore-scripts','--no-audit','--no-fund']);
const modules={account:'class-account',rewards:'class-rewards',mercenaries:'mercenary-identity',content:'character-continuity-content'};
const specifier=key=>'@hollow-wake/engine/character/'+key;
let tests=fs.readFileSync(path.join(root,'test/character-continuity.test.mjs'),'utf8');
for(const [key,file]of Object.entries(modules)){
  const local="'../dist/"+file+".js'";
  assert.equal(tests.split(local).length,2);tests=tests.replace(local,JSON.stringify(specifier(key)));
}
fs.writeFileSync(path.join(consumer,'contracts.mjs'),tests);
const log=execFileSync(process.execPath,['--test','contracts.mjs'],{cwd:consumer,encoding:'utf8',windowsHide:true});
assert(/(?:#|ℹ) pass 17\b/.test(log));fs.writeFileSync(path.join(directory,'contracts.txt'),log);
fs.writeFileSync(path.join(consumer,'content.mjs'),`import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CharacterContinuityContent} from '${specifier('content')}';
import {createClassAccess,createGemPools,restoreClassAccess,restoreGemPools,serializeClassAccess,serializeGemPools} from '${specifier('account')}';
import {reconcileClassRewards,isSelectableClassSkill} from '${specifier('rewards')}';
const read=name=>fs.readFileSync(new URL(import.meta.resolve('@hollow-wake/character-continuity/'+name)),'utf8');
const bytes=read('character.json'),manifest=JSON.parse(read('manifest.json'));
assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.sha256);
assert.equal(Buffer.byteLength(bytes),manifest.bytes);
const content=new CharacterContinuityContent(JSON.parse(bytes)),p=content.pack;
assert.equal(p.classes.length,39);assert.equal(p.rewards.length,36);
const account={...createClassAccess(p.starterClasses),...createGemPools(p.starterSkills,p.starterSupports),kitPicks:{},invested:{}};
for(const b of p.rewards){account.unlockedClasses.add(b.classId);account.pendingClassUnlocks.add(b.classId);}
const old=p.legacy.rows[0];assert(old);account.invested[old.id]=7.9;
reconcileClassRewards(account,p.rewards,p.legacy.enabled,p.legacy.rows,p.legacy.target);
assert.equal(account.invested[p.legacy.target],7);
reconcileClassRewards(account,p.rewards,p.legacy.enabled,p.legacy.rows,p.legacy.target);
assert.equal(account.invested[p.legacy.target],7);
for(const b of p.rewards)for(const id of b.skillIds){
  assert(account.unlockedSkills.has(id));
  assert.equal(isSelectableClassSkill(account,id,p.starterSkills,p.rewards),p.starterSkills.includes(id));
}
account.pendingClassUnlocks.clear();
for(const b of p.rewards)for(const id of b.skillIds)assert(isSelectableClassSkill(account,id,p.starterSkills,p.rewards));
const saved={...serializeClassAccess(account),...serializeGemPools(account)};
assert.deepEqual(restoreClassAccess(saved,p.starterClasses,p.classes.map(id=>({id}))).unlockedClasses,account.unlockedClasses);
assert.deepEqual(restoreGemPools(saved,p.starterSkills,p.starterSupports).unlockedSkills,account.unlockedSkills);
for(let level=1;level<=4096;level++){
  assert.equal(content.gemLevelCap(level),Math.max(1,Math.ceil(level/5)+1));
  assert.equal(content.passiveBudget(level),level-1);
}
`);
execFileSync(process.execPath,['content.mjs'],{cwd:consumer,windowsHide:true});
fs.writeFileSync(path.join(consumer,'consumer.ts'),`import {createClassAccess,createGemPools,restoreClassAccess,restoreKitPicks} from '${specifier('account')}';
import {reconcileClassRewards,isSelectableClassSkill,type ClassRewardBundle} from '${specifier('rewards')}';
import {normalizedMercenarySkill,createMercenaryIdentity,trimMercenaryAllocations,restoreMercenaryCompany} from '${specifier('mercenaries')}';
import {CharacterContinuityContent,type CharacterContinuityPack} from '${specifier('content')}';
const account={...createClassAccess(['starter']),...createGemPools(['swing'],[]),invested:{old:3}};
const bundles:readonly ClassRewardBundle[]=[{classId:'starter',skillIds:['swing']}];
reconcileClassRewards(account,bundles,false,[{id:'old',kind:'skill'}],'memory');
const selected:boolean=isSelectableClassSkill(account,'swing',[],bundles);
const pending:Set<string>=restoreClassAccess({pendingClassUnlocks:[null,1,'starter']},[],[{id:'starter'}]).pendingClassUnlocks;
const picks:Record<string,Record<string,string>>=restoreKitPicks(null);
const merc=createMercenaryIdentity({name:'Hero',race:'river'},{bar:[null,0],baseAttrs:{might:5}});
const race:string=merc.classDef.race,skill:number|null=merc.opening[0],might:number=merc.attrs.might;
const kept:Set<string>=trimMercenaryAllocations({classId:'hero',allocated:['root']},3,()=> 'root',()=>[]);
const scaled:number=normalizedMercenarySkill(2,3,.5);
restoreMercenaryCompany({mercenary:{snapshot:{id:3},name:'Guest'}},member=>{const name:string=member.name;});
declare const pack:CharacterContinuityPack;
const cap:number=new CharacterContinuityContent(pack).gemLevelCap(12);
// @ts-expect-error A skill handle retains its numeric type.
const wrong:string=merc.opening[0];
// @ts-expect-error Discovery IDs are strings.
restoreClassAccess({unlockedClasses:[7]},[],[]);
`);
writeJSON(path.join(consumer,'tsconfig.json'),{compilerOptions:{strict:true,noEmit:true,module:'NodeNext',moduleResolution:'NodeNext',target:'ES2022',lib:['ES2022'],types:[]},include:['consumer.ts']});
execFileSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json'],{cwd:consumer,windowsHide:true});
const browserBytes={};
for(const [key,file]of Object.entries(modules)){
  const entry=key+'-browser.mjs',output=path.join(directory,entry);
  fs.writeFileSync(path.join(consumer,entry),"export * from '"+specifier(key)+"';");
  const bundled=await build({absWorkingDir:consumer,entryPoints:[entry],bundle:true,minify:true,platform:'browser',format:'esm',metafile:true,outfile:output});
  const inputs=Object.keys(bundled.metafile.inputs);
  assert(inputs.includes('node_modules/@hollow-wake/engine/dist/'+file+'.js'));
  assert(inputs.every(input=>input===entry||[file,'validation','character-progression'].includes(path.basename(input,'.js'))));
  browserBytes[key]=fs.statSync(output).size;assert(browserBytes[key]>0&&browserBytes[key]<=6144,key);
}
const report={passed:true,directory,consumer,contracts:17,classes:39,bundles:36,levels:4096,browserBytes,types:true,
  archives:Object.fromEntries([['sdk',sdk],['catalogue',content],['character',character]].map(([key,item])=>[key,{file:path.join(directory,item.filename),sha256:sha256(fs.readFileSync(path.join(directory,item.filename)))}]))};
writeJSON(path.join(directory,'verification.json'),report);
writeJSON(path.join(root,'.artifacts/character-continuity-package-latest.json'),report);console.log(report);
