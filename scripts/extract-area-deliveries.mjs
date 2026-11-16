import fs from 'node:fs';import assert from 'node:assert/strict';import ts from 'typescript';import {sha256} from './reference-utils.mjs';
const file='src/engine/world.ts',lock=JSON.parse(fs.readFileSync('baseline/source-lock.json')),input=fs.readFileSync('.reference/'+file,'utf8');assert.equal(sha256(Buffer.from(input)),lock.files[file]);
const source=ts.createSourceFile(file,input,99,true),printer=ts.createPrinter({removeComments:true}),names=['melee','cone','nova','detonateProjectile'];let execute;
function find(n){if(ts.isMethodDeclaration(n)&&n.name.getText(source)==='executeSkill')execute=n;else ts.forEachChild(n,find);}find(source);
const sw=execute.body.statements.find(n=>ts.isSwitchStatement(n)&&n.expression.getText(source)==='d.type');assert(sw);
const functions=new Set(['nearestBody','noteBodyHit','inAoeBody','skillStrikeVoice','skillBurstVoice','skillBeamVoice','skillSelfVoice','skillContextTags']);
const transform=context=>{
  const f=context.factory;const p=name=>f.createPropertyAccessExpression(f.createIdentifier('sdk'),name);
  function visit(n){
    if(ts.isPropertyAccessExpression(n)){
      const text=n.getText(source);
      if(text==='this.assaults.locked')return p('assaultLocked');
      if(text==='this.flashes.push')return p('flash');if(text==='this.zones.push')return p('zone');
      if(n.expression.kind===ts.SyntaxKind.ThisKeyword){if(['actors','projectiles'].includes(n.name.text))return f.createCallExpression(p(n.name.text),undefined,[]);return p(n.name.text);}
    }
    if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&functions.has(n.expression.text))return f.updateCallExpression(n,p(n.expression.text),n.typeArguments,n.arguments.map(a=>ts.visitNode(a,visit)));
    if(ts.isTypeReferenceNode(n)&&ts.isIdentifier(n.typeName)&&['Actor','SegBody','Vec2'].includes(n.typeName.text))return f.createTypeReferenceNode({Actor:'A',SegBody:'AreaBody',Vec2:'CombatPoint'}[n.typeName.text],undefined);
    if(ts.isIndexedAccessTypeNode(n)&&n.getText(source)==='typeof this.projectiles[number]')return f.createTypeReferenceNode('AreaProjectile',[f.createTypeReferenceNode('A'),f.createTypeReferenceNode('I')]);
    return ts.visitEachChild(n,visit,context);
  }return n=>ts.visitNode(n,visit);
};
let code="// Mechanically extracted delivery rules; regenerate only into an absent file.\nimport {dist,angleTo,angleDiff,inAoe,bandSwingGeo,AOE_SHAPE,type CombatPoint} from './combat-geometry.js';\nimport type {AreaActor,AreaSkill,AreaSpecs,AreaFrame,AreaDeliveryPorts,AreaBody,AreaProjectile} from './area-delivery-types.js';\nexport type * from './area-delivery-types.js';\nconst vec=(x:number,y:number):CombatPoint=>({x,y});\nconst sameStory=(a:{tier?:number},b:{tier?:number})=>(a.tier??0)===(b.tier??0);\nexport class AreaDeliveries<A extends AreaActor<A>,I extends AreaSkill,F>{\nconstructor(readonly ports:AreaDeliveryPorts<A,I,F>){}\n";
for(const name of names){
  const clause=sw.caseBlock.clauses.find(c=>c.expression?.text===name);assert(clause);const block=clause.statements[0];assert(ts.isBlock(block));
  const used=new Set();function ids(n){if(ts.isIdentifier(n)&&!(ts.isPropertyAccessExpression(n.parent)&&n.parent.name===n))used.add(n.text);ts.forEachChild(n,ids);}ids(block);
  const locals=['caster','inst','d','aim','origin','tags','extra','useMult','flatBonus','aoeScale','arcScale','cosmeticColor'].filter(n=>used.has(n));
  code+=`${name}(frame:AreaFrame<A,I,F,AreaSpecs['${name}']>):CombatPoint|null{\nconst sdk=this.ports,{${locals.join(',')}}=frame;let fieldAt:CombatPoint|null=null;\n`;
  if(used.has('def'))code+='const def=inst.def;\n';
  for(const node of block.statements){if(ts.isBreakStatement(node))continue;const transformed=ts.transform(node,[transform]);code+=printer.printNode(ts.EmitHint.Unspecified,transformed.transformed[0],source)+'\n';transformed.dispose();}
  code+='return fieldAt;\n}\n';
}code+='}\n';
const destination='src/area-deliveries.ts',hash=sha256(Buffer.from(code));
if(process.argv.includes('--check')){assert.equal(sha256(fs.readFileSync(destination)),hash);console.log({passed:true,deliveries:names});}
else{assert(!fs.existsSync(destination),'Refusing to overwrite area deliveries');fs.writeFileSync(destination,code);fs.writeFileSync('baseline/area-delivery-extraction.json',JSON.stringify({sourceCommit:lock.commit,sourceSha256:lock.files[file],deliveries:names,sha256:hash},null,2)+'\n');}
