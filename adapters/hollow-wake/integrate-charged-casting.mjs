import fs from 'node:fs';import path from 'node:path';import {root,sha256} from '../../scripts/reference-utils.mjs';
import assert from 'node:assert/strict';import ts from 'typescript';
export const chargedCastFile='src/engine/world.ts',chargedCastBridge='src/engine/chargedCastingAdapter.ts';
const file=chargedCastFile,lf=s=>s.replaceAll('\r\n','\n');
const parse=s=>ts.createSourceFile(file,s,ts.ScriptTarget.Latest,true);
const apply=(s,edits)=>{for(const e of edits.sort((a,b)=>b.start-a.start))s=s.slice(0,e.start)+e.text+s.slice(e.end);return s;};
function method(ast,name){const cls=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert(cls);const nodes=cls.members.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)===name);assert.equal(nodes.length,1,name);return nodes[0];}
function clauses(ast){const node=method(ast,'updateCasting'),sw=node.body.statements.find(ts.isSwitchStatement);assert(sw);return sw.caseBlock.clauses;}
export function renderChargedCasting(source,reference){
 const current=lf(source),original=lf(reference),ast=parse(current),base=parse(original),edits=[];
 assert(!current.includes('sdkChargedCasting'),'Charged casting already integrated');
 for(const mode of ['charge','overcharge']){
  const node=clauses(ast).find(n=>ts.isCaseClause(n)&&n.expression.text===mode),old=clauses(base).find(n=>ts.isCaseClause(n)&&n.expression.text===mode);assert(node&&old);
  assert.equal(node.getText(ast),old.getText(base),'Unreviewed '+mode+' case');
  edits.push({start:node.getStart(ast),end:node.end,text:`case '${mode}': { this.sdkChargedCasting().advance(a, dt); break; }`});
 }
 const use=method(ast,'useSkill'),text=use.getText(ast);
 const replacements=[
  ["Math.max(0.2, def.chargeUp.maxTime\n          * caster.sheet.get('effectDuration', skillContextTags(def), instanceMods(inst)))","chargeCastDuration(def.chargeUp.maxTime,\n          caster.sheet.get('effectDuration', skillContextTags(def), instanceMods(inst)))"],
  ['Math.max(0.2,\n            Math.max(ocSpec.time, def.useTime) / caster.speedFactor(inst))','overchargeCastDuration(ocSpec.time, def.useTime, caster.speedFactor(inst))'],
  ["indicatorAt: timing?.kind === 'timed' ? rand(0.3, 0.85) : undefined","indicatorAt: timing?.kind === 'timed' ? overchargeMarker(Math.random()) : undefined"],
 ];
 for(const [before,after]of replacements){assert.equal(text.split(before).length,2,'Changed charged press expression');assert(method(base,'useSkill').getText(base).includes(before));const start=use.getStart(ast)+text.indexOf(before);edits.push({start,end:start+before.length,text:after});}
 const update=method(ast,'updateCasting');
 edits.push({start:update.end,end:update.end,text:`

  private sdkChargedCastingRuntime?: ReturnType<typeof createChargedCasting>;
  private sdkChargedCasting(): ReturnType<typeof createChargedCasting> {
    return this.sdkChargedCastingRuntime ??= createChargedCasting({
      pay: (actor, state, cost) => this.paySkillCost(actor, state.inst, cost),
      stageBanked: (actor, state) => {
        this.flashes.push({pos: vec(actor.pos.x, actor.pos.y), radius: 18 + 7 * state.stage!,
          color: '#ffd700', life: .18, maxLife: .18});
        this.rollTriggers(actor, 'overchargeStage',
          {aim: vec(state.aim.x, state.aim.y), sourceInst: state.inst});
      },
      execute: (actor, state, release) => this.executeSkill(actor, state.inst, state.aim, {
        ...release, targetInfo: state.targetInfo as ResolvedTarget | undefined,
        paidCost: state.paidCost, chargesSpent: state.chargesSpent,
      }),
      cue: (actor, state, kind) => { this.flashes.push(timingCueFlash(actor, kind, state.aim)); },
    });
  }`});
 const last=ast.statements.filter(ts.isImportDeclaration).at(-1).end,line=current.indexOf('\n',last),at=line<0?current.length:line;
 edits.push({start:at,end:at,text:"\nimport {createChargedCasting} from './chargedCastingAdapter';\nimport {chargeCastDuration, overchargeCastDuration, overchargeMarker} from '@hollow-wake/engine/casting/charged';"});
 return apply(current,edits);
}

export function integrateChargedCasting(game,write=true){
 assert(!fs.existsSync(path.join(game,chargedCastBridge)),'Refusing to overwrite charged casting bridge');
 const reference=fs.readFileSync(path.join(root,'.reference',file)),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));assert.equal(sha256(reference),lock.files[file]);
 const source=fs.readFileSync(path.join(game,file),'utf8'),after=renderChargedCasting(source,reference.toString());
 if(write){fs.writeFileSync(path.join(game,file),after.replaceAll('\n',source.includes('\r\n')?'\r\n':'\n'));fs.copyFileSync(path.join(root,'adapters/hollow-wake/chargedCastingAdapter.ts'),path.join(game,chargedCastBridge));}
 return {files:[file,chargedCastBridge]};
}
