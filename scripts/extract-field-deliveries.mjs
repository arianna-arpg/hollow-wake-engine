import fs from 'node:fs';import assert from 'node:assert/strict';import ts from 'typescript';import {sha256} from './reference-utils.mjs';
const file='src/engine/world.ts',lock=JSON.parse(fs.readFileSync('baseline/source-lock.json')),input=fs.readFileSync('.reference/'+file,'utf8');assert.equal(sha256(Buffer.from(input)),lock.files[file]);
const source=ts.createSourceFile(file,input,99,true),printer=ts.createPrinter({removeComments:true});let execute;
function find(n){if(ts.isMethodDeclaration(n)&&n.name.getText(source)==='executeSkill')execute=n;else ts.forEachChild(n,find);}find(source);
const sw=execute.body.statements.find(n=>ts.isSwitchStatement(n)&&n.expression.getText(source)==='d.type');assert(sw);
const functions=new Set(['instanceEffects','instanceBirth','effectiveSkillLevel','instanceTurret','socketSpec','instancePulsePlan','instanceSizeOver','hostSockets','instanceCascadePlan','skillPresenceVoice']);
const transform=context=>{const f=context.factory,p=name=>f.createPropertyAccessExpression(f.createIdentifier('sdk'),name);
  function visit(n){
    if(ts.isBreakStatement(n))return f.createReturnStatement(f.createIdentifier('fieldAt'));
    if(ts.isPropertyAccessExpression(n)){
      const text=n.getText(source);if(text==='Math.random')return p('random');if(text==='this.flashes.push')return p('flash');
      if(n.expression.kind===ts.SyntaxKind.ThisKeyword){if(n.name.text==='time')return f.createCallExpression(p('time'),undefined,[]);
        if(['zones','domainSeq','sparkSeq'].includes(n.name.text))return f.createPropertyAccessExpression(f.createIdentifier('state'),n.name.text);return p(n.name.text);}
    }
    if(ts.isCallExpression(n)){
      if(ts.isIdentifier(n.expression)&&functions.has(n.expression.text))return f.updateCallExpression(n,p(n.expression.text),n.typeArguments,n.arguments.map(a=>ts.visitNode(a,visit)));
      if(n.expression.getText(source)==='makeSkillInstance'){assert(ts.isElementAccessExpression(n.arguments[0]));return f.createCallExpression(p('makeSkill'),undefined,[ts.visitNode(n.arguments[0].argumentExpression,visit),ts.visitNode(n.arguments[1],visit)]);}
    }
    if(ts.isElementAccessExpression(n)&&n.expression.getText(source)==='SKILLS')return f.createCallExpression(p('hasSkill'),undefined,[ts.visitNode(n.argumentExpression,visit)]);
    if(ts.isIdentifier(n)&&n.text==='CONJURE_CFG')return f.createPropertyAccessExpression(f.createIdentifier('rules'),'conjure');
    if(ts.isIdentifier(n)&&n.text==='CONSTRUCT_FORWARD_CFG')return f.createPropertyAccessExpression(f.createIdentifier('rules'),'forwarding');
    if(ts.isTypeReferenceNode(n)&&ts.isIdentifier(n.typeName)&&['Actor','Vec2','Zone'].includes(n.typeName.text))return n.typeName.text==='Zone'
      ?f.createTypeReferenceNode('CombatField',['A','I','F','B'].map(s=>f.createTypeReferenceNode(s)))
      :f.createTypeReferenceNode({Actor:'A',Vec2:'CombatPoint'}[n.typeName.text]);
    return ts.visitEachChild(n,visit,context);
  }return n=>ts.visitNode(n,visit);
};
let code=`// Mechanically extracted ground and storm placement; see the extraction manifest.
import {dist,angleTo,AOE_SHAPE,type CombatPoint} from './combat-geometry.js';
import {flattenPulseQueue,resolveSizeOver,type CombatField,type GroundCascadeSpec} from './combat-fields.js';
import {rollDeliveryCount} from './projectile-delivery.js';
import type {FieldDeliveryActor,FieldDeliverySkill,FieldDeliveryPorts,FieldDeliveryState,FieldDeliveryRules,FieldDeliveryFrame,GroundDeliverySpec,StormDeliverySpec} from './field-delivery-types.js';
export type * from './field-delivery-types.js';
const vec=(x:number,y:number):CombatPoint=>({x,y});
export class FieldDeliveries<A extends FieldDeliveryActor<I>,I extends FieldDeliverySkill,F,B extends {onHit?:boolean},G>{
constructor(readonly state:FieldDeliveryState<A,I,F,B>,readonly rules:FieldDeliveryRules,readonly ports:FieldDeliveryPorts<A,I,F,B,G>&{flash(value:{pos:CombatPoint;radius:number;color:string;life:number;maxLife:number;edgeFrac:number}):void}){}
`;
for(const name of ['ground','storm']){const clause=sw.caseBlock.clauses.find(c=>c.expression?.text===name),block=clause.statements[0];assert(ts.isBlock(block));
  const used=new Set();function ids(n){if(ts.isIdentifier(n)&&!(ts.isPropertyAccessExpression(n.parent)&&n.parent.name===n))used.add(n.text);ts.forEachChild(n,ids);}ids(block);
  const locals=['caster','inst','d','aim','tags','extra','useMult','flatBonus','aoeScale','arcScale','cosmeticColor','ventRounds','gPow'].filter(n=>used.has(n));
  code+=`${name}(frame:FieldDeliveryFrame<A,I,F,${name==='ground'?'Ground':'Storm'}DeliverySpec>):CombatPoint|null{\nconst {ports:sdk,state${name==='ground'?',rules':''}}=this,{${locals.join(',')}}=frame;const def=inst.def;let fieldAt:CombatPoint|null=null;\nconst rand=(min:number,max:number)=>min+sdk.random()*(max-min);\n`;
  if(name==='storm')code+='const rollCount=(spec:number|readonly[number,number],bonus:number)=>rollDeliveryCount(spec,bonus,()=>sdk.random());\n';
  for(const node of block.statements){const result=ts.transform(node,[transform]);code+=printer.printNode(ts.EmitHint.Unspecified,result.transformed[0],source)+'\n';result.dispose();}code+='}\n';
}code+='}\n';
const destination='src/field-deliveries.ts',hash=sha256(Buffer.from(code));
if(process.argv.includes('--check')){assert.equal(sha256(fs.readFileSync(destination)),hash);console.log({passed:true,deliveries:['ground','storm']});}
else{assert(!fs.existsSync(destination),'Refusing to overwrite field deliveries');fs.writeFileSync(destination,code);fs.writeFileSync('baseline/field-delivery-extraction.json',JSON.stringify({sourceCommit:lock.commit,sourceSha256:lock.files[file],deliveries:['ground','storm'],sha256:hash},null,2)+'\n');}
