import {liveRunWorld} from 'candidate/live-run-world';
import {VOCATIONS,VOCATION_CFG} from '../src/data/vocations';
import type {RunPreparedCommand} from 'candidate/run-character-session';
import type {OwnedVocationEvent} from 'candidate/owned-vocation';
import type {RunBuildView} from 'candidate/durable-run-owner';
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const need=(value:unknown,message:string)=>{if(!value)throw Error(message);};

/** Original-World comparison fixture, not a durable or public game adapter. */
export function ownedVocationWorld(options:{enabled?:boolean;prior?:string;counter?:number;id:string}){
 const f=liveRunWorld(),{w,s,m,p}=f,key='vocation_unlocked_'+options.id;
 if(options.prior)w.grantVocation(options.prior);
 if(options.counter!==undefined){w.account.ledger[key]=options.counter;w.ledger[key]=options.counter;}
 if(options.enabled===false)(w as any).metaProgressionActive=()=>false;
 w.accountDirty=false;w.metaDirty.clear();f.events.length=0;
 const trace:unknown[]=[],snapshot=()=>copy({...f.snapshot(),accountDirty:w.accountDirty});
 for(const name of ['recalcSeat','markMetaDirty','text'] as const){const world=w as any,original=world[name];world[name]=function(...args:unknown[]){trace.push({name,phase:'before',state:snapshot()});const value=original.apply(this,args);trace.push({name,phase:'after',state:snapshot()});return value;};}
 let rebuilds=0;
 const publish=(id:string,row:RunPreparedCommand,read:(handle:object)=>RunBuildView)=>{
  const reply=row.character.reply as unknown as {reply:{accepted:boolean;events:OwnedVocationEvent[];runCounter:{key:string;before:number;after:number}|null}};
  const result=reply.reply;if(!result.accepted)return false;need(row.character.transitions.length===1,'Unexpected vocation normalization path');
  const step=row.character.transitions[0];need(step.after,'Missing vocation build');const held=read(step.after!),counter=result.runCounter;need(counter,'Missing vocation counter');
  m.vocations=copy(held.character.passives.vocations);m.allocated.clear();for(const node of held.character.passives.allocated)m.allocated.add(node);
  need((w.ledger[counter!.key]??0)===counter!.before,'Stale vocation run counter');w.ledger[counter!.key]=counter!.after;
  for(const event of result.events){
   if(event.kind==='account-dirty'){w.account.ledger[counter!.key]=1;w.accountDirty=true;}
   else if(event.kind==='recalculate'){w.recalcSeat(s);need(JSON.stringify(held.projection.attrs)===JSON.stringify(m.attrs),'Vocation attributes differ');need(JSON.stringify(held.projection.sources.find(([name])=>name==='passives')?.[1]??[])===JSON.stringify(p.sheet.getSourceMods('passives')??[]),'Vocation modifiers differ');rebuilds++;}
   else if(event.kind==='character-dirty')(w as any).markMetaDirty(s);
   else if(event.kind==='announce-vocation'){const v=VOCATIONS[id];w.text({x:s.actor.pos.x,y:s.actor.pos.y-40},`VOCATION: ${v.name}!`,v.color,24);}
   else w.text({x:s.actor.pos.x,y:s.actor.pos.y-12},'Its tree awakens at the heart of the star (P).','#d8d4c8',13);
  }
  return true;
 };
 return{...f,snapshot,publish,rebuilds:()=>rebuilds,cap:()=>VOCATION_CFG.maxPerCharacter,observed:()=>copy({events:f.events,trace,final:snapshot()}),original:(id:string)=>w.grantVocation(id)};
}
