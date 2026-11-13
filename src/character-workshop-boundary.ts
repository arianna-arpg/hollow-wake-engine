import {requireSession as need,sessionFields as fields,sessionArray as array,sessionRecord as record,copySessionJSON,retainSessionPart} from './session-json.js';
import type {WorkshopBuildInput,WorkshopRelicGrantWrite} from './workshop-build-preparation.js';
import type {CompleteWorkshopBoundary,CompleteBuildTransition,CharacterObjectJSON,PreparedCharacterCommand,PreparedAccountView,PreparedAccountTransition,AccountJournalReference} from './complete-character-contracts.js';

/** Private complete-character policy. Legacy consumers do not load this module. */
function admitPath(raw:unknown,previous:object|undefined,after:object,command:boolean):readonly CompleteBuildTransition[]{
  need(command&&previous,'unexpected-character-rebuilds');array(raw,256);need(raw.length>0,'empty-character-rebuilds');
  const rows:CompleteBuildTransition[]=[],seen=new Set<object>([previous]);let cursor=previous;
  for(const row of raw){
   fields(row,['before','after']);need(row.before===cursor,'disconnected-character-rebuilds');
   need(row.after!==null&&typeof row.after==='object'&&!seen.has(row.after),'invalid-character-rebuild');
   cursor=row.after;seen.add(cursor);rows.push(Object.freeze({before:row.before as object,after:cursor}));
  }
  need(cursor===after,'unfinished-character-rebuilds');return Object.freeze(rows);
}
export const completeWorkshopBoundary=Object.freeze<CompleteWorkshopBoundary>({
 journal(){
  const entries:PreparedCharacterCommand[]=[],views=new Map<AccountJournalReference,PreparedAccountView>();
  let finished=false;
  return {
   push(command,reply,transitions,before,after,save){
    need(!finished,'completed-character-journal');need(entries.length<16,'character-journal-limit');
    const view=(account:AccountJournalReference):PreparedAccountView=>{
     let value=views.get(account);
     if(!value){value=Object.freeze({version:account.version,activeProfile:account.active??null,save:retainSessionPart(save(account)).value as CharacterObjectJSON});views.set(account,value);}
     return value;
    };
    const accounts:PreparedAccountTransition[]=[];
    for(const[handle,next]of after){
     const previous=before.get(handle);need(previous&&previous.key===next.key,'character-journal-account-mismatch');
     if(previous!==next)accounts.push(Object.freeze({account:handle,accountKey:next.key,before:view(previous),after:view(next)}));
    }
    need(before.size===after.size,'character-journal-account-mismatch');
    entries.push(Object.freeze({index:entries.length,command:retainSessionPart(command).value,reply:retainSessionPart(reply).value,
     transitions:Object.freeze(transitions.map(row=>Object.freeze(row))),accounts:Object.freeze(accounts)}));
   },
   finish(){finished=true;views.clear();return Object.freeze(entries);}
  };
 },
 admit(result,codec,previous,command,scope){
  fields(result,['reply','save','continuation','character','relicWrites','rebuilds']);record(result.save);
  need(result.continuation!==null&&typeof result.continuation==='object','invalid-build-continuation');
  const rebuilds=result.rebuilds===undefined?undefined:admitPath(result.rebuilds,previous,result.continuation,command);
  const save=copySessionJSON(result.save) as CharacterObjectJSON;
  const character=codec.admit(result.character,save.state as unknown as WorkshopBuildInput['state']);
  const writes=result.relicWrites===undefined?undefined:copySessionJSON(result.relicWrites);
  if(writes!==undefined){array(writes,512);need(writes.length===0||scope.relics.role==='active','inactive-relic-write');}
  return{reply:copySessionJSON(result.reply),save,character,continuation:result.continuation,
   relicWrites:writes as unknown as WorkshopRelicGrantWrite[]|undefined,rebuilds};
 },
 extend(path:readonly CompleteBuildTransition[]|undefined,before:object,after:object){
  return path?[...path,{before,after}]:undefined;
 },
 append(transitions,profile,accountKey,before,after,path){
  const rows=path??[{before,after}];need(transitions.length+rows.length<=256,'character-transition-limit');
  if(path)need(path[0].before===before&&path.at(-1)!.after===after,'stale-character-rebuilds');
  for(const row of rows)transitions.push({profile,accountKey,before:row.before,after:row.after});
 }
});
