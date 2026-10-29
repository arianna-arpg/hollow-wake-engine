import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {hitPreparationTree} from './hit-preparation-tree.mjs';
import {renderStatusVoiceProbe} from './integrate-status-effects.mjs';
const boundary=JSON.parse(fs.readFileSync(path.join(root,'adapters/hollow-wake/hit-preparation-boundary.json')));
export const hitPreparationDecision='Delegate ordered hit preparation through a synchronous continuation, preserving captured definitions, delayed ownership, live records and interception priority without a per-hit result wrapper';
export function renderHitPreparationVoiceProbe(source){
  const input=source.replaceAll('\r\n','\n');assert.equal(sha256(input),boundary.statusVoiceProbeSha256,'Unreviewed preparation voice probe');
  const needle="const src = readFileSync('src/engine/world.ts', 'utf8')";assert.equal(input.split(needle).length-1,1);
  // Follow the moved guise caption into its adapter while retaining every assertion.
  const output=input.replace(needle,needle+" + '\\n' + readFileSync('src/engine/hitPreparation.ts', 'utf8')");
  return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function renderHitPreparation(source,preflight=false){
  const t=hitPreparationTree(source),{input,ast,world,hit,top,header,tail,imports,retired}=t;
  assert(!/\b(?:engineHitPreparation|bindHitPreparation|continuePreparedHit)\b/.test(input),'Hit preparation binding collision');
  assert.equal(sha256(header),boundary.headerSha256,'Unreviewed hit signature');
  assert.equal(sha256(tail),preflight?boundary.originalTailSha256:boundary.installedTailSha256,'Unreviewed hit continuation');
  for(let i=0;i<23;i++)assert.equal(sha256(top[i].getText(ast)),boundary.preparation[i],'Unreviewed preparation statement '+i);
  const continuation=`private continuePreparedHit(
    caster: Actor, inst: SkillInstance, target: Actor, dmgMult: number, depth: number,
    forceDamage: boolean, hitEffects: SkillEffect[] | undefined,
    hitOrigin: Vec2 | undefined, hitTier: number | undefined,
    def: SkillDef, extra: Modifier[], packet: DamagePacket,
    rearHit: boolean, struckTone: DamageType | null, afflictionCarry: number,
  ): void {`;
  const replacement=header+'{\n    this.engineHitPreparation.prepare(caster, inst, target, dmgMult, depth, flatBonus, forceDamage, fromFuse, hitEffects, hitOrigin, hitTier);\n  }\n\n  '+continuation+tail;
  const edits=[
    {start:hit.getStart(ast),end:hit.end,text:replacement},
    {start:world.members.pos,end:world.members.pos,text:'\n  private readonly engineHitPreparation = bindHitPreparation(this);\n'},
    {start:imports.at(-1).end,end:imports.at(-1).end,text:"\nimport {bindHitPreparation} from './hitPreparation';"},
  ];
  for(const[id,removed]of Object.entries({'./victim':['victimScopeArmed','victimTags'],'./tuning':['toneOfAmounts']})){
    const node=retired[id];assert.equal(sha256(node.getText(ast)),boundary.imports[id]);
    const bindings=node.importClause?.namedBindings;assert(bindings&&ts.isNamedImports(bindings));
    assert.equal(bindings.elements.filter(n=>removed.includes(n.name.text)).length,removed.length);
    const retained=bindings.elements.filter(n=>!removed.includes(n.name.text));
    edits.push({start:node.getStart(ast),end:node.end,text:`import { ${retained.map(n=>n.getText(ast)).join(', ')} } from '${id}';`});
  }
  let output=input;for(const e of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,e.start)+e.text+output.slice(e.end);
  const parsed=ts.createSourceFile('world.ts',output,ts.ScriptTarget.Latest,true);assert.equal(parsed.parseDiagnostics.length,0);
  const result=parsed.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World').members.find(n=>n.name?.getText(parsed)==='continuePreparedHit');
  assert.equal(output.slice(result.body.statements[0].getFullStart(),result.body.end),tail,'Continuation body changed');
  return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function integrateHitPreparation(game,write=true){
  const target='src/engine/hitPreparation.ts';assert(!fs.existsSync(path.join(game,target)),'Hit preparation binding already exists');
  const output=renderHitPreparation(fs.readFileSync(path.join(game,'src/engine/world.ts'),'utf8'),!write);
  const probe='balance/probe_statusvoice.ts',probeInput=fs.readFileSync(path.join(game,probe),'utf8');
  const probeOutput=renderHitPreparationVoiceProbe(write?probeInput:renderStatusVoiceProbe(probeInput));
  const binding=fs.readFileSync(path.join(root,'adapters/hollow-wake/hitPreparation.ts'));
  if(write){fs.writeFileSync(path.join(game,'src/engine/world.ts'),output);fs.writeFileSync(path.join(game,probe),probeOutput);fs.writeFileSync(path.join(game,target),binding,{flag:'wx'});}
  return {files:['src/engine/world.ts',target,probe],decision:hitPreparationDecision};
}
