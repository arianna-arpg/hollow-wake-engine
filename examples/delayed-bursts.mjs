import {DelayedBursts,compileDelayedBurstEffect} from '@hollow-wake/engine/combat/delayed';

// One immutable port table can serve independent worlds. Engine adapters supply
// their real healing, mitigation, presentation, defense and death operations.
const ports=Object.freeze({
  queue:w=>w.pending,time:w=>w.time,actors:w=>w.actors,
  clearQueue(w){w.pending=[];w.events.push('reset');},
  warning(w,b){w.events.push('warning:'+b.when);},
  flash(w,b){w.events.push('flash:'+b.when);},
  heal(w,a,n){const before=a.life;a.life=Math.min(100,a.life+n);w.events.push('heal:'+a.id);return a.life-before;},
  mitigate(w,a,_type,n){w.events.push('damage:'+a.id);return n;},
  text(w,_at,text){w.events.push('text:'+text);},
  shieldBreak(w,a){w.events.push('shield:'+a.id);},
  sweepDefenses(w,a){w.events.push('sweep:'+a.id);},
  kill(w,a){a.dead=true;w.events.push('kill:'+a.id);if(w.resetOnDeath)w.runtime.reset(w);},
});
const effect=compileDelayedBurstEffect({type:'delayedBurst',at:'self',delay:.5,radius:20,healAllies:{base:10,perLevel:1},damage:{type:'fire',base:10,perLevel:5}},['fire']);
const body=(id,team,life)=>({id,team,life,pos:{x:0,y:0},tier:0,radius:1,level:3,dead:false,untargetable:false,invulnerable:false,esBroke:false,hitFlash:0});

export function delayedEncounter(resetOnDeath=false){
  const owner=body('owner','blue',100),ally=body('ally','blue',50),enemy=body('enemy','red',20),survivor=body('survivor','red',40);
  const w={time:10,pending:[],actors:[ally,enemy,survivor],events:[],resetOnDeath,runtime:new DelayedBursts(ports)};
  w.runtime.schedule(w,owner,{...effect,delay:2},'#aabbcc');
  w.runtime.schedule(w,owner,effect,'#aabbcc');
  w.runtime.advance(w); // The warning is immediate; neither impact is due yet.
  w.time=10.5;
  w.runtime.advance(w);
  return {ally:ally.life,enemy:enemy.life,survivor:survivor.life,pending:w.pending.length,events:w.events};
}
