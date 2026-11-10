import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';import {build} from 'esbuild';
import {root,sha256} from './reference-utils.mjs';import {npmCli} from './npm-cli.mjs';
assert.equal(process.argv.length,2);
const owned=path.join(root,'.artifacts');fs.mkdirSync(owned,{recursive:true});
const work=fs.mkdtempSync(path.join(owned,'guard-arts-package-owned-')),consumer=path.join(work,'consumer');fs.mkdirSync(consumer);
const report={passed:false,contracts:42,faults:[],sources:{}},logs={};
for(const file of ['src/guard-arts.ts','test/guard-arts.test.mjs','test/guard-arts-consumer.ts','scripts/test-guard-arts-package.mjs','package.json','package-lock.json'])report.sources[file]=sha256(fs.readFileSync(path.join(root,file)));
const run=(label,args,cwd=consumer)=>{const c=spawnSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:4*1024*1024,
 env:{...process.env,TEMP:work,TMP:work,TMPDIR:work,NODE_PATH:'',NODE_COMPILE_CACHE:path.join(work,'compile-cache')}});
 logs[label]=(c.stdout??'')+'\n'+(c.stderr??'');assert(!c.error&&!c.signal,label+': '+c.error);return c;};
const success=(label,args,cwd)=>assert.equal(run(label,args,cwd).status,0,logs[label]);
const contracts=(label,file='test/guard-arts.test.mjs')=>{success(label,['--test',file]);assert(new RegExp('(?:#|ℹ) pass '+report.contracts+'\\b').test(logs[label]));};
try{
 success('pack',[npmCli(),'pack','--json','--ignore-scripts','--pack-destination',work,'--cache',path.join(work,'npm-cache')],root);
 const archive=path.join(work,JSON.parse(logs.pack)[0].filename);report.archiveSha256=sha256(fs.readFileSync(archive));
 fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
 success('install',[npmCli(),'install',archive,'--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(work,'npm-cache')]);
 fs.mkdirSync(path.join(consumer,'test'));const test=fs.readFileSync(path.join(root,'test/guard-arts.test.mjs'),'utf8').replace("'../dist/guard-arts.js'","'@hollow-wake/engine/guard/arts'");
 fs.writeFileSync(path.join(consumer,'test/guard-arts.test.mjs'),test);contracts('installed');
 fs.writeFileSync(path.join(consumer,'entry.mjs'),"export * from '@hollow-wake/engine/guard/arts';\n");
 const bundle=await build({entryPoints:[path.join(consumer,'entry.mjs')],bundle:true,platform:'browser',format:'esm',target:'es2022',minify:true,metafile:true,write:false});
 assert(Object.values(bundle.metafile.outputs).every(output=>!output.imports.length));report.browserBytes=bundle.outputFiles[0].contents.length;assert(report.browserBytes<16*1024);
 fs.writeFileSync(path.join(consumer,'browser-built.mjs'),bundle.outputFiles[0].contents);
 fs.writeFileSync(path.join(consumer,'test/browser-contracts.mjs'),test.replace("'@hollow-wake/engine/guard/arts'","'../browser-built.mjs'"));
 fs.writeFileSync(path.join(consumer,'hostile.test.mjs'),"Math.random=()=>{throw Error('ambient RNG')};globalThis.fetch=()=>{throw Error('network')};for(const key of ['window','document','localStorage'])Object.defineProperty(globalThis,key,{get(){throw Error(key)}});await import('./test/browser-contracts.mjs');");contracts('browser','hostile.test.mjs');
 fs.copyFileSync(path.join(root,'test/guard-arts-consumer.ts'),path.join(consumer,'types.ts'));
 success('types',[path.join(root,'node_modules/typescript/bin/tsc'),'--strict','--noEmit','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','types.ts']);report.types=true;
 const module=path.join(consumer,'node_modules/@hollow-wake/engine/dist/guard-arts.js'),source=fs.readFileSync(module,'utf8');report.moduleBytes=Buffer.byteLength(source);assert(report.moduleBytes<32*1024);
 const faults=[
  ['reset-every-sync','state.policy !== policy','true'],
  ['leak-absorb','a.absorbLayers.delete(s.key);',''],
  ['skip-projectile-retirement','this.p.retireProjectiles(a, host);',''],
  ['unscaled-time','dt * this.p.scale(a)','dt'],
  ['negative-time','Math.max(0, dt * this.p.scale(a))','dt * this.p.scale(a)'],
  ['discard-remainder','Math.max(0, s.plateClock - p.interval) % p.interval','0'],
  ['no-block','amount *= 1 - spec.passiveBlockReduction;',''],
  ['no-plate-spend','s.plates--;',''],
  ['no-patience','patience.multiplier : 1','1 : 1'],
  ['unbounded-blasts','s.blasts.length < this.limits.pendingBlasts','true'],
  ['reversed-outcome-expiry','o.expires > this.p.time()','o.expires >= this.p.time()'],
  ['no-intervention-stamp','a.guardIntervention[inst.def.id] = s.spec.intervention.cooldown;',''],
  ['reset-contact-on-lower','// Contact cooldowns intentionally survive quick re-raises.','s.contacts.clear();'],
  ['no-repeat-reduction','opening ? 1 : r.repeat','1'],
  ['ignore-cast-replacement','a.dead || a.casting !== cs','a.dead'],
  ['wrong-satellite-slot','sources[slot % sources.length]','sources[0]'],
  ['unsorted-patches','[...new Set(inst.treeNodes ?? [])].sort()','[...new Set(inst.treeNodes ?? [])]'],
  ['recursive-payload','if (inst.guardArtsPayload)','if (false)'],
  ['lost-armor','p.stat(actor, \'armor\', tags, mods) * (p.spec(inst)?.armorRatio ?? 0)','0'],
  ['fork-lost-cast-time-power','runtime.bindLayer(next, plan.layer, plan.power);','runtime.bindLayer(next, plan.layer, 1);'],
  ['fork-layer-bound-to-live','runtime.bindLayer(next, plan.layer, plan.power);','this.bindLayer(next, plan.layer, plan.power);'],
  ['fork-interception-bound-to-live','runtime.bindInterception(next);','this.bindInterception(next);'],
  ['fork-restarted-source-counter','state.nextSource = this.state.nextSource;','state.nextSource = 1;'],
  ['fork-shared-contact-rows','[id, { ...row }]','[id, row]'],
  ['fork-shared-policy','spec: mapping.spec(s.spec)','spec: s.spec'],
  ['fork-lost-empty-family','state.owners.set(target, new Map());','void target;'],
  ['fork-unknown-layer-admitted','if (layer && (!binding || binding.state !== s || binding.ended !== layer.ended))','if (false)'],
  ['fork-replaced-callback-admitted',' || binding.ended !== layer.ended',''],
  ['fork-moved-layer-admitted','binding.state !== s || ',''],
  ['fork-live-peer-skill-admitted','sourceSkills.has(mapped)','mapped === i'],
  ['fork-shared-intervention','mapped.guardIntervention === a.guardIntervention || ',''],
  ['fork-replayed-cast','runtime.bindInterception(next);','runtime.bindInterception(next); runtime.cast(plan.actor, plan.host);'],
  ['fork-nonempty-destination','runtime.state.owners.size','false'],
  ['fork-visual-destination','runtime.visuals.length','false'],
  ['fork-different-limits','runtime.limits.pendingBlasts !== this.limits.pendingBlasts || runtime.limits.promotePerFrame !== this.limits.promotePerFrame || runtime.limits.maximumReduction !== this.limits.maximumReduction','false'],
  ['recreated-owned-interceptor','if (existing && this.interceptorStates.get(existing) === s)','if (false)'],
  ['fork-shared-empty-owner-map','runtime.state.owners === this.state.owners || ',''],
 ];
 for(const[name,from,to]of faults){const occurrences=source.split(from).length-1;assert.equal(occurrences,name==='reversed-outcome-expiry'?2:1,name+' selector');fs.writeFileSync(module,source.replaceAll(from,to));
  try{assert.equal(run('fault-'+name,['--test','test/guard-arts.test.mjs']).status,1,name+' escaped');assert.match(logs['fault-'+name],/ERR_ASSERTION/);report.faults.push({name,detected:true,logSha256:sha256(logs['fault-'+name])});}
  finally{fs.writeFileSync(module,source);}
 }
 contracts('restored');report.restored=true;report.passed=true;
}catch(error){report.failure=String(error);process.exitCode=1;}
finally{
 try{report.inputsUnchanged=Object.entries(report.sources).every(([file,hash])=>sha256(fs.readFileSync(path.join(root,file)))===hash);report.passed=report.passed&&report.inputsUnchanged;
  const bytes=gzipSync(JSON.stringify(logs),{level:9});report.logsSha256=sha256(bytes);fs.writeFileSync(path.join(owned,'guard-arts-package.logs.json.gz'),bytes);
 }finally{assert.equal(path.dirname(fs.realpathSync(work)),fs.realpathSync(owned));fs.rmSync(work,{recursive:true,maxRetries:3});report.cleaned=true;fs.writeFileSync(path.join(owned,'guard-arts-package.json'),JSON.stringify(report,null,2)+'\n');}
}
assert(report.passed,report.failure);console.log({passed:true,contracts:report.contracts,faults:report.faults.length,browserBytes:report.browserBytes,moduleBytes:report.moduleBytes,cleaned:true});
