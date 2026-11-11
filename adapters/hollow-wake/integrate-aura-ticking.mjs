import assert from 'node:assert/strict';import ts from 'typescript';import fs from 'node:fs';import path from 'node:path';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {installCharacterSources} from './install-character-sources.mjs';
const entry='@hollow-wake/engine/auras/ticking';
const binding=`
 private engineAuraTick=new EngineAuraTick<Actor,SkillInstance,AuraDelivery['aura'],DamageType,Modifier,ReturnType<typeof instanceMods>>({
  actors:()=>this.actors,enemies:a=>this.enemiesOf(a),context:i=>instanceMods(i),aura:d=>d.delivery.type==='aura'?d.delivery:undefined,time:()=>this.time,
  skillStat:(a,k,d,c,t)=>a.sheet.get(k,skillContextTags(d,t?[t]:undefined),c),stat:(a,k)=>a.sheet.get(k),maxLife:a=>a.maxLife(),maxMana:a=>a.maxMana(),
  sameStory:(a,b)=>sameStory(a,b),inside:(b,au,a)=>inAoe(b.pos,au.radius,au.shape,b.facing,a.pos,a.radius),
  retire:(a,k)=>this.deactivateAura(a,k),spendCharge:(a,k,n)=>a.spendCharge(k,n),modifier:(k,op,v)=>mod(k,op,v),
  setSource:(a,k,m)=>a.sheet.setSource(k,m),removeSource:(a,k)=>a.sheet.removeSource(k),
  convert:(a,n,d,c,t)=>applyConversion(a,n,skillContextTags(d,[t]),c),resistance:(a,t)=>resistValue(a,t),
  damageText:(a,n,dt)=>this.accumulateDotText(a,n,dt),heal:(a,n)=>a.healBy(n),resourceFlow:(a,e,n,i)=>noteResourceFlow(a,e,'life',n,i.def.feedingCue),
  kill:(a,b)=>this.kill(a,false,b),presence:a=>{this.presenceMoment(a,'pulse');},healText:(a,n)=>this.text(a.pos,'+'+Math.round(n),'#6fc06f',12),
 });
`;
export function renderAuraTick(source,original){
 const input=source.replaceAll('\r\n','\n'),pinned=original.replaceAll('\r\n','\n');assert(!input.includes(entry)&&!/(?:engineAuraTick|EngineAuraTick)/.test(input),'Tick binding collision');
 const parse=text=>{const ast=ts.createSourceFile('world.ts',text,ts.ScriptTarget.Latest,true),owners=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert.equal(owners.length,1);const methods=owners[0].members.filter(n=>ts.isMethodDeclaration(n)&&n.name?.getText(ast)==='updateAuras');assert.equal(methods.length,1);assert(methods[0].body);return{ast,owner:owners[0],method:methods[0]};};
 const live=parse(input),clean=parse(pinned);assert.equal(sha256(live.method.getText(live.ast)),sha256(clean.method.getText(clean.ast)),'Unreviewed aura tick command');
 const edits=[[live.method.body.getStart(live.ast),live.method.body.end,'{ this.engineAuraTick.update(dt); }'],[live.owner.members.pos,live.owner.members.pos,binding],[0,0,"import {AuraTick as EngineAuraTick} from '"+entry+"';\n"]];
 let result=input;for(const[start,end,text]of edits.sort((a,b)=>b[0]-a[0]))result=result.slice(0,start)+text+result.slice(end);return source.includes('\r\n')?result.replaceAll('\n','\r\n'):result;
}

/** Preflight the complete ticking command before installing its replacement. */
export function integrateAuraTick(game,install=true){
 const file='src/engine/world.ts',lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),pinned=fs.readFileSync(path.join(root,'.reference',file));assert.equal(sha256(pinned),lock.files[file]);
 const before=fs.readFileSync(path.join(game,file)),after=Buffer.from(renderAuraTick(before.toString(),pinned.toString()));
 if(install)installCharacterSources(game,[{file,before,after}]);
 return{files:[file],decision:'Aura ticking retains expiry, upkeep, membership, typed damage, siphon, pulses and synchronous callback ordering. Hosts provide frame admission, spatial selection, stats, retirement, death and presentation.'};
}
