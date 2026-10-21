import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import {root,sha256} from '../../scripts/reference-utils.mjs';
export const interactiveCastFile='src/engine/world.ts';
import ts from 'typescript';
const lf=s=>s.replaceAll('\r\n','\n');
const parse=s=>ts.createSourceFile('world.ts',s,ts.ScriptTarget.Latest,true);
function method(ast,name){const cls=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');assert(cls);const nodes=cls.members.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)===name);assert.equal(nodes.length,1,name);return nodes[0];}
function focusClause(ast){return method(ast,'updateCasting').body.statements.find(ts.isSwitchStatement).caseBlock.clauses.find(n=>ts.isCaseClause(n)&&n.expression.text==='concentration');}
export function renderInteractiveCasting(source,reference){
 const current=lf(source),original=lf(reference),ast=parse(current),base=parse(original),edits=[];
 assert(!current.includes('advanceFocusCast'),'Interactive casting already integrated');
 const clause=focusClause(ast),old=focusClause(base);assert.equal(clause.getText(ast),old.getText(base),'Unreviewed concentration case');
 const text=clause.getText(ast),prefix=text.slice(0,text.indexOf('        const focused ='));
 const begin='        const end = (fire: boolean, mult = 1): void => {\n',end='        };\n        if (focused)';
 assert(text.includes(begin)&&text.includes(end));
 let finish=text.slice(text.indexOf(begin)+begin.length,text.indexOf(end)).split('\n').map(line=>line.startsWith('  ')?line.slice(2):line).join('\n');
 const cd="def.cooldown / Math.max(0.1,\n              a.sheet.get('cooldownRecovery', tags, extra) / a.sheet.get('cooldownRecovery'))";
 assert(finish.includes(cd));finish=finish.replace(cd,"focusFizzleCooldown(def.cooldown,\n              a.sheet.get('cooldownRecovery', tags, extra), a.sheet.get('cooldownRecovery'))");
 const replacement=prefix+`        const focused = cs.held && quarryLive
          && focusWithinReach(dist(cs.aim, quarry.pos), quarry.radius, slack);
        const outcome = advanceFocusCast(cs, spec, dt, focused);
        if (!outcome) return;
        const fire = outcome.kind === 'release';
        const mult = outcome.kind === 'release' ? outcome.multiplier : 1;
`+finish+`        return;
      }`;
 edits.push({start:clause.getStart(ast),end:clause.end,text:replacement});
 const press=method(ast,'castPress');assert.equal(press.getText(ast),method(base,'castPress').getText(base),'Unreviewed timing press');
 edits.push({start:press.body.getStart(ast),end:press.body.end,text:`{
    this.markSeatActed(caster);
    const cs = caster.casting;
    if (!cs) return;
    const cue = pressCastTiming(cs, instanceStrikeTiming(cs.inst)?.bonus);
    if (cue) {
      this.flashes.push(timingCueFlash(caster, cue, cs.aim));
      this.rollTriggers(caster, 'flawless',
        {aim: vec(cs.aim.x, cs.aim.y), sourceInst: cs.inst});
    }
  }`});
 const use=method(ast,'useSkill'),useText=use.getText(ast),before='Math.max(0.2, def.concentration.time / caster.speedFactor(inst))';
 assert.equal(useText.split(before).length,2,'Changed focus duration expression');assert(method(base,'useSkill').getText(base).includes(before));
 const start=use.getStart(ast)+useText.indexOf(before);edits.push({start,end:start+before.length,text:'focusCastDuration(def.concentration.time, caster.speedFactor(inst))'});
 const last=ast.statements.filter(ts.isImportDeclaration).at(-1).end,line=current.indexOf('\n',last),at=line<0?current.length:line;
 edits.push({start:at,end:at,text:"\nimport {advanceFocusCast, focusCastDuration, focusWithinReach, focusFizzleCooldown, pressCastTiming} from '@hollow-wake/engine/casting/interactive';"});
 let output=current;for(const e of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,e.start)+e.text+output.slice(e.end);return output;
}

export function integrateInteractiveCasting(game,write=true){
 const file=interactiveCastFile,reference=fs.readFileSync(path.join(root,'.reference',file)),lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));assert.equal(sha256(reference),lock.files[file]);
 const source=fs.readFileSync(path.join(game,file),'utf8'),after=renderInteractiveCasting(source,reference.toString());
 if(write)fs.writeFileSync(path.join(game,file),after.replaceAll('\n',source.includes('\r\n')?'\r\n':'\n'));
 return {files:[file]};
}
