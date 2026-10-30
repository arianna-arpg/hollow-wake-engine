import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {hitLandingTree} from './hit-landing-tree.mjs';
const boundary=JSON.parse(fs.readFileSync(path.join(root,'adapters/hollow-wake/hit-landing-boundary.json')));
export const hitLandingDecision='Delegate ordered hit admission and landing reactions through a synchronous continuation, retaining separate captures, borrowed native results, refusal termination and host-owned aftermath';
export function renderHitLanding(source,preflight=false) {
  const t=hitLandingTree(source,preflight),{input,ast,world,hit,admission,landing,header,damageTail,afterTail,imports,damageImport,perceptionImport}=t;
  assert(!/\b(?:engineHitLanding|bindHitLanding|continueLandedHit)\b/.test(input),'Hit landing binding collision');
  const expected=preflight?boundary.original:boundary.installed;
  assert.equal(sha256(header),expected.headerSha256,'Unreviewed landing signature');
  assert.equal(sha256(damageTail),expected.damageTailSha256,'Unreviewed damaging-hit continuation');
  assert.equal(sha256(afterTail),expected.afterTailSha256,'Unreviewed post-damage continuation');
  assert.equal(sha256(damageImport.getText(ast)),expected.damageImportSha256,'Unreviewed landing damage import');
  assert.equal(sha256(perceptionImport.getText(ast)),expected.perceptionImportSha256,'Unreviewed landing perception import');
  for(let i=0;i<3;i++)assert.equal(sha256(admission[i].getText(ast)),boundary.admission[i],'Unreviewed damage admission '+i);
  for(let i=0;i<18;i++)assert.equal(sha256(landing[i].getText(ast)),boundary.landing[i],'Unreviewed landing statement '+i);
  if(preflight)return source;
  const continuation=`private continueLandedHit(
    caster: Actor, inst: SkillInstance, target: Actor, dmgMult: number, depth: number,
    forceDamage: boolean, hitEffects: SkillEffect[] | undefined,
    hitOrigin: Vec2 | undefined, hitTier: number | undefined,
    def: SkillDef, extra: Modifier[], packet: DamagePacket,
    rearHit: boolean, struckTone: DamageType | null, afflictionCarry: number,
    hasDamage: boolean, dealt: number, wasCrit: boolean, landingResult: HitResult | undefined,
  ): void {
    if (hasDamage) {
      const result = landingResult!;`;
  const replacement=header+'{\n    this.engineHitLanding.land(caster, inst, target, dmgMult, depth, forceDamage, hitEffects, hitOrigin, hitTier, def, extra, packet, rearHit, struckTone, afflictionCarry);\n  }\n\n  '+continuation+damageTail+afterTail;
  const bindings=damageImport.importClause?.namedBindings;assert(bindings&&ts.isNamedImports(bindings));assert(!bindings.elements.some(n=>n.name.text==='HitResult'));
  const perceptionBindings=perceptionImport.importClause?.namedBindings;assert(perceptionBindings&&ts.isNamedImports(perceptionBindings));assert.equal(perceptionBindings.elements.filter(n=>n.name.text==='concealmentActive').length,1);
  const retainedPerception=perceptionBindings.elements.filter(n=>n.name.text!=='concealmentActive');
  const edits=[
    {start:hit.getStart(ast),end:hit.end,text:replacement},
    {start:world.members.pos,end:world.members.pos,text:'\n  private readonly engineHitLanding = bindHitLanding(this);\n'},
    {start:imports.at(-1).end,end:imports.at(-1).end,text:"\nimport {bindHitLanding} from './hitLanding';"},
    {start:damageImport.getStart(ast),end:damageImport.end,text:`import { ${bindings.elements.map(n=>n.getText(ast)).join(', ')}, type HitResult } from './damage';`},
    {start:perceptionImport.getStart(ast),end:perceptionImport.end,text:`import { ${retainedPerception.map(n=>n.getText(ast)).join(', ')} } from './perception';`},
  ];
  let output=input;for(const e of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,e.start)+e.text+output.slice(e.end);
  const parsed=ts.createSourceFile('world.ts',output,ts.ScriptTarget.Latest,true);assert.equal(parsed.parseDiagnostics.length,0);
  const method=parsed.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='World').members.find(n=>n.name?.getText(parsed)==='continueLandedHit');
  const block=method.body.statements[0];assert(ts.isIfStatement(block));
  assert.equal(output.slice(block.thenStatement.statements[1].getFullStart(),block.thenStatement.end),damageTail,'Damaging-hit continuation changed');
  assert.equal(output.slice(method.body.statements[1].getFullStart(),method.body.end),afterTail,'Post-damage continuation changed');
  return source.includes('\r\n')?output.replaceAll('\n','\r\n'):output;
}
export function integrateHitLanding(game,write=true) {
  const target='src/engine/hitLanding.ts';assert(!fs.existsSync(path.join(game,target)),'Hit landing binding already exists');
  const output=renderHitLanding(fs.readFileSync(path.join(game,'src/engine/world.ts'),'utf8'),!write);
  const binding=fs.readFileSync(path.join(root,'adapters/hollow-wake/hitLanding.ts'));
  if(write){fs.writeFileSync(path.join(game,'src/engine/world.ts'),output);fs.writeFileSync(path.join(game,target),binding,{flag:'wx'});}
  return {files:['src/engine/world.ts',target],decision:hitLandingDecision};
}
