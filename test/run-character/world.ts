import {livePassiveWorld} from 'candidate/live-passive-world';
import type {ExperienceEffectPorts} from 'candidate/experience-plan';
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
export function liveRunWorld(){
 const f=livePassiveWorld(),{w,s,m,p}=f,events:unknown[]=[];
 w.metaDirty.clear();
 const snapshot=()=>copy({...f.snapshot(),level:p.level,xp:m.xp,xpNeeded:m.xpNeeded,ledger:w.ledger,accountLedger:w.account.ledger,
  downed:!!p.downed,dirty:[...w.metaDirty],levelMods:p.sheet.getSourceMods('level')});
 for(const name of ['markMetaDirty','recalcSeat','text','resyncMercenary'] as const){
  const target=w as any,original=target[name];target[name]=function(...args:any[]){
   events.push({name,phase:'before',state:snapshot(),...(name==='text'?{text:args[1],color:args[2],size:args[3]}:{})});
   const value=original.apply(this,args);events.push({name,phase:'after',state:snapshot()});return value;
  };
 }
 const fill=p.fillResources;p.fillResources=function(){events.push({name:'fillResources',phase:'before',state:snapshot()});fill.call(this);events.push({name:'fillResources',phase:'after',state:snapshot()});};
 const experiencePorts=(rebuild:()=>void):ExperienceEffectPorts=>({
  read:()=>({level:p.level,xp:m.xp,xpNeeded:m.xpNeeded,passivePoints:m.passivePoints}),ledger:()=>w.ledger,
  write:value=>{p.level=value.level;m.xp=value.xp;m.xpNeeded=value.xpNeeded;m.passivePoints=value.passivePoints;},
  writeLedger:ledger=>{w.ledger={...ledger};},markDirty:()=>{(w as any).markMetaDirty(s);},
  recalculate:()=>{w.recalcSeat(s);rebuild();},downed:()=>!!p.downed,fillResources:()=>{p.fillResources();},
  announce:()=>{w.text(s.actor.pos,'LEVEL UP!','#ffd700',24);},resyncMercenary:()=>{w.resyncMercenary();}
 });
 return{...f,snapshot,events,experiencePorts};
}
