import {checkMaintainedExtraction} from './check-maintained-extraction.mjs';
import fs from 'node:fs';import assert from 'node:assert/strict';import ts from 'typescript';import {sha256} from './reference-utils.mjs';
const file='src/engine/world.ts',lock=JSON.parse(fs.readFileSync('baseline/source-lock.json')),input=fs.readFileSync('.reference/'+file,'utf8');assert.equal(sha256(Buffer.from(input)),lock.files[file]);
const source=ts.createSourceFile(file,input,99,true),printer=ts.createPrinter({removeComments:true});let method;
function find(n){if(ts.isMethodDeclaration(n)&&n.name.getText(source)==='executeSkill')method=n;else ts.forEachChild(n,find);}find(source);assert(ts.isSwitchStatement(method.body.statements[51]));
const functions=new Set(['replenishingDelivery','instanceMods','grantedTags','skillContextTags','socketSpec','feedingCueFlash','instanceCurseField','instanceTargeting','skillSelfVoice','resolveInvocation','noteProcCue','instanceInvocation','instanceTethers','instanceAim','statusReqs','instanceUseCharges','payloadTransition','instanceDelivery','instanceVariance','combatCueFlash']);
const transform=context=>{const f=context.factory,p=name=>f.createPropertyAccessExpression(f.createIdentifier('sdk'),name),call=(name,args=[])=>f.createCallExpression(p(name),undefined,args);
  function visit(n){
    if(ts.isReturnStatement(n))return f.createReturnStatement(f.createObjectLiteralExpression([f.createPropertyAssignment('completed',ts.visitNode(n.expression,visit))]));
    if(ts.isPropertyAccessExpression(n)){
      const text=n.getText(source),aliases={'this.challenges.prepare':'prepareChallenge','this.attackSequences.prepare':'prepareAttack','this.guardArts.cast':'guardCast','this.flashes.push':'flash'};
      if(aliases[text])return p(aliases[text]);if(text==='this.lite.liveCount')return call('denseCount');if(text==='MONSTERS[e.defId]?.boss')return call('bossMonster',[f.createPropertyAccessExpression(f.createIdentifier('e'),'defId')]);
      if(text==='RUNE_INFO[last]?.color')return call('runeColor',[f.createIdentifier('last')]);
      const rules={'DEFENSE_CFG.empower.weights':'empower','CORPSE_CFG.batch.aoePerExtra':'corpseAreaPerExtra','COSMETIC_CFG.cast':'cosmetic'};if(rules[text])return f.createPropertyAccessExpression(f.createIdentifier('rules'),rules[text]);
      if(n.expression.kind===ts.SyntaxKind.ThisKeyword){if(['corpses','pendingSteps','pendingRepeats','zones'].includes(n.name.text))return f.createPropertyAccessExpression(f.createIdentifier('state'),n.name.text);if(n.name.text==='actors')return call('actors');return p(n.name.text);}
    }
    if(ts.isCallExpression(n)){
      if(ts.isIdentifier(n.expression)&&functions.has(n.expression.text))return f.updateCallExpression(n,p(n.expression.text),n.typeArguments,n.arguments.map(a=>ts.visitNode(a,visit)));
      if(n.expression.getText(source)==='cosmeticSkillPaint')return call('cosmetic',n.arguments.slice(1).map(a=>ts.visitNode(a,visit)));
      if(n.expression.getText(source)==='makeInvocationPayload')return call('invocationPayload',[ts.visitNode(n.arguments[0],visit),ts.visitNode(n.arguments[1].argumentExpression,visit),ts.visitNode(n.arguments[2],visit)]);
    }
    if(ts.isElementAccessExpression(n)&&n.expression.getText(source)==='SKILLS')return call('hasSkill',[ts.visitNode(n.argumentExpression,visit)]);
    if(ts.isTypeReferenceNode(n)&&ts.isIdentifier(n.typeName)&&['Actor','Vec2','DamageType','RuneId','GroundDelivery'].includes(n.typeName.text))return f.createTypeReferenceNode({Actor:'A',Vec2:'CombatPoint',DamageType:'string',RuneId:'string',GroundDelivery:'GroundDeliverySpec'}[n.typeName.text]);
    return ts.visitEachChild(n,visit,context);
  }return n=>ts.visitNode(n,visit);
};
let code=`// Ordered preparation extracted from executeSkill; campaign deed recording is an optional observer responsibility.
import {dist,angleTo,type CombatPoint} from './combat-geometry.js';import type {GroundDeliverySpec} from './field-delivery-types.js';
import type {PreparationActor,PreparationSkill,PreparationCorpse,PreparationPorts,PreparationState,PreparationRules,PreparationOptions,PreparedCast} from './cast-preparation-types.js';
export type * from './cast-preparation-types.js';const vec=(x:number,y:number):CombatPoint=>({x,y});
export class CastPreparation<A extends PreparationActor<A,I,B>,I extends PreparationSkill<B>,C extends PreparationCorpse,B,D,Z>{
constructor(readonly state:PreparationState<A,I,C,Z>,readonly rules:PreparationRules,readonly ports:PreparationPorts<A,I,C,B,D,Z>){}
prepare(caster:A,inst:I,aim:CombatPoint,opts:PreparationOptions<A,C>={}):PreparedCast<A,I,C,D>|{completed:boolean}{
const {ports:sdk,state,rules}=this;const rand=(min:number,max:number)=>min+sdk.random()*(max-min),chance=(value:number)=>sdk.random()<value;
`;
for(let k=0;k<51;k++){if(k===10)continue;if(k===7){code+='sdk.castObserved(caster,inst,!!opts.noRepeat);\n';continue;}const result=ts.transform(method.body.statements[k],[transform]);code+=printer.printNode(ts.EmitHint.Unspecified,result.transformed[0],source)+'\n';result.dispose();}
code+='return {caster,inst,aim,opts,targetInfo,origin,d,tags,extra,useMult,gPow,ventRounds,corpseFeast,flatBonus,aoeScale,arcScale,cosmeticColor,fieldAt};\n}\n}\n';
const destination='src/cast-preparation.ts',hash=sha256(Buffer.from(code));
if(process.argv.includes('--check')){checkMaintainedExtraction(destination,code);console.log({passed:true,phase:'cast preparation'});}
else{assert(!fs.existsSync(destination),'Refusing to overwrite cast preparation');fs.writeFileSync(destination,code);fs.writeFileSync('baseline/cast-preparation-extraction.json',JSON.stringify({sourceCommit:lock.commit,sourceSha256:lock.files[file],statementIndexes:'0..50',omitted:{10:'Optional campaign deed consequence; castObserved remains at the original observation point.'},sha256:hash},null,2)+'\n');}
