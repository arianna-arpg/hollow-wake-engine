import {BorrowedProcRegistry,ProcRuntime,type ProcConfiguration} from '@hollow-wake/engine/combat/procs';
import {PROC_LIST,PROCS,PROC_RIDER_LIST,type ProcDef,type ProcRiderDef} from '../data/procs';
import {skillContextTags,instanceMods,type SkillInstance} from './skills';
import type {Actor} from './actor';
import type {Modifier,SkillTag} from './stats';
import type {Vec2} from '../core/math';

export interface WorldProcCallbacks {
  time():number;
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
 * the same attempt boundaries. No second probability calculation is performed. */
export class WorldProcs extends ProcRuntime<Actor,SkillInstance,ProcDef,ProcRiderDef,Set<SkillTag>,Modifier,Vec2> {
  readonly #nativeChance:WorldProcCallbacks['chance'];
  constructor(host:WorldProcCallbacks,configuration:ProcConfiguration){
    const source=new BorrowedProcRegistry({definitions:()=>PROC_LIST,definition:id=>PROCS[id],riders:()=>PROC_RIDER_LIST},configuration);
    super(source,{
      time:host.time.bind(host),random:()=>Math.random(),stat:(actor,id,tags,extra)=>actor.sheet.get(id,tags,extra),
      condition:(actor,id)=>actor.sheet.hasCondition(id as Parameters<Actor['sheet']['hasCondition']>[0]),
      armed:(actor,ids,extra)=>actor.sheet.armedFamily('proc_',ids,extra),tags:inst=>skillContextTags(inst),extra:inst=>instanceMods(inst),
      // Carry observes the summoning definition; ordinary gates still observe the instance.
      carryTags:inst=>skillContextTags(inst.def),carryCourt:host.carryCourt.bind(host),victim:host.victim.bind(host),
      execute:host.execute.bind(host),castRider:host.rider.bind(host),bankStatus:host.bankStatus.bind(host),lastGasp:host.lastGasp.bind(host),
    });
    this.#nativeChance=host.chance.bind(host);
  }
  override chance(owner:Actor,proc:ProcDef,depth:number,tags?:Set<SkillTag>,extra?:readonly Modifier[]):number {
    return this.#nativeChance(owner,proc,depth,tags,extra);
  }
  baseChance(owner:Actor,proc:ProcDef,depth:number,tags?:Set<SkillTag>,extra?:readonly Modifier[]):number {
    return super.chance(owner,proc,depth,tags,extra);
  }
}
