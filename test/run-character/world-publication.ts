import {liveRunWorld} from 'candidate/live-run-world';
import {ExperiencePlanEffects} from 'candidate/experience-plan';
import type {DurableRunOptions,RunPublication,RunBuildView} from 'candidate/durable-run-owner';
import {CharacterPassiveEffects} from '../../src/character-passive-effects.js';
import type {CharacterPassiveEvent} from '../../src/character-passive-commands.js';
import type {CharacterWorkshopSnapshot} from '../../src/character-workshop-commands.js';
const wire=(value:unknown)=>JSON.stringify(value);
const need=(test:unknown,message:string):void=>{if(!test)throw Error(message);};
type Fixture=ReturnType<typeof liveRunWorld>;
type Lease={investment:string;run:RunPublication};

/** Original-game qualification binding for one bare-equipment hero. The
 * readBuild capability comes from the pending lease; no second owner is kept.
 * This fixture deliberately rejects extra normalization/relic transitions.
 * It is not a complete inventory/account/quest or recovery adapter. */
export function liveRunPublication(f:Fixture,options:{isCurrent():boolean;handle:number;accountKey:string;contentId:string;afterRebuild?():void}){
 const {w,s,m,p}=f,log:string[]=[];let builds=0;
 const current=()=>{need(options.isCurrent()&&w.localSeat===s&&w.seatHero(s)===p,'run-world-expired');};
 // Investment only: HP, mana, downed status, timers, summons and time are live.
 const investment=()=>wire({input:f.input(options.contentId),xp:m.xp,xpNeeded:m.xpNeeded,ledger:w.ledger,account:f.account()});
 const checkBuild=(build:RunBuildView)=>{
  need(build.character.level===p.level&&build.character.passives.passivePoints===m.passivePoints,'run-private-investment-mismatch');
  need(wire(build.projection.attrs)===wire(m.attrs),'run-private-attributes-mismatch');
  for(const name of ['level','passives'])need(wire(build.projection.sources.find(([id])=>id===name)?.[1]??[])===wire(p.sheet.getSourceMods(name)??[]),'run-private-modifiers-mismatch');
  builds++;options.afterRebuild?.();
 };
 const live:DurableRunOptions<Lease>['live']={
  prepare(packet){
   current();const saved=packet.current.body.characters[0].save as unknown as {character:CharacterWorkshopSnapshot['character']};
   need(packet.current.body.characters.length===1&&saved.character.level===p.level&&wire(saved.character.passives)===wire(f.passives()),'run-world-investment-not-bound');
   const run=packet.run.current;need(run.characters.length===1&&run.characters[0].xp===m.xp&&run.characters[0].xpNeeded===m.xpNeeded&&wire(run.ledger)===wire(w.ledger),'run-world-progress-not-bound');
   for(const row of packet.run.journal){
    need(row.character.transitions.every(step=>step.profile===options.handle&&step.accountKey===options.accountKey),'foreign-run-world-transition');
    if(row.experience)need(row.character.transitions.length===row.experience.events.filter(e=>e.kind==='recalculate').length,'run-normalization-path-not-qualified');
    else{
     const command=row.character.command as {op?:string;command?:{op?:string}};
     need(command.op==='workshop'&&command.command?.op==='character-passive','run-world-command-not-qualified');
    }
   }
   log.push('prepare');return{investment:investment(),run:packet.run};
  },
  publish(lease,packet){
   current();need(investment()===lease.investment,'run-world-stale-investment');need(packet.run===lease.run,'foreign-run-world-lease');
   for(const row of packet.run.journal){
    const read=(index:number)=>{const step=row.character.transitions[index];need(step?.after,'missing-run-build');return packet.run.readBuild(step.after!);};
    if(row.experience){let index=0;new ExperiencePlanEffects(f.experiencePorts(()=>checkBuild(read(index++)))).play(row.experience);need(index===row.character.transitions.length,'unconsumed-run-build');}
    else{
     const ports=f.effectPorts(index=>read(index).character.passives),rebuild=ports.rebuild;
     ports.rebuild=index=>{rebuild(index);checkBuild(read(index));};
     const reply=row.character.reply as unknown as {reply:{events:readonly CharacterPassiveEvent[]}};
     new CharacterPassiveEffects(ports).play(reply.reply.events);
    }
   }
   log.push('publish');
  },
  discard(){log.push('discard');},recoverRequired(){log.push('recovery');}
 };
 return{live,log,investment,builds:()=>builds};
}
