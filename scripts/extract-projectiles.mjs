import {checkMaintainedExtraction} from './check-maintained-extraction.mjs';
import fs from 'node:fs';import assert from 'node:assert/strict';import ts from 'typescript';import {sha256} from './reference-utils.mjs';
const lock=JSON.parse(fs.readFileSync('baseline/source-lock.json')),sources={};
function read(file){const text=fs.readFileSync('.reference/'+file,'utf8');assert.equal(sha256(Buffer.from(text)),lock.files[file],file);sources[file]=lock.files[file];return ts.createSourceFile(file,text,99,true);}
const world=read('src/engine/world.ts'),skills=read('src/engine/skills.ts'),flight=read('src/engine/flight.ts'),forms=read('src/engine/projForms.ts'),wall=read('src/engine/fourthwall.ts');
const printer=ts.createPrinter({removeComments:true}),print=(n,s)=>printer.printNode(ts.EmitHint.Unspecified,n,s);
const types=new Map(skills.statements.filter(n=>ts.isInterfaceDeclaration(n)||ts.isTypeAliasDeclaration(n)).map(n=>[n.name.text,n]));
const wanted=new Set(['TrajectorySpec','ProjectileDelivery','ProjectileShape','ProjTrailSpec','FissureTrailSpec','DropZoneSpec','SequelSpec']);
for(const name of wanted){const n=types.get(name);assert(n,name);const walk=x=>{if(ts.isTypeReferenceNode(x)&&ts.isIdentifier(x.typeName)&&types.has(x.typeName.text)&&x.typeName.text!=='SizeEnvelopeSpec')wanted.add(x.typeName.text);ts.forEachChild(x,walk);};walk(n);}
let spec="// Original authored projectile schemas; see projectile-extraction.json.\nimport type {DamageType} from './damage-pipeline-types.js';import type {SizeEnvelopeSpec} from './combat-fields.js';\n";
for(const name of wanted)spec+=print(types.get(name),skills)+'\n';
let math="// Original projectile shape and flight math; explicit random input.\nimport type {CombatPoint as Vec2} from './combat-geometry.js';import type {ProjectileShape} from './projectile-specs.js';\n";
for(const n of flight.statements)if(ts.isFunctionDeclaration(n)&&['spinOffset','weaveOffset'].includes(n.name.text))math+=print(n,flight)+'\n';
math+='export function erraticTurn(erratic:number,dt:number,random:()=>number):number{return (-erratic+random()*(erratic*2))*dt*5;}\n';
for(const n of forms.statements)if(!ts.isImportDeclaration(n))math+=print(n,forms)+'\n';
for(const n of wall.statements)if((ts.isInterfaceDeclaration(n)&&n.name.text==='ViewRect')||(ts.isFunctionDeclaration(n)&&n.name.text==='frameReflect'))math+=print(n,wall)+'\n';
for(const n of world.statements)if(ts.isFunctionDeclaration(n)&&n.name.text==='speedLingerMul')math+=print(n,world).replace(/^function /,'export function ')+'\n';
const names=['spawnProjectile','inheritedFlight','returnTarget','enterReturn','forkProjectile','guidePointOf','nearestProjTarget','kinkProjectile','advanceProjectile','explodeProjectile','projTouches','projTouchesBody','projNose','shedFlightShrapnel','interceptProjectileDomes','updateProjectiles'],methods=new Map();
function find(n){if(ts.isMethodDeclaration(n)&&names.includes(n.name.getText(world)))methods.set(n.name.getText(world),n);else ts.forEachChild(n,find);}find(world);assert.equal(methods.size,names.length);
const functions=new Set(['skillContextTags','instanceMods','applyConversion','instanceTrail','instanceFissureTrail','effectiveSkillLevel','segsHittable','segR','doodadRuleOf','blocksProjectiles','shapeContains','hitSurfaceOf','pushOutOfShape','hitVoiceOf','skillBaseTypeOf','noteBodyHit','grantedTags','socketSpec','mitigateTyped','dominantTypeOf','rollSkillDamage','instanceSequel','instanceEffects','instanceBirth']);
const constants={PROJ_CHILD_DEPTH_MAX:'childDepthMax',PROJ_AURA_TICK:'auraTick',SHRAPNEL_SKILL:'shrapnelSkill',CATCH_SPOT_LOOK:'catchSpotLook'};
const transform=context=>{const f=context.factory,p=name=>f.createPropertyAccessExpression(f.createIdentifier('sdk'),name),call=(name,args=[])=>f.createCallExpression(p(name),undefined,args);
  function visit(n){
    if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.InstanceOfKeyword&&n.right.getText(world)==='GridWalkField')return f.createBinaryExpression(call('shotGrid'),ts.SyntaxKind.ExclamationEqualsEqualsToken,f.createIdentifier('undefined'));
    if(ts.isPropertyAccessExpression(n)){
      const text=n.getText(world);if(text==='Math.random')return p('random');if(text==='this.flashes.push')return p('flash');
      const redirects={'this.guardians.active':'guardiansActive','this.lite.liveCount':'liteCount','this.satellites.visuals.length':'satellitesCount'};if(redirects[text])return call(redirects[text]);
      if(text==='this.walk.cellSize')return f.createPropertyAccessExpression(f.createNonNullExpression(call('shotGrid')),'cellSize');
      const grouped={'this.timeflow.actorScale':'actorScale','this.attackSequences.flight':'sequenceFlight','this.attackSequences.beforeContact':'sequenceBeforeContact','this.attackSequences.contact':'sequenceContact','this.satellites.reflectProjectiles':'reflectSatellites','this.guardians.intercept':'interceptGuardians'};if(grouped[text])return p(grouped[text]);
      if(text==='FOURTH_WALL_CFG.proj.edgePad'||text==='FOURTH_WALL_CFG.proj.flashPad')return f.createPropertyAccessExpression(f.createIdentifier('rules'),text.endsWith('edgePad')?'frameEdgePad':'frameFlashPad');
      if(text==='SEQUEL_CFG.maxDepth')return f.createPropertyAccessExpression(f.createIdentifier('rules'),'sequelMaxDepth');
      if(text==='SEG_CFG.HEAD')return f.createPropertyAccessExpression(f.createIdentifier('rules'),'headSegment');
      if(n.expression.kind===ts.SyntaxKind.ThisKeyword){if(names.includes(n.name.text)||n.name.text==='flightScratch')return n;
        if(['projectiles','zones'].includes(n.name.text))return f.createPropertyAccessExpression(f.createIdentifier('state'),n.name.text);
        if(['time','actors','arena'].includes(n.name.text))return call(n.name.text);return p(n.name.text);}
    }
    if(ts.isCallExpression(n)){
      const name=n.expression.getText(world);if(name==='SIM_TAP.current?.onOccluded')return call('occluded',n.arguments.map(a=>ts.visitNode(a,visit)));
      if(name==='cosmeticSkillPaint')return call('cosmetic',n.arguments.slice(1).map(a=>ts.visitNode(a,visit)));
      if(name==='castGridRay')return call('castGridRay',n.arguments.slice(1).map(a=>ts.visitNode(a,visit)));
      if(name==='makeSkillInstance')return call('makeSkill',n.arguments.map((a,i)=>i===0?f.createNonNullExpression(ts.visitNode(a,visit)):ts.visitNode(a,visit)));
      if(name==='erraticTurn')return f.updateCallExpression(n,n.expression,undefined,[...n.arguments.map(a=>ts.visitNode(a,visit)),p('random')]);
      if(ts.isIdentifier(n.expression)&&functions.has(name))return f.updateCallExpression(n,p(name),n.typeArguments,n.arguments.map(a=>ts.visitNode(a,visit)));
    }
    if(ts.isElementAccessExpression(n)&&n.expression.getText(world)==='SKILLS')return call('skill',[ts.visitNode(n.argumentExpression,visit)]);
    if(ts.isElementAccessExpression(n)&&n.expression.getText(world)==='REMNANT_COLORS')return f.createElementAccessExpression(f.createPropertyAccessExpression(f.createIdentifier('rules'),'elementColors'),ts.visitNode(n.argumentExpression,visit));
    if(ts.isIdentifier(n)&&constants[n.text])return f.createPropertyAccessExpression(f.createIdentifier('rules'),constants[n.text]);
    if(ts.isTypeReferenceNode(n)&&ts.isIdentifier(n.typeName)){const name=n.typeName.text;
      if(name==='Projectile')return f.createTypeReferenceNode('CombatProjectile',['A','I'].map(s=>f.createTypeReferenceNode(s)));
      if(['Actor','SkillInstance','Vec2','RemnantElement'].includes(name))return f.createTypeReferenceNode({Actor:'A',SkillInstance:'I',Vec2:'CombatPoint',RemnantElement:'DamageType'}[name]);
    }
    return ts.visitEachChild(n,visit,context);
  }return n=>ts.visitNode(n,visit);
};
let code=`// Mechanically extracted creation, flight, contact and retirement policy.
import {dist,angleTo,angleDiff,inAoe,type CombatPoint} from './combat-geometry.js';
import {spinOffset,weaveOffset,erraticTurn,projFormTouches,projFormNose,frameReflect,speedLingerMul} from './projectile-math.js';
import {resolveSizeOver} from './combat-fields.js';import {parryCounter,type ParryDamage} from './parry-damage.js';
import type {DamageType} from './damage-pipeline-types.js';
import type {ProjectileDelivery} from './projectile-specs.js';
import type {CombatProjectile,InheritedFlight,ProjectileActor,ProjectileSkill,ProjectilePorts,ProjectileState,ProjectileRules,SegBody} from './projectile-types.js';
export type * from './projectile-types.js';
const vec=(x:number,y:number):CombatPoint=>({x,y});
export class Projectiles<A extends ProjectileActor<A,I>,I extends ProjectileSkill,B extends {onHit?:boolean}>{
private readonly flightScratch=vec(0,0);
constructor(readonly state:ProjectileState<A,I,B>,readonly rules:ProjectileRules,readonly ports:ProjectilePorts<A,I,B>){}
`;
for(const name of names){const result=ts.transform(methods.get(name),[transform]),converted=print(result.transformed[0],world).replace(/^private /,'');result.dispose();
  const brace=converted.indexOf('{',converted.indexOf('):')+2);assert(brace>=0);const body=converted.slice(brace),locals=[];
  if(/\bsdk\./.test(body))locals.push('ports:sdk');if(/\bstate\./.test(body))locals.push('state');if(/\brules\./.test(body))locals.push('rules');
  let pre=locals.length?'\nconst {'+locals.join(',')+'}=this;\n':'';if(/\brand\(/.test(body))pre+='const rand=(min:number,max:number)=>min+sdk.random()*(max-min);\n';if(/\bchance\(/.test(body))pre+='const chance=(value:number)=>sdk.random()<value;\n';
  code+=converted.slice(0,brace+1)+pre+converted.slice(brace+1)+'\n';
}code+='}\n';code=code.replace('parryCounter,type ParryDamage','parryCounter');
// Shared projectile record: keep the original fields; only actor/skill/point types change.
const projectile=world.statements.find(n=>ts.isInterfaceDeclaration(n)&&n.name.text==='Projectile');assert(projectile);
const inherited=world.statements.find(n=>ts.isInterfaceDeclaration(n)&&n.name.text==='InheritedFlight');assert(inherited);
let record=print(projectile,world).replace('interface Projectile {','interface CombatProjectile<A,I> {').replace(/\bVec2\b/g,'CombatPoint').replace(/\bActor\b/g,'A').replace(/\bSkillInstance\b/g,'I').replace(/import\(['"]\.\/cosmetics['"]\)\.CosmeticMotif/g,'string');
record+= '\n'+print(inherited,world).replace(/^interface /,'export interface ')+'\n';
const outputs={'src/projectile-specs.ts':spec,'src/projectile-math.ts':math,'src/projectiles.ts':code,'src/projectile-record.ts':"import type {CombatPoint} from './combat-geometry.js';import type {DamageType} from './damage-pipeline-types.js';import type {ParryDamage} from './parry-damage.js';import type {ProjectileDelivery,ProjectileShape,ProjTrailSpec,FissureTrailSpec} from './projectile-specs.js';\n"+record};
if(process.argv.includes('--check')){for(const [file,body]of Object.entries(outputs))checkMaintainedExtraction(file,body);console.log({passed:true,methods:names});}
else{for(const file of Object.keys(outputs))assert(!fs.existsSync(file),'Refusing to overwrite '+file);for(const [file,body]of Object.entries(outputs))fs.writeFileSync(file,body);fs.writeFileSync('baseline/projectile-extraction.json',JSON.stringify({sourceCommit:lock.commit,sources,methods:names,sha256:Object.fromEntries(Object.entries(outputs).map(([k,v])=>[k,sha256(Buffer.from(v))]))},null,2)+'\n');}
