import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {sha256} from './reference-utils.mjs';
const lock=JSON.parse(fs.readFileSync('baseline/source-lock.json')),printer=ts.createPrinter({removeComments:true}),sources={};
const selected={
  'src/core/math.ts':['dist','angleTo','angleDiff'],
  'src/engine/skills.ts':['bandSwingGeo'],
  'src/engine/world.ts':['inAoe','zoneHoleSpares'],
};
let code='/** Pinned original combat geometry. Inputs are admitted finite combat facts. */\nexport interface CombatPoint {x:number;y:number}\ntype Vec2=CombatPoint;\ntype AoeShape=number;\nexport interface BandSwingGeo {halfWidth:number;halfDepth:number;standoff:number}\nexport const AOE_SHAPE=Object.freeze({circle:0,square:1,triangle:2,crescent:3,sector:4,band:5});\nexport const AOE_BAND_DEPTH=.4;\nconst CRESCENT_INNER=.55,CRESCENT_ARC=110*Math.PI/180;\n';
for(const [file,names]of Object.entries(selected)){
  const input=fs.readFileSync('.reference/'+file,'utf8');assert.equal(sha256(Buffer.from(input)),lock.files[file],file);sources[file]=lock.files[file];
  const ast=ts.createSourceFile(file,input,99,true);
  for(const name of names){const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text===name);assert(node,name);code+=printer.printNode(ts.EmitHint.Unspecified,node,ast)+'\n';}
}
const destination='src/combat-geometry.ts',hash=sha256(Buffer.from(code));
if(process.argv.includes('--check')){assert.equal(sha256(fs.readFileSync(destination)),hash);console.log({passed:true,functions:6});}
else{assert(!fs.existsSync(destination),'Refusing to overwrite combat geometry');fs.writeFileSync(destination,code);fs.writeFileSync('baseline/combat-geometry-extraction.json',JSON.stringify({sourceCommit:lock.commit,sources,functions:selected,sha256:hash},null,2)+'\n');}
