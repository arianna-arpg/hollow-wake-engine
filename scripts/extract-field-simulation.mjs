import {checkMaintainedExtraction} from './check-maintained-extraction.mjs';
import fs from 'node:fs';import assert from 'node:assert/strict';import ts from 'typescript';import {sha256} from './reference-utils.mjs';
const file='src/engine/world.ts',lock=JSON.parse(fs.readFileSync('baseline/source-lock.json')),input=fs.readFileSync('.reference/'+file,'utf8');assert.equal(sha256(Buffer.from(input)),lock.files[file]);
const source=ts.createSourceFile(file,input,99,true),printer=ts.createPrinter({removeComments:true}),names=['updateZones','expireZone','updateZoneDomain','zoneVictims','zoneSees','zoneHas','strikeZoneSurfaces','detonateFissureSegment','spawnAftershocks'],methods=new Map();
function find(n){if(ts.isMethodDeclaration(n)&&names.includes(n.name.getText(source)))methods.set(n.name.getText(source),n);else ts.forEachChild(n,find);}find(source);assert.equal(methods.size,names.length);
const functions=new Set(['bodyWhere','noteBodyHit','combatCueFlash','skillPresenceVoice','presenceProfile','instanceDelivery','socketSpec','baselineStatusDps','skillContextTags','instanceMods','isDormant']);
const transform=context=>{const f=context.factory,p=name=>f.createPropertyAccessExpression(f.createIdentifier('sdk'),name),call=(name,args=[])=>f.createCallExpression(p(name),undefined,args);
  function visit(n){
    if(ts.isPropertyAccessExpression(n)){
      const text=n.getText(source);if(text==='Math.random')return p('random');if(text==='this.flashes.push')return p('flash');
      if(text==='this.bossRun.bossId')return f.createPropertyAccessExpression(f.createNonNullExpression(call('activeBoss')),'bossId');
      if(text==='this.zone.level')return call('encounterLevel');if(text==='PRESENCE_STYLE.expire')return f.createPropertyAccessExpression(f.createIdentifier('rules'),'expireCueSeconds');
      if(text==='MADDEN_CFG.epsilon')return f.createPropertyAccessExpression(f.createIdentifier('rules'),'maddenEpsilon');
      if(text==='LOS_CFG.zoneTickTypes')return f.createPropertyAccessExpression(f.createIdentifier('rules'),'occludingDeliveries');
      if(text==='MONSTERS[a.defId]?.passive')return call('passiveMonster',[f.createPropertyAccessExpression(f.createIdentifier('a'),'defId')]);
      if(n.expression.kind===ts.SyntaxKind.ThisKeyword){
        if(names.includes(n.name.text))return n;if(n.name.text==='zones')return f.createPropertyAccessExpression(f.createIdentifier('state'),'zones');
        if(['time','actors'].includes(n.name.text))return call(n.name.text);if(n.name.text==='bossRun')return call('activeBoss');return p(n.name.text);
      }
    }
    if(ts.isCallExpression(n)){
      if(n.expression.getText(source)==='this.walk?.regionAt')return call('regionAt',n.arguments.map(a=>ts.visitNode(a,visit)));
      if(ts.isIdentifier(n.expression)&&functions.has(n.expression.text))return f.updateCallExpression(n,p(n.expression.text),n.typeArguments,n.arguments.map(a=>ts.visitNode(a,visit)));
      if(n.expression.getText(source)==='makeSkillInstance')return call('makeSkill',[ts.visitNode(n.arguments[0].argumentExpression,visit),ts.visitNode(n.arguments[1],visit)]);
    }
    if(ts.isElementAccessExpression(n)&&n.expression.getText(source)==='SKILLS')return call('hasSkill',[ts.visitNode(n.argumentExpression,visit)]);
    if(ts.isTypeReferenceNode(n)&&ts.isIdentifier(n.typeName)&&['Actor','Vec2','Zone','SkillInstance','AoeShape'].includes(n.typeName.text))return n.typeName.text==='Zone'
      ?f.createTypeReferenceNode('CombatField',['A','I','F','B'].map(s=>f.createTypeReferenceNode(s)))
      :f.createTypeReferenceNode({Actor:'A',Vec2:'CombatPoint',SkillInstance:'I',AoeShape:'number'}[n.typeName.text]);
    if(ts.isTypeQueryNode(n)&&n.exprName.getText(source)==='this.zones')return f.createArrayTypeNode(f.createTypeReferenceNode('CombatField',['A','I','F','B'].map(s=>f.createTypeReferenceNode(s))));
    return ts.visitEachChild(n,visit,context);
  }return n=>ts.visitNode(n,visit);
};
let code=`// Mechanically extracted field clock and contact policy; see extraction manifest.
import {dist,angleTo,inAoe,zoneHoleSpares,AOE_SHAPE,type CombatPoint} from './combat-geometry.js';
import {evalFieldCurve as evalCurve,type CombatField} from './combat-fields.js';
import type {FieldSimulationActor,FieldSimulationSkill,FieldSimulationPorts,FieldSimulationRules} from './field-simulation-types.js';
export type * from './field-simulation-types.js';
const vec=(x:number,y:number):CombatPoint=>({x,y});const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export class FieldSimulation<A extends FieldSimulationActor<A,I>,I extends FieldSimulationSkill,F,B>{
constructor(readonly state:{zones:CombatField<A,I,F,B>[]},readonly rules:FieldSimulationRules,readonly ports:FieldSimulationPorts<A,I,F,B>){}
`;
for(const name of names){const method=methods.get(name),result=ts.transform(method,[transform]),converted=printer.printNode(ts.EmitHint.Unspecified,result.transformed[0],source).replace(/^private /,'');result.dispose();
  const open=converted.indexOf('{',converted.indexOf('):')+2);assert(open>=0);
  // zoneHas uses a structural object parameter; method body's brace follows the return type.
  const used=(pattern)=>pattern.test(converted.slice(open));const locals=[];if(used(/\bsdk\./))locals.push('ports:sdk');if(used(/\bstate\./))locals.push('state');if(used(/\brules\./))locals.push('rules');
  let pre=locals.length?'\nconst {'+locals.join(',')+'}=this;\n':'';
  if(used(/\brand\(/))pre+='const rand=(min:number,max:number)=>min+sdk.random()*(max-min);\n';
  if(used(/\bchance\(/))pre+='const chance=(value:number)=>sdk.random()<value;\n';
  if(used(/\bpick\(/))pre+='const pick=<T>(pool:T[]):T=>pool[Math.floor(sdk.random()*pool.length)]!;\n';
  code+=converted.slice(0,open+1)+pre+converted.slice(open+1)+'\n';
}code+='}\n';
const destination='src/field-simulation.ts',hash=sha256(Buffer.from(code));
if(process.argv.includes('--check')){checkMaintainedExtraction(destination,code);console.log({passed:true,methods:names});}
else{assert(!fs.existsSync(destination),'Refusing to overwrite field simulation');fs.writeFileSync(destination,code);fs.writeFileSync('baseline/field-simulation-extraction.json',JSON.stringify({sourceCommit:lock.commit,sourceSha256:lock.files[file],methods:names,sha256:hash},null,2)+'\n');}
