import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {gzipSync} from 'node:zlib';import ts from 'typescript';import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
assert.equal(process.argv.length,2);
fs.mkdirSync(path.join(root,'.artifacts'),{recursive:true});
const stem='aura-ticking-package',owned=fs.realpathSync(path.join(root,'.artifacts'));
const read=file=>fs.readFileSync(path.join(root,file)),inputs=['src/aura-ticking.ts','test/aura-ticking.test.mjs','test/aura-ticking-consumer.ts','scripts/test-aura-ticking-package.mjs','package.json','package-lock.json','tsconfig.json'];
const work=fs.mkdtempSync(path.join(owned,'aura-ticking-package-owned-')),consumer=path.join(work,'consumer');fs.mkdirSync(consumer);
const report={passed:false,contracts:48,sources:Object.fromEntries(inputs.map(file=>[file,sha256(read(file))])),faults:[]},logs={};
const run=(label,args,cwd=consumer)=>{const c=spawnSync(process.execPath,args,{cwd,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:'',NODE_COMPILE_CACHE:path.join(work,'compile-cache'),NPM_CONFIG_CACHE:path.join(work,'npm-cache')}});logs[label]=(c.stdout??'')+'\n'+(c.stderr??'');assert(!c.error&&!c.signal,label+': '+c.error);return c;};
const success=(label,args,cwd)=>assert.equal(run(label,args,cwd).status,0,logs[label]);
const contracts=(label,file='contracts.test.mjs')=>{success(label,['--test',file]);assert(/(?:#|ℹ) pass 48\b/.test(logs[label]));};
try{
 success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work],root);
 const archive=path.join(work,JSON.parse(logs.pack)[0].filename);report.archiveSha256=sha256(fs.readFileSync(archive));
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));success('install',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund']);
 const runtime=read('src/aura-ticking.ts').toString(),virtual=path.join(root,'src/aura-ticking.ts');
 const config=ts.getParsedCommandLineOfConfigFile(path.join(root,'tsconfig.json'),{}, {...ts.sys,onUnRecoverableConfigFileDiagnostic:d=>{throw Error(ts.flattenDiagnosticMessageText(d.messageText,'\n'));}});assert(config);
 const tests=read('test/aura-ticking.test.mjs').toString().replace("'../dist/aura-ticking.js'","'@hollow-wake/engine/auras/ticking'");fs.writeFileSync(path.join(consumer,'contracts.test.mjs'),tests);contracts('installed');
 fs.writeFileSync(path.join(consumer,'entry.mjs'),"export * from '@hollow-wake/engine/auras/ticking';\n");
 const bundle=await build({entryPoints:[path.join(consumer,'entry.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,metafile:true,write:false});assert(Object.values(bundle.metafile.outputs).every(row=>!row.imports.length));report.browserBytes=bundle.outputFiles[0].contents.length;assert(report.browserBytes<4*1024);
 fs.writeFileSync(path.join(consumer,'browser-built.mjs'),bundle.outputFiles[0].contents);fs.writeFileSync(path.join(consumer,'browser.test.mjs'),tests.replace("'@hollow-wake/engine/auras/ticking'","'./browser-built.mjs'"));
 fs.writeFileSync(path.join(consumer,'hostile.test.mjs'),"Math.random=()=>{throw Error('ambient RNG')};globalThis.fetch=()=>{throw Error('network')};for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw Error(key)}});await import('./browser.test.mjs');\n");contracts('browser','hostile.test.mjs');
 const typeSource=read('test/aura-ticking-consumer.ts').toString();fs.writeFileSync(path.join(consumer,'types.ts'),typeSource);success('types',[path.join(root,'node_modules/typescript/bin/tsc'),'--strict','--noEmit','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','types.ts']);report.types=true;
 const relative=path.relative(consumer,path.join(root,'src/aura-ticking.js')).split(path.sep).join('/');fs.writeFileSync(path.join(consumer,'source-types.ts'),typeSource.replace("'@hollow-wake/engine/auras/ticking'",JSON.stringify(relative.startsWith('.')?relative:'./'+relative)));success('source-types',[path.join(root,'node_modules/typescript/bin/tsc'),'--strict','--noEmit','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','source-types.ts']);report.sourceTypes=true;
 const module=path.join(consumer,'node_modules/@hollow-wake/engine/dist/aura-ticking.js'),source=fs.readFileSync(module,'utf8');report.moduleBytes=Buffer.byteLength(source);report.moduleSha256=sha256(source);assert(report.moduleBytes<9*1024);
 const faults=[
  [
    "dead-bearer-ticks",
    "if (bearer.dead) continue;",
    "if (false) continue;"
  ],
  [
    "aura-snapshot-lost",
    "of [...bearer.activeAuras]",
    "of bearer.activeAuras"
  ],
  [
    "actor-live-iteration-lost",
    "for (const bearer of this.p.actors())",
    "for (const bearer of [...this.p.actors()])"
  ],
  [
    "duration-expiry-delayed",
    "if (aura.remaining <= 0)",
    "if (aura.remaining < 0)"
  ],
  [
    "duration-clock-lost",
    "aura.remaining -= dt;",
    "aura.remaining -= 0;"
  ],
  [
    "fuse-equality-delayed",
    "held >= delivery.maxDuration",
    "held > delivery.maxDuration"
  ],
  [
    "absent-since-zero",
    "aura.since ?? this.p.time()",
    "aura.since ?? 0"
  ],
  [
    "upkeep-ramp-lost",
    "(delivery.upkeep.rampPerSec ?? 0) * held",
    "(delivery.upkeep.rampPerSec ?? 0) * 0"
  ],
  [
    "mana-max-drain-lost",
    "this.p.maxMana(bearer) * delivery.upkeep.manaPctMaxPerSec",
    "0"
  ],
  [
    "mana-current-drain-lost",
    "bearer.mana * delivery.upkeep.manaPctCurPerSec",
    "0"
  ],
  [
    "mana-not-clamped",
    "bearer.mana = 0; this.p.retire",
    "void bearer.mana; this.p.retire"
  ],
  [
    "life-floor-equality-admitted",
    "bearer.life - drained <= 1",
    "bearer.life - drained < 1"
  ],
  [
    "life-debit-lost",
    "bearer.life -= drained;",
    "void bearer.life;"
  ],
  [
    "charge-fraction-reset",
    "(aura.chargeAcc ?? 0) + upkeep.perSec",
    "0 + upkeep.perSec"
  ],
  [
    "charge-whole-rounded",
    "Math.floor(aura.chargeAcc)",
    "Math.round(aura.chargeAcc)"
  ],
  [
    "charge-fraction-discarded",
    "aura.chargeAcc -= owed;",
    "aura.chargeAcc = 0;"
  ],
  [
    "empty-charge-bank-spent",
    "if (bank > 0) this.p.spendCharge(bearer, upkeep.charge, bank);",
    "this.p.spendCharge(bearer, upkeep.charge, bank);"
  ],
  [
    "seal-publication-state-lost",
    "aura.sealVal = value;",
    "void value;"
  ],
  [
    "seal-noop-source-reset",
    "if (aura.sealVal !== value)",
    "if (true)"
  ],
  [
    "ally-override-lost",
    "aura.allyMods ?? aura.spec.allyMods",
    "aura.spec.allyMods"
  ],
  [
    "ally-members-refreshed",
    "if (!aura.affected.has(actor.id))",
    "if (true)"
  ],
  [
    "affected-publication-too-early",
    "const inside = new Set<number>();",
    "const inside = new Set<number>(); aura.affected = inside;"
  ],
  [
    "damage-dt-lost",
    "(value ?? 0) * dt * this.p.stat(enemy, 'damageTaken')",
    "(value ?? 0) * this.p.stat(enemy, 'damageTaken')"
  ],
  [
    "conversion-lost",
    "this.p.convert(bearer, amounts, definition, context, dps.type);",
    "void amounts;"
  ],
  [
    "resistance-lost",
    "part *= 1 - this.p.resistance(enemy, type);",
    "part *= 1;"
  ],
  [
    "invulnerability-ignored",
    "if (enemy.invulnerable) amount = 0;",
    "void enemy.invulnerable;"
  ],
  [
    "siphon-lost",
    "this.p.heal(bearer, amount * aura.spec.siphonFraction)",
    "this.p.heal(bearer, 0)"
  ],
  [
    "dead-enemy-rechecked",
    "for (const enemy of this.p.enemies(bearer)) {",
    "for (const enemy of this.p.enemies(bearer)) { if(enemy.dead)continue;"
  ],
  [
    "bearer-death-rechecked",
    "for (const [skillId, aura] of [...bearer.activeAuras]) {",
    "for (const [skillId, aura] of [...bearer.activeAuras]) { if(bearer.dead)continue;"
  ],
  [
    "pulse-overshoot-retained",
    "aura.pulseTimer = aura.spec.pulse.interval;",
    "aura.pulseTimer += aura.spec.pulse.interval;"
  ],
  [
    "pulse-first-frame-delayed",
    "if (aura.pulseTimer <= 0)",
    "if (aura.pulseTimer < 0)"
  ],
  [
    "pulse-heal-captured-before-presence",
    "this.p.presence(bearer);\n            const heal = aura.spec.pulse.healAllies;",
    "const heal = aura.spec.pulse.healAllies;\n            this.p.presence(bearer);"
  ],
  [
    "held-span-requeried",
    "(delivery.upkeep.rampPerSec ?? 0) * held",
    "(delivery.upkeep.rampPerSec ?? 0) * (this.p.time()-(aura.since??this.p.time()))"
  ]
];assert.equal(faults.length,33);
 for(const[name,from,to]of faults){assert.equal(runtime.split(from).length,2,name+' selector');const fault=ts.transpileModule(runtime.replace(from,to),{compilerOptions:{...config.options,module:ts.ModuleKind.ESNext},fileName:virtual}).outputText;fs.writeFileSync(module,fault);try{assert.equal(run(name,['--test','contracts.test.mjs']).status,1,name+' escaped');assert.match(logs[name],/ERR_ASSERTION/);report.faults.push({name,detected:true,logSha256:sha256(logs[name])});}finally{fs.writeFileSync(module,source);}}
 contracts('restored');report.restored=true;report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(read(file))===hash);report.passed=report.passed&&report.inputsUnchanged;
 assert.equal(path.dirname(fs.realpathSync(work)),owned);assert(!fs.existsSync(path.join(work,'.git')));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;const data=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(data);fs.writeFileSync(path.join(owned,stem+'.logs.json.gz'),data);fs.writeFileSync(path.join(owned,stem+'.json'),JSON.stringify(report,null,2)+'\n');
}
assert(report.passed,report.failure??'Inputs changed');
console.log({passed:report.passed,contracts:report.contracts,types:report.types,sourceTypes:report.sourceTypes,browserBytes:report.browserBytes,moduleBytes:report.moduleBytes,faults:report.faults.length,restored:report.restored,cleaned:true,failure:report.failure});
