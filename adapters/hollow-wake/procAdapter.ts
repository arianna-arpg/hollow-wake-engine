import {BorrowedProcRegistry,ProcRuntime,type ProcConfiguration,type ProcHitEvent,type ProcOwnEvent} from '@hollow-wake/engine/combat/procs';
import {PROC_LIST,PROCS,PROC_RIDER_LIST,type ProcDef,type ProcRiderDef} from '../data/procs';
import {skillContextTags,instanceMods,type SkillInstance} from './skills';
import type {Actor} from './actor';
import type {Modifier,SkillTag} from './stats';
import type {Vec2} from '../core/math';
import type {DamagePacket} from './damage';
import {dominantTypeOf} from './bodyVoices';

/** One observation per dispatch, with shared accessors and live packet reads.
 * A nested hit owns a different observation; no shared scratch state is reused. */
export class WorldProcHitEvent implements ProcHitEvent<Set<SkillTag>,Modifier> {
  constructor(private readonly packet:DamagePacket,readonly dealt:number,readonly depth:number,
    readonly crit:boolean,readonly lethal:boolean,readonly elite:boolean,
    readonly tags:Set<SkillTag>,readonly extra:readonly Modifier[]){}
  get dominantType(){return dominantTypeOf(this.packet.amounts);}
  get rollT(){return this.packet.rollT;}
}

type WorldProcOwnEvent=ProcOwnEvent<Actor,SkillInstance,Set<SkillTag>,Modifier,Vec2>;
export interface WorldProcCallbacks {
  time():number;
  own(owner:Actor,trigger:ProcDef['trigger'],event?:WorldProcOwnEvent):void;
  chance(owner:Actor,proc:ProcDef,depth:number,tags?:Set<SkillTag>,extra?:readonly Modifier[]):number;
  execute(proc:ProcDef,owner:Actor,inst:SkillInstance|null,target:Actor|null,depth:number,aim?:Vec2):void;
  rider(owner:Actor,inst:SkillInstance|null,target:Actor|null,depth:number,cast:ProcRiderDef['cast']):void;
  bankStatus(owner:Actor,inst:SkillInstance,target:Actor,status:string):void;
  lastGasp(owner:Actor):void;
  victim(ids:readonly string[],target:Actor,owner:Actor):boolean;
  carryCourt(owner:Actor,inst:SkillInstance):number;
}

/** Native identities and legacy chance observation remain in the game binding.
 * World.procChance delegates to baseChance; internal SDK selections call chance,
 * which passes through World's current method so existing instrumentation sees
 * the same attempt boundaries. No second probability calculation is performed.
 * Frame-driven own events likewise pass through World's current rollOwnProcs;
 * that method delegates to baseOwn, avoiding recursive adapter dispatch. */
export class WorldProcs extends ProcRuntime<Actor,SkillInstance,ProcDef,ProcRiderDef,Set<SkillTag>,Modifier,Vec2> {
  readonly #nativeChance:WorldProcCallbacks['chance'];
  readonly #nativeOwn:WorldProcCallbacks['own'];
  constructor(host:WorldProcCallbacks,configuration:ProcConfiguration){
    const source=new BorrowedProcRegistry({definitions:()=>PROC_LIST,definition:id=>PROCS[id],riders:()=>PROC_RIDER_LIST},configuration);
    // The SDK view remains immutable. The native stat cache filters an ordinary
    // private array, replaced only when the SDK registry revision changes.
    let nativeView:{source:readonly string[];ids:string[]}|undefined;
    super(source,{
      time:host.time.bind(host),random:()=>Math.random(),stat:(actor,id,tags,extra)=>actor.sheet.get(id,tags,extra),
      condition:(actor,id)=>actor.sheet.hasCondition(id as Parameters<Actor['sheet']['hasCondition']>[0]),
      armed:(actor,ids,extra)=>{
        if(!nativeView||nativeView.source!==ids)nativeView={source:ids,ids:Array.from(ids)};
        return actor.sheet.armedFamily('proc_',nativeView.ids,extra);
      },tags:inst=>skillContextTags(inst),extra:inst=>instanceMods(inst),
      // Carry observes the summoning definition; ordinary gates still observe the instance.
      carryTags:inst=>skillContextTags(inst.def),carryCourt:host.carryCourt.bind(host),victim:host.victim.bind(host),
      execute:host.execute.bind(host),castRider:host.rider.bind(host),bankStatus:host.bankStatus.bind(host),lastGasp:host.lastGasp.bind(host),
    });
    this.#nativeChance=host.chance.bind(host);
    this.#nativeOwn=host.own.bind(host);
  }
  override own(owner:Actor,trigger:ProcDef['trigger'],event?:WorldProcOwnEvent):void {
    return this.#nativeOwn(owner,trigger,event);
  }
  baseOwn(owner:Actor,trigger:ProcDef['trigger'],event?:WorldProcOwnEvent):void {
    return super.own(owner,trigger,event);
  }
  override chance(owner:Actor,proc:ProcDef,depth:number,tags?:Set<SkillTag>,extra?:readonly Modifier[]):number {
    return this.#nativeChance(owner,proc,depth,tags,extra);
  }
  baseChance(owner:Actor,proc:ProcDef,depth:number,tags?:Set<SkillTag>,extra?:readonly Modifier[]):number {
    return super.chance(owner,proc,depth,tags,extra);
  }
}
