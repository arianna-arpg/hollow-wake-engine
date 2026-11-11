import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync} from 'node:zlib';import ts from 'typescript';import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
assert.equal(process.argv.length,2);
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});const owned=fs.realpathSync(path.join(root,'.artifacts')),work=fs.mkdtempSync(path.join(owned,'summons-package-owned-')),consumer=path.join(work,'consumer');
const read=file=>fs.readFileSync(path.join(root,file)),entries=['birth','offspring'],inputs=['package.json','package-lock.json','scripts/test-summons-package.mjs',...entries.flatMap(n=>['src/summon-'+n+'.ts','test/summon-'+n+'.test.mjs','test/summon-'+n+'-consumer.ts'])];
const report={passed:false,contracts:56,sources:Object.fromEntries(inputs.map(file=>[file,sha256(read(file))])),entries:[],faults:[]},logs={};
const run=(label,args,cwd=consumer)=>{const child=spawnSync(process.execPath,args,{cwd,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:'',NODE_COMPILE_CACHE:path.join(work,'compile-cache'),NPM_CONFIG_CACHE:path.join(work,'npm-cache')}});logs[label]=(child.stdout??'')+'\n'+(child.stderr??'');assert(!child.error&&!child.signal,label+': '+child.error);return child;};
const success=(label,args,cwd)=>assert.equal(run(label,args,cwd).status,0,logs[label]);
const contracts=(label,files=['birth.test.mjs','offspring.test.mjs'],extra=[])=>{success(label,[...extra,'--test',...files]);assert(/(?:#|ℹ) pass 56\b/.test(logs[label]));};
try{
 fs.mkdirSync(consumer);fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
 success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work],root);const archive=path.join(work,JSON.parse(logs.pack)[0].filename);report.archiveSha256=sha256(fs.readFileSync(archive));
 success('install',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund']);
 const tests=new Map();
 for(const name of entries){
  const entry='@hollow-wake/engine/summons/'+name,original=read('test/summon-'+name+'.test.mjs').toString(),local="'../dist/summon-"+name+".js'";assert.equal(original.split(local).length,2);
  const test=original.replace(local,"'"+entry+"'");tests.set(name,test);fs.writeFileSync(path.join(consumer,name+'.test.mjs'),test);
  fs.writeFileSync(path.join(consumer,name+'-types.ts'),read('test/summon-'+name+'-consumer.ts'));
  const module=path.join(consumer,'node_modules/@hollow-wake/engine/dist/summon-'+name+'.js'),bytes=fs.readFileSync(module),types=fs.readFileSync(module.replace(/\.js$/,'.d.ts'));
  assert(bytes.length<(name==='birth'?11:2)*1024);report.entries.push({name,moduleBytes:bytes.length,moduleSha256:sha256(bytes),typesSha256:sha256(types)});
 }
 contracts('installed');
 fs.writeFileSync(path.join(consumer,'entry.mjs'),entries.map(n=>"export * from '@hollow-wake/engine/summons/"+n+"';").join('\n'));
 const bundle=await build({entryPoints:[path.join(consumer,'entry.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,metafile:true,write:false});assert.equal(bundle.outputFiles.length,1);assert(Object.values(bundle.metafile.outputs).every(row=>!row.imports.length));report.browserBytes=bundle.outputFiles[0].contents.length;assert(report.browserBytes<8*1024);
 fs.writeFileSync(path.join(consumer,'browser-built.mjs'),bundle.outputFiles[0].contents);for(const name of entries)fs.writeFileSync(path.join(consumer,name+'-browser.test.mjs'),tests.get(name).replace("'@hollow-wake/engine/summons/"+name+"'","'./browser-built.mjs'"));
 fs.writeFileSync(path.join(consumer,'hostile.mjs'),"Math.random=()=>{throw Error('ambient RNG')};globalThis.fetch=()=>{throw Error('network')};for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw Error(key)}});\n");contracts('browser',['birth-browser.test.mjs','offspring-browser.test.mjs'],['--import','./hostile.mjs']);
 const typeOptions={strict:true,noUncheckedIndexedAccess:true,noEmit:true,target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',types:[],lib:['ES2022']};
 fs.writeFileSync(path.join(consumer,'tsconfig.json'),JSON.stringify({compilerOptions:typeOptions,files:entries.map(n=>n+'-types.ts')}));success('types',[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.json']);report.types=true;
 for(const name of entries){const text=read('test/summon-'+name+'-consumer.ts').toString(),entry="'@hollow-wake/engine/summons/"+name+"'";assert.equal(text.split(entry).length,2);fs.writeFileSync(path.join(work,name+'-source.ts'),text.replace(entry,"'../../src/summon-"+name+".js'"));}
 fs.writeFileSync(path.join(work,'source-tsconfig.json'),JSON.stringify({compilerOptions:typeOptions,files:entries.map(n=>n+'-source.ts')}));success('source-types',[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(work,'source-tsconfig.json')],root);report.sourceTypes=true;
 const faults=[
  [
    "birth",
    "oldest",
    "existing.shift()",
    "existing.pop()"
  ],
  [
    "birth",
    "reservation-equality",
    "caster.reservedMana+reserve>this.p.maxMana(caster)",
    "caster.reservedMana+reserve>=this.p.maxMana(caster)"
  ],
  [
    "birth",
    "toggle",
    "d.persistent&&!d.persistent.toggle",
    "d.persistent"
  ],
  [
    "birth",
    "reservation-commit",
    "caster.reservedMana+=reserve",
    "caster.reservedMana+=0"
  ],
  [
    "birth",
    "mana-clamp",
    "caster.mana=Math.min(caster.mana,this.p.availableMaxMana(caster));",
    "void caster.mana;"
  ],
  [
    "birth",
    "mimic-look",
    "minion.look=caster.look",
    "minion.look=undefined"
  ],
  [
    "birth",
    "crew-identity",
    "this.p.setSource(minion,'summon:crew',d.crewMods)",
    "this.p.setSource(minion,'summon:crew',[...d.crewMods])"
  ],
  [
    "birth",
    "shell-publish",
    "(caster.summonShells??=new Set()).add(minion);",
    "void caster.summonShells;"
  ],
  [
    "birth",
    "shell-kit",
    "minion.skills=[];",
    "void minion.skills;"
  ],
  [
    "birth",
    "decay-divide",
    "(this.p.maxLife(minion)/lifeMult)",
    "this.p.maxLife(minion)"
  ],
  [
    "birth",
    "innate-explosion",
    "Math.max(minion.explodeOnDeath,",
    "Math.min(minion.explodeOnDeath,"
  ],
  [
    "birth",
    "bloom-stamp",
    "minion.bloomIn=bloom;",
    "void bloom;"
  ],
  [
    "birth",
    "zero-duration",
    "if(d.duration)",
    "if(d.duration!==undefined)"
  ],
  [
    "birth",
    "captured-duration",
    "d.duration*this.p.stat(caster,'effectDuration',context)",
    "d.duration*this.p.stat(caster,'effectDuration',this.p.context(inst))"
  ],
  [
    "birth",
    "explicit-angle",
    "const angle=this.p.random(0,Math.PI*2);",
    "const angle=overrides?.pos?0:this.p.random(0,Math.PI*2);"
  ],
  [
    "birth",
    "story",
    "minion.tier=caster.tier",
    "minion.tier=0"
  ],
  [
    "birth",
    "publish",
    "this.p.actors().push(minion);",
    "void minion;"
  ],
  [
    "birth",
    "mend-snapshot",
    "for(const ally of this.p.actors())",
    "for(const ally of [...this.p.actors()])"
  ],
  [
    "birth",
    "legion-clock",
    "inst,spec:socket.def.minionAura,radius:",
    "inst,spec:socket.def.minionAura,since:this.p.time(),radius:"
  ],
  [
    "birth",
    "gift-time",
    "since:this.p.time()",
    "since:17"
  ],
  [
    "birth",
    "override-kind-unchecked",
    "if(!d||(requested!=null&&d.type!=='summon'))return null;",
    "if(!d)return null;"
  ],
  [
    "birth",
    "override-read-repeated",
    "const requested=overrides?.delivery,",
    "const requested=(void overrides?.delivery,overrides?.delivery),"
  ],
  [
    "birth",
    "override-kind-repeated",
    "requested!=null&&d.type!=='summon'",
    "requested!=null&&(void d.type,d.type)!=='summon'"
  ],
  [
    "birth",
    "override-null-fallback-lost",
    "d=requested??this.p.delivery(inst)",
    "d=requested"
  ],
  [
    "birth",
    "override-late-kind-check",
    "const typeId=overrides?.monsterId??this.rollType(d)",
    "if(d.type!=='summon')return null;const typeId=overrides?.monsterId??this.rollType(d)"
  ],
  [
    "offspring",
    "dead-owner",
    "!owner||owner.dead||!inst",
    "!owner||!inst"
  ],
  [
    "offspring",
    "shape-copy",
    "offspring:shape,",
    "offspring:{...shape},"
  ],
  [
    "offspring",
    "skip-zero-draw",
    "this.p.random(0,Math.PI*2)",
    "count===0?0:this.p.random(0,Math.PI*2)"
  ],
  [
    "offspring",
    "round-count",
    "Math.round(action.count??1)",
    "Math.floor(action.count??1)"
  ],
  [
    "offspring",
    "ring-default",
    "Math.cos(angle)*(action.ring??28)",
    "Math.cos(angle)*(action.ring||28)"
  ],
  [
    "offspring",
    "life-default",
    "action.lifespan??8",
    "action.lifespan||8"
  ],
  [
    "offspring",
    "keep-contract",
    "persistent:undefined,poolGroup:undefined",
    "persistent:delivery.persistent,poolGroup:undefined"
  ],
  [
    "offspring",
    "keep-shell",
    "shell:undefined},",
    "shell:delivery.shell},"
  ],
  [
    "offspring",
    "spacing-lost",
    "i/Math.max(1,count)*Math.PI*2",
    "0"
  ],
  [
    "offspring",
    "parent-death-gate",
    "!owner||owner.dead||!inst",
    "!owner||owner.dead||parent.dead||!inst"
  ]
];
 assert.equal(faults.length,35);
 for(const[entry,name,from,to]of faults){
  const runtime=read('src/summon-'+entry+'.ts').toString(),module=path.join(consumer,'node_modules/@hollow-wake/engine/dist/summon-'+entry+'.js'),original=fs.readFileSync(module),label=entry+':'+name;assert.equal(runtime.split(from).length,2,label+' selector');
  const changed=ts.transpileModule(runtime.replace(from,to),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},fileName:'summon-'+entry+'.ts'}).outputText;fs.writeFileSync(module,changed);
  try{assert.equal(run(label,['--test','birth.test.mjs','offspring.test.mjs']).status,1,label+' escaped');assert.match(logs[label],/ERR_ASSERTION/);report.faults.push({entry,name,detected:true,logSha256:sha256(logs[label])});}finally{fs.writeFileSync(module,original);}
 }
 contracts('restored');report.restored=true;report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(read(file))===hash);report.passed=report.passed&&report.inputsUnchanged;
 assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;
 const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,'summons-package.logs.json.gz'),bytes);fs.writeFileSync(path.join(owned,'summons-package.json'),JSON.stringify(report,null,2)+'\n');
}
assert(report.passed,report.failure??'Input changed');console.log({passed:true,contracts:56,faults:report.faults.length,entries:report.entries,browserBytes:report.browserBytes,types:report.types,sourceTypes:report.sourceTypes,restored:report.restored,cleaned:true});
