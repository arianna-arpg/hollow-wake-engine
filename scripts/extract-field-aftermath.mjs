import fs from 'node:fs';import assert from 'node:assert/strict';import ts from 'typescript';import {sha256} from './reference-utils.mjs';
const file='src/engine/world.ts',lock=JSON.parse(fs.readFileSync('baseline/source-lock.json')),input=fs.readFileSync('.reference/'+file,'utf8');assert.equal(sha256(Buffer.from(input)),lock.files[file]);
const source=ts.createSourceFile(file,input,99,true),printer=ts.createPrinter({removeComments:true}),names=['mintAftermath','dropLingerField','mintTrailPatch','statTrailSpec','moveBlast','clampGroundTarget','layFissure'],methods=new Map();
function find(n){if(ts.isMethodDeclaration(n)&&names.includes(n.name.getText(source)))methods.set(n.name.getText(source),n);else ts.forEachChild(n,find);}find(source);assert.equal(methods.size,names.length);
const functions=new Set(['instanceDelivery','skillBurstVoice','skillStrikeVoice','skillMovementVoice','skillPresenceVoice','socketSpec','instancePulsePlan','instanceCascadePlan','skillContextTags','grantedTags','instanceMods','instanceSizeOver','hostSockets']);
const transform=context=>{const f=context.factory,p=name=>f.createPropertyAccessExpression(f.createIdentifier('sdk'),name),call=(name,args=[])=>f.createCallExpression(p(name),undefined,args);
  function visit(n){
    if(ts.isPropertyAccessExpression(n)){
      const text=n.getText(source);if(text==='this.flashes.push')return p('flash');
      if(n.expression.kind===ts.SyntaxKind.ThisKeyword){if(names.includes(n.name.text))return n;if(n.name.text==='zones')return f.createPropertyAccessExpression(f.createIdentifier('state'),'zones');if(n.name.text==='time')return call('time');return p(n.name.text);}
    }
    if(ts.isCallExpression(n)){
      if(n.expression.getText(source)==='SIM_TAP.current?.onOccluded')return call('occluded',n.arguments.map(a=>ts.visitNode(a,visit)));
      if(ts.isIdentifier(n.expression)&&functions.has(n.expression.text))return f.updateCallExpression(n,p(n.expression.text),n.typeArguments,n.arguments.map(a=>ts.visitNode(a,visit)));
      if(n.expression.getText(source)==='cosmeticSkillPaint')return call('cosmetic',n.arguments.slice(1).map(a=>ts.visitNode(a,visit)));
    }
    if(ts.isTypeReferenceNode(n)&&n.getText(source)==='Partial<Record<DamageType, number>>')return f.createTypeReferenceNode('F');
    if(ts.isTypeReferenceNode(n)&&ts.isIdentifier(n.typeName)&&['Actor','Vec2','Zone','SkillInstance','AoeShape','GroundDelivery','SkillTag'].includes(n.typeName.text))return n.typeName.text==='Zone'
      ?f.createTypeReferenceNode('CombatField',['A','I','F','B'].map(s=>f.createTypeReferenceNode(s)))
      :f.createTypeReferenceNode({Actor:'A',Vec2:'CombatPoint',SkillInstance:'I',AoeShape:'number',GroundDelivery:'GroundDeliverySpec',SkillTag:'string'}[n.typeName.text]);
    return ts.visitEachChild(n,visit,context);
  }return n=>ts.visitNode(n,visit);
};
let code=`// Original secondary fields, trails, movement bursts and ground targeting.
import {dist,angleTo,type CombatPoint} from './combat-geometry.js';import type {Modifier} from './types.js';
import {flattenPulseQueue,resolveSizeOver,type CombatField,type GroundCascadeSpec} from './combat-fields.js';
import type {AftermathFieldActor,AftermathFieldSkill,AftermathFieldPorts,AftermathFieldState,GroundDeliverySpec,DropZoneSpec} from './field-aftermath-types.js';
export type * from './field-aftermath-types.js';const vec=(x:number,y:number):CombatPoint=>({x,y});const sameStory=(a:{tier:number},b:{tier:number})=>(a.tier??0)===(b.tier??0);
export class FieldAftermath<A extends AftermathFieldActor,I extends AftermathFieldSkill,F,B>{
constructor(readonly state:AftermathFieldState<A,I,F,B>,readonly ports:AftermathFieldPorts<A,I,F,B>){}
`;
for(const name of names){const result=ts.transform(methods.get(name),[transform]),converted=printer.printNode(ts.EmitHint.Unspecified,result.transformed[0],source).replace(/^private /,'');result.dispose();
  const open=converted.indexOf('{',converted.indexOf('):')+2);assert(open>=0);const body=converted.slice(open),locals=[];if(/\bsdk\./.test(body))locals.push('ports:sdk');if(/\bstate\./.test(body))locals.push('state');
  let pre=locals.length?'\nconst {'+locals.join(',')+'}=this;\n':'';if(/\brand\(/.test(body))pre+='const rand=(min:number,max:number)=>min+sdk.random()*(max-min);\n';if(/\bchance\(/.test(body))pre+='const chance=(value:number)=>sdk.random()<value;\n';
  code+=converted.slice(0,open+1)+pre+converted.slice(open+1)+'\n';
}code+='}\n';const destination='src/field-aftermath.ts',hash=sha256(Buffer.from(code));
if(process.argv.includes('--check')){assert.equal(sha256(fs.readFileSync(destination)),hash);console.log({passed:true,methods:names});}
else{
  const manifest='baseline/field-aftermath-extraction.json';let history=[];
  if(process.argv.includes('--refresh-draft')){
    assert(!fs.existsSync('baseline/field-aftermath'),'Accepted observations require a separately reviewed source update');
    const prior=JSON.parse(fs.readFileSync(manifest));assert.equal(sha256(fs.readFileSync(destination)),prior.sha256,'Draft has changed outside this extractor');
    history=[...(prior.history??[]),{methods:prior.methods,sha256:prior.sha256}];
  }else assert(!fs.existsSync(destination),'Refusing to overwrite field aftermath');
  fs.writeFileSync(destination,code);fs.writeFileSync(manifest,JSON.stringify({sourceCommit:lock.commit,sourceSha256:lock.files[file],methods:names,sha256:hash,...(history.length?{history}: {})},null,2)+'\n');
}
