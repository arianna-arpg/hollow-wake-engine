import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {root,sha256,writeJSON} from './reference-utils.mjs';
const directory=fs.mkdtempSync(path.join(root,'.artifacts/attack-sequences-mutations-')),files=['attack-sequences','attack-sequence-content'],sources=Object.fromEntries(files.map(name=>[name,fs.readFileSync(path.join(root,'dist',name+'.js'),'utf8')]));
const faults=[
 ['wrong-ramp','attack-sequences','step * s.spec.hitCycle.increasedPerStack','0'],
 ['ignore-positive-hit','attack-sequences','|| dealt <= 0','|| false'],
 ['omit-cycle-reset','attack-sequences','maximum ? 0 : step','step'],
 ['consume-foreign-status','attack-sequences',"if (st.sourceKey !== s.key + ':rhythm')",'if (false)'],
 ['drop-delayed-strikes','attack-sequences','job.due <= this.ports.time()','false'],
 ['ignore-actor-scale','attack-sequences','dt * this.ports.actorScale(owner)','dt * 0'],
 ['ignore-floor','attack-sequences','owner.tier === r.target.tier &&','true &&'],
 ['drop-nova','attack-sequences','this.fire(s, nova, owner.pos, r.projectile.mult * b.nova.power);','void nova;'],
 ['ignore-catch-expiry','attack-sequences','if (r.elapsed < r.duration) {','if (true) {',2],
 ['clear-every-flight','attack-sequences','this.ports.filterFlights(p => p.caster !== owner || !owned(p.inst));','this.ports.filterFlights(() => false);'],
 ['ignore-policy-change','attack-sequences','s.policy !== this.policy(s.host)','false'],
 ['ignore-rain-clock','attack-sequences','this.ports.time() < (this.rainAt.get(p) ?? 0)','false'],
 ['omit-deferred-contact','attack-sequences','this.contact(deferred.projectile, target);','void deferred;'],
 ['ignore-resistance','attack-sequences','resist > 0 && this.ports.random() < resist','false'],
 ['ignore-impact-floor','attack-sequences','victim.tier !== target.tier ||','false ||'],
 ['allocation-order','attack-sequence-content','[...(inst.treeNodes ?? [])].sort()','[...(inst.treeNodes ?? [])]'],
 ['inherit-cycle-on-payload','attack-sequence-content','attackSequence: undefined','attackSequence: definition.attackSequence'],
 ['duplicate-growth','attack-sequence-content','leveling: { perLevel: [] }','leveling: { perLevel: this.ports.innateMods(host) }'],
 ['drop-proc-depth','attack-sequence-content','Math.max(host.procChainDepth ?? 0, host.state?.trigDepth ?? 0)','0'],
 ['alias-sockets','attack-sequence-content','inst.sockets = [...host.sockets]','inst.sockets = host.sockets'],
];
const tests=fs.readFileSync(path.join(root,'test/attack-sequences.test.mjs'),'utf8'),example=fs.readFileSync(path.join(root,'examples/attack-sequences.mjs'),'utf8'),manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'))),results=[];
try{for(const[name,module,before,after,count=1]of faults){
 const source=sources[module];assert.equal(source.split(before).length-1,count,name);const changed=source.replaceAll(before,after),dir=path.join(directory,name);fs.mkdirSync(dir);fs.cpSync(path.join(root,'dist'),path.join(dir,'dist'),{recursive:true});writeJSON(path.join(dir,'package.json'),{name:manifest.name,type:'module',exports:manifest.exports});
 fs.mkdirSync(path.join(dir,'test'));fs.mkdirSync(path.join(dir,'examples'));fs.writeFileSync(path.join(dir,'test/attack-sequences.test.mjs'),tests);fs.writeFileSync(path.join(dir,'examples/attack-sequences.mjs'),example);fs.writeFileSync(path.join(dir,'dist',module+'.js'),changed);
 const result=spawnSync(process.execPath,['--test','test/attack-sequences.test.mjs'],{cwd:dir,encoding:'utf8',windowsHide:true,timeout:30000}),log=(result.stdout??'')+(result.stderr??'');fs.writeFileSync(path.join(dir,'test.txt'),log);assert(!result.error);assert.equal(result.status,1,name);assert(!/SyntaxError|ReferenceError|TypeError|ERR_MODULE_NOT_FOUND/.test(log),name);assert(/(?:ℹ |# )fail [1-9]/.test(log),name);results.push({name,detected:true,logSha256:sha256(log),mutationSha256:sha256(changed)});
}}finally{for(const[name,source]of Object.entries(sources))assert.equal(fs.readFileSync(path.join(root,'dist',name+'.js'),'utf8'),source);writeJSON(path.join(directory,'verification.json'),{passed:results.length===faults.length,results});}
writeJSON(path.join(root,'.artifacts/attack-sequences-mutations.json'),{passed:true,directory,results});console.log({passed:true,faults:results.length,directory});
