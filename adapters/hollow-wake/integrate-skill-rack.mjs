import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {installCharacterSources} from './install-character-sources.mjs';

const file='src/engine/world.ts';
function parse(source){
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  const worlds=ast.statements.filter(node=>ts.isClassDeclaration(node)&&node.name?.text==='World');
  assert.equal(worlds.length,1);
  const method=name=>{
    const matches=worlds[0].members.filter(node=>ts.isMethodDeclaration(node)&&node.name.getText(ast)===name);
    assert.equal(matches.length,1,'Expected one World.'+name);return matches[0];
  };
  return {ast,world:worlds[0],learn:method('learnSkill'),leave:method('unlearnSkill')};
}
// Retain live companion, flask, toggle, graft and quest logic from the
// hash-checked original. Only bag/book/bar transfers move into the SDK.
function portion(method,ast,first,end){
  const rows=method.body.statements.map(s=>s.getText(ast));
  const at=prefix=>{
    const matches=rows.map((s,i)=>s.startsWith(prefix)?i:-1).filter(i=>i>=0);
    assert.equal(matches.length,1,'Expected one host statement: '+prefix);return matches[0];
  };
  const start=at(first),stop=at(end);assert(start<stop);return rows.slice(start,stop).join('\n');
}
export function renderSkillRack(source,original){
  const input=source.replaceAll('\r\n','\n'),current=parse(input),base=parse(original.replaceAll('\r\n','\n'));
  assert(!/\b(?:sdkSkillRack|EngineSkillRackActions)\b/.test(input),'Skill rack binding already present');
  for(const key of ['learn','leave'])assert.equal(current[key].getText(current.ast),base[key].getText(base.ast),'Unreviewed skill rack '+key);
  const {ast,learn,leave}=base;
  const ports=[
    '  private readonly sdkSkillRack = new EngineSkillRackActions<Seat,Actor,SkillInstance,ItemInstance>({',
    '    maxLearned:MAX_LEARNED_SKILLS, hero:seat=>this.seatHero(seat), actor:seat=>seat.actor, known:seat=>seat.meta.knownSkills,',
    '    granted:(seat,id)=>!!seat.grantedInsts?.has(id), bagItem:(seat,uid)=>this.bagItem(seat,uid),',
    '    unpack:skillOfGemItem, pack:makeSkillGemItem, meets:(seat,id)=>this.meetsRequirements(id,seat),',
    '    refusal:(seat,inst)=>this.unlearnRefusal(inst,seat), fail:(actor,key,why)=>this.failNote(actor,key,why),',
    '    remove:(seat,uid)=>{removeFromBag(seat.meta.items,uid);}, freeCells:seat=>freeCellCount(seat.meta.items),',
    '    place:(seat,item,x,y)=>x!==undefined&&y!==undefined?placeAt(seat.meta.items,item,x,y):autoPlace(seat.meta.items,item),',
    '    unlearn:(seat,id)=>this.unlearnSkill(id,seat), dirty:seat=>this.markMetaDirty(seat),',
    '    afterLearn:(seat,inst)=>{',portion(learn,ast,'this.rebindWornGrafts','this.markMetaDirty'),'},',
    '    beforeForget:(seat,p,inst)=>{',portion(leave,ast,'this.rememberSkillSlots','m.knownSkills.delete'),'},',
    '    afterForget:(seat,p,skillId)=>{',portion(leave,ast,'if (p.activeAuras','this.markMetaDirty'),'},',
    '    afterUnlearn:(seat,skillId)=>{',portion(leave,ast,'if (seat === this.localSeat','return true'),'},',
    '  });',
  ].join('\n');
  const imports=current.ast.statements.filter(ts.isImportDeclaration),offset=imports.at(-1).end;
  const edits=[
    [offset,offset,"\nimport {SkillRackActions as EngineSkillRackActions} from '@hollow-wake/engine/skills/rack';"],
    [current.world.members.pos,current.world.members.pos,'\n'+ports+'\n'],
    [current.learn.body.getStart(current.ast),current.learn.body.end,'{ return this.sdkSkillRack.learn(seat,uid,slot); }'],
    [current.leave.body.getStart(current.ast),current.leave.body.end,'{ return this.sdkSkillRack.unlearn(seat,skillId,x,y); }'],
  ];
  let result=input;for(const [a,b,s] of edits.sort((a,b)=>b[0]-a[0]))result=result.slice(0,a)+s+result.slice(b);
  return source.includes('\r\n')?result.replaceAll('\n','\r\n'):result;
}
export function renderSkillRackResume(source,original){
  const input=source.replaceAll('\r\n','\n');
  assert(!input.includes('engineRestoreLearnedSeatIds'),'Skill rack resume already present');
  function locate(text){
    const ast=ts.createSourceFile('character.ts',text,ts.ScriptTarget.Latest,true);
    const methods=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='applySavedCharacter');
    assert.equal(methods.length,1);
    const statements=methods[0].body.statements;
    const index=statements.findIndex(n=>n.getText(ast)==='const bar = [...save.bar];');
    assert(index>=0&&statements[index+3]?.getText(ast).startsWith('world.adoptSavedMeta('),'Unreviewed resume binding');
    return {start:statements[index].getStart(ast),end:statements[index+2].end,imports:ast.statements.filter(ts.isImportDeclaration).at(-1).end};
  }
  const clean=original.replaceAll('\r\n','\n'),a=locate(input),b=locate(clean);
  assert.equal(input.slice(a.start,a.end),clean.slice(b.start,b.end),'Unreviewed skill rack resume');
  let output=input.slice(0,a.start)+'const bar = engineRestoreLearnedSeatIds(save.bar,built.meta.knownSkills.keys(),MAX_LEARNED_SKILLS);'+input.slice(a.end);
  output=output.slice(0,a.imports)+"\nimport {restoreLearnedSeatIds as engineRestoreLearnedSeatIds} from '@hollow-wake/engine/skills/rack';"+output.slice(a.imports);
  return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function integrateSkillRack(game,install=true){
  const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json')));
  const changes=[[file,renderSkillRack],['src/meta/character.ts',renderSkillRackResume]].map(([name,render])=>{
    const original=fs.readFileSync(path.join(root,'.reference',name));
    assert.equal(sha256(original),lock.files[name]);
    const before=fs.readFileSync(path.join(game,name)),after=Buffer.from(render(before.toString(),original.toString()));
    return {file:name,before,after};
  });
  if(install)installCharacterSources(game,changes);
  return {files:changes.map(c=>c.file),decision:'Learn, unlearn and legacy seat restoration use the SDK rack with original world hooks.'};
}
