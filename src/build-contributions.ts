import type {Modifier} from './types.js';
import type {PassiveConduit,ResolvedPassiveGraft} from './passive-grants.js';
import type {ContainerBoard} from './container-layout.js';

/** The existing PassiveGrants accumulator is structurally compatible. A live
 * authoring adapter may refresh its immutable pack before beginning a rebuild. */
export interface BuildPassiveFold<M extends Modifier=Modifier> {
  readonly passiveModifiers:M[];
  readonly conduits:PassiveConduit[];
  readonly grafts:ResolvedPassiveGraft[];
  addItemModifiers(mods:readonly M[]):M[];
  attributes():Record<string,number>;
  attributeModifiers():M[];
}
export interface BuildContributionInput<I,M extends Modifier=Modifier> {
  baseAttrs:Readonly<Record<string,number>>;
  allocated:ReadonlySet<string>;
  choices:Readonly<Record<string,readonly string[]>>;
  classDef:{innate?:M[]};
  equipped:Readonly<Record<string,I|undefined>>;
  containers:Readonly<Record<string,readonly I[]|undefined>>;
  relicEnabled?:boolean;
  relicEmpowerment?:number;
}
export interface BuildContributionPorts<I,M extends Modifier,D extends {id:string;active:boolean}> {
  beginPassives(input:BuildContributionInput<I,M>):BuildPassiveFold<M>;
  equipSlots():Iterable<{id:string}>;
  containers():Iterable<D>;
  compileItem(item:I):M[];
  board(definition:D):ContainerBoard|null;
  misfits(board:ContainerBoard,items:readonly I[]):I[];
  amplification(board:ContainerBoard,items:readonly I[],mods:(item:I)=>readonly M[]):Map<I,number>;
  amplify(mods:M[],factor:number):M[];
  empower(mods:M[],power:number,factor:number):M[];
}
export interface BuildContributionSink<M extends Modifier=Modifier> {
  /** Sampled only for a nonempty active reliquary. The host resolves the hero
   * and account authority before calling rebuild. */
  relicEffectsSuppressed?:boolean;
  conduits(value:PassiveConduit[]|undefined):void;
  attributes(value:Record<string,number>,mods:M[]):void;
  sheet:{setSource(id:string,mods:M[]):void;removeSource(id:string):void};
}
export interface BuildContributionResult<I,M extends Modifier=Modifier> {
  passiveBuild:BuildPassiveFold<M>;
  passiveMods:M[];
  gearSheetMods:Map<string,M[]>;
  containerSheetMods:Map<string,M[]>;
  /** Original item identities, complete scaled lines, in authoritative order.
   * EquipmentSkills uses these keys to locate each grant's investment host. */
  containerPieceMods:Map<I,M[]>;
}

/** Ordered build-change work shared by live adapters and private candidates.
 * Compose with PassiveGrants, ContainerPolicy, SeatGeometry and SeatRules; ports
 * select the host's content and boards, not a second set of gameplay laws.
 * State and callbacks are borrowed/synchronous. Completed publications remain
 * on error, matching World.recalcSeat. For atomic preparation use private sinks
 * and discard a failed candidate. This does not publish skills or combat state. */
export class BuildContributions<I,M extends Modifier=Modifier,D extends {id:string;active:boolean}={id:string;active:boolean}> {
  constructor(readonly ports:BuildContributionPorts<I,M,D>) {}
  rebuild(input:BuildContributionInput<I,M>,sink:BuildContributionSink<M>):BuildContributionResult<I,M> {
    const r=this.ports,passiveBuild=r.beginPassives(input),passiveMods=passiveBuild.passiveModifiers;
    const conduits=passiveBuild.conduits;sink.conduits(conduits.length?conduits:undefined);
    const gearSheetMods=new Map<string,M[]>();
    for(const slot of r.equipSlots()){
      const worn=input.equipped[slot.id];
      if(worn)gearSheetMods.set(slot.id,passiveBuild.addItemModifiers(r.compileItem(worn)));
    }
    const containerSheetMods=new Map<string,M[]>(),containerPieceMods=new Map<I,M[]>();
    for(const def of r.containers()){
      const held=input.containers[def.id];
      if(!def.active||!held?.length)continue;
      if(def.id==='reliquary'&&(!(input.relicEnabled??true)||sink.relicEffectsSuppressed))continue;
      const board=r.board(def);if(!board)continue;
      const misfit=new Set(r.misfits(board,held)),seated=held.filter(item=>!misfit.has(item));
      const compiled=new Map<I,M[]>();
      for(const item of seated)compiled.set(item,r.compileItem(item));
      const amps=r.amplification(board,seated,item=>compiled.get(item)??[]),sheetMods:M[]=[];
      for(const item of seated){
        const raw=compiled.get(item)??[],factor=amps.get(item)??1;
        const mods=def.id==='reliquary'?r.empower(raw,input.relicEmpowerment??0,factor):r.amplify(raw,factor);
        containerPieceMods.set(item,mods);
        sheetMods.push(...passiveBuild.addItemModifiers(mods));
      }
      containerSheetMods.set(def.id,sheetMods);
    }
    sink.attributes(passiveBuild.attributes(),passiveBuild.attributeModifiers());
    sink.sheet.setSource('class',input.classDef.innate??[]);
    sink.sheet.setSource('passives',passiveMods);
    for(const slot of r.equipSlots()){
      const mods=gearSheetMods.get(slot.id);
      if(mods)sink.sheet.setSource('gear:'+slot.id,mods);else sink.sheet.removeSource('gear:'+slot.id);
    }
    for(const def of r.containers()){
      const mods=containerSheetMods.get(def.id);
      if(mods)sink.sheet.setSource('container:'+def.id,mods);else sink.sheet.removeSource('container:'+def.id);
    }
    return {passiveBuild,passiveMods,gearSheetMods,containerSheetMods,containerPieceMods};
  }
}
