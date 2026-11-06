import assert from 'node:assert/strict';
import {readMutationSource,runMutationFixture} from './mutation-fixture.mjs';

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

const sources=new Map();
for(const [,id] of faults)if(!sources.has(id))sources.set(id,readMutationSource('dist/'+id+'.js'));
runMutationFixture({suite:'attack-sequences',testFile:'test/attack-sequences.test.mjs'},run=>{
  for(const [name,id,before,after,count=1] of faults){
    const source=sources.get(id);
    assert.equal(source.split(before).length-1,count,name);
    run(name,'dist/'+id+'.js',source.replaceAll(before,after));
  }
});
