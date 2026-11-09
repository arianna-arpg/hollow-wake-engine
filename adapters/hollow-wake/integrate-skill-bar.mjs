import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';import {installCharacterSources} from './install-character-sources.mjs';
const files=['src/engine/world.ts','src/meta/skillSlotMemory.ts'];
export function renderSkillBar(file,source,original){
 assert(files.includes(file));const input=source.replaceAll('\r\n','\n'),base=original.replaceAll('\r\n','\n');
 assert(!/\b(?:sdkSkillBar|EngineSkillBarActions|engineSlotMemory|engineSlotRememberable)\b/.test(input),'Skill bar already present');
 const parse=s=>ts.createSourceFile(file,s,ts.ScriptTarget.Latest,true),ast=parse(input),prior=parse(base),edits=[];
 const get=(tree,name)=>{
  let candidates;
  if(file===files[0]){const worlds=tree.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert.equal(worlds.length,1);candidates=worlds[0].members.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(tree)===name);}
  else candidates=tree.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
  assert.equal(candidates.length,1,'Expected one skill bar method '+name);return candidates[0];
 };
 const replace=(name,text)=>{const a=get(ast,name),b=get(prior,name);assert.equal(a.getText(ast),b.getText(prior),'Unreviewed skill bar method '+name);edits.push([a.body.getStart(ast),a.body.end,text]);};
 const at=ast.statements.filter(ts.isImportDeclaration).at(-1).end;
 if(file===files[0]){
  edits.push([at,at,"\nimport {SkillBarActions as EngineSkillBarActions} from '@hollow-wake/engine/skills/bar';"]);
  const world=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');
  edits.push([world.members.pos,world.members.pos,`
  private readonly sdkSkillBar = new EngineSkillBarActions<Seat,Actor,SkillInstance>({
    hero:seat=>this.seatHero(seat), actor:seat=>seat.actor, resolve:(seat,id)=>this.seatSkillById(seat,id),
    remember:(seat,touched)=>this.rememberSkillSlots(seat,touched), rebind:(seat,touched)=>this.rebindWornGrafts(seat,touched),
    recalculate:seat=>this.recalcSeat(seat), isFlask:inst=>inst.def.tags.includes('flask'),
    clearFields:(actor,inst)=>this.clearTreeFields(actor,inst), resync:inst=>this.resyncMinionSupports(inst),
    localSeat:()=>this.localSeat, provisioning:seat=>this.provisioningFlaskSlots.has(seat),
    rememberSlot:(inst,slot,overwrite)=>rememberSkillSlot(this.account.skillSlotMemory,inst,slot,overwrite),
    preferencesDirty:()=>{this.accountDirty=true;},
  });
`]);
  replace('bindSkill','{ return this.sdkSkillBar.bind(seat,slot,skillId); }');
  replace('swapSkillSlots','{ return this.sdkSkillBar.swap(seat,a,b); }');
  replace('rebindWornGrafts','{ this.sdkSkillBar.rebind(seat,touched); }');
  replace('rememberSkillSlots','{ this.sdkSkillBar.remember(seat,touched,overwrite); }');
 }else{
  edits.push([at,at,"\nimport * as engineSlotMemory from '@hollow-wake/engine/skills/bar';\nconst engineSlotRememberable=(inst:SkillInstance)=>SKILL_SLOT_MEMORY_CFG.tags.some(tag=>inst.def.tags.includes(tag));"]);
  replace('restoreSkillSlotMemory','{ return engineSlotMemory.restoreSkillSlotMemory(raw); }');
  replace('rememberSkillSlot','{ return engineSlotMemory.rememberSkillSlot(memory,inst,slot,overwrite,engineSlotRememberable); }');
  replace('planSkillSlots','{ return engineSlotMemory.planSkillSlots(ids,bar,memory); }');
 }
 let out=input;for(const[start,end,text]of edits.sort((a,b)=>b[0]-a[0]))out=out.slice(0,start)+text+out.slice(end);
 return source.includes('\r\n')?out.replaceAll('\n','\r\n'):out;
}
export function integrateSkillBar(game,install=true){
 const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
 const changes=files.map(file=>{const original=fs.readFileSync(path.join(root,'.reference',file));assert.equal(sha256(original),lock.files[file]);const before=fs.readFileSync(path.join(game,file));return{file,before,after:Buffer.from(renderSkillBar(file,before.toString(),original.toString()))};});
 if(install)installCharacterSources(game,changes);
 return{files,decision:'Bar binding, swapping, rebuild handoff and slot preferences use the SDK; live bodies, effects, account authorization and durable publication remain host-owned.'};
}
