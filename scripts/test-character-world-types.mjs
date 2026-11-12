import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256} from './reference-utils.mjs';

const names=['durable-character-located-types','character-spill-placement-types','character-world-located-types','character-world-adapter-types'];
const fixtures=names.map(name=>path.join(root,'test/character-world',name+'.ts'));
const config=ts.readConfigFile(path.join(root,'tsconfig.json'),ts.sys.readFile);assert(!config.error);
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root);assert.deepEqual(parsed.errors,[]);
const options={...parsed.options,noEmit:true,rootDir:root};
const report={passed:false,sources:{},positiveFixtures:fixtures.length,negativeCases:0};
try{
 const program=ts.createProgram(fixtures,options);
 const diagnostics=ts.getPreEmitDiagnostics(program);
 assert.deepEqual(diagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')),[]);
 for(const source of program.getSourceFiles()){
  const relative=path.relative(root,source.fileName).replaceAll('\\','/');
  if(relative.startsWith('src/')||relative.startsWith('test/character-world/'))report.sources[relative]=sha256(fs.readFileSync(source.fileName));
 }
 for(const file of ['tsconfig.json','scripts/test-character-world-types.mjs'])report.sources[file]=sha256(fs.readFileSync(path.join(root,file)));
 const normalize=file=>path.resolve(file).toLowerCase();
 const negative=new Map(fixtures.map(file=>{
  const text=fs.readFileSync(file,'utf8');report.negativeCases+=(text.match(/@ts-expect-error/g)||[]).length;
  return[normalize(file),text.replaceAll('@ts-expect-error','deliberate-negative-type-control')];
 }));
 assert.equal(report.negativeCases,32);
 const host=ts.createCompilerHost(options),original=host.getSourceFile.bind(host);
 host.getSourceFile=(file,language,...rest)=>negative.has(normalize(file))
  ?ts.createSourceFile(file,negative.get(normalize(file)),language,true):original(file,language,...rest);
 const rejected=ts.getPreEmitDiagnostics(ts.createProgram(fixtures,options,host));
 assert.equal(rejected.length,32);assert(rejected.every(d=>d.category===ts.DiagnosticCategory.Error&&d.file&&negative.has(normalize(d.file.fileName))));
 report.rejections=rejected.map(d=>({file:path.relative(root,d.file.fileName).replaceAll('\\','/'),line:d.file.getLineAndCharacterOfPosition(d.start).line+1,code:d.code}));
 report.passed=true;
}catch(error){report.error=String(error);process.exitCode=1;}
finally{
 report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);
 if(!report.inputsUnchanged){report.passed=false;process.exitCode=1;}
 fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});fs.writeFileSync(path.join(root,'.artifacts/character-world-types.json'),JSON.stringify(report,null,2)+'\n');
}
console.log({passed:report.passed,positiveFixtures:report.positiveFixtures,negativeCases:report.negativeCases,error:report.error});
