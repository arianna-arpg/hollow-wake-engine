import type {Modifier} from './types.js';
import type {BuildContributionInput,BuildContributionResult,BuildContributionSink} from './build-contributions.js';
import type {EquipmentSkillFrame} from './equipment-skills.js';
import type {PassiveConduit} from './passive-grants.js';

export interface CharacterRebuildPorts<D,U,S,I,M extends Modifier=Modifier> {
  contributions: {
    rebuild(input:BuildContributionInput<I,M>,sink:BuildContributionSink<M>):BuildContributionResult<I,M>;
  };
  equipment: {derive(frame:EquipmentSkillFrame<D,U,S,I>):void};
  levelModifiers(level:number):M[];
}

/** Already admitted current state, borrowed only for this call. The host selects
 * the character's own body and supplies its authorized relic projection. */
export interface CharacterRebuildFrame<D,U,S,I,M extends Modifier=Modifier> {
  seat:EquipmentSkillFrame<D,U,S,I>['seat'];
  meta:EquipmentSkillFrame<D,U,S,I>['meta']&BuildContributionInput<I,M>;
  actor:EquipmentSkillFrame<D,U,S,I>['actor']&{
    sheet:BuildContributionSink<M>['sheet'];
    level:number;life:number;mana:number;
    maxLife():number;
    maxMana():number;
  };
  readonly relicEffectsSuppressed?:boolean;
  conduits(value:PassiveConduit[]|undefined):void;
  attributes(value:Record<string,number>,mods:M[]):void;
  deriveCompanions:EquipmentSkillFrame<D,U,S,I>['deriveCompanions'];
  deactivateAura:EquipmentSkillFrame<D,U,S,I>['deactivateAura'];
  dismissSummon:EquipmentSkillFrame<D,U,S,I>['dismissSummon'];
  syncGuard():void;
  refreshBonds():void;
}

/** Ordered live build application. This composes the existing contribution and
 * equipment rules; it neither installs a private preview nor restores combat.
 * Current skill identities, casts, cooldowns and unrelated stat sources remain
 * in place. Lost grants retire through the explicit equipment effect ports.
 *
 * Call only after admission, on the host's single writer. Callbacks are trusted,
 * synchronous completion effects. Exceptions retain preceding live writes, as
 * in the original game; this is not a rollback or persistence coordinator.
 * No frame, actor, item or skill is retained after the call. */
export class CharacterRebuild<D,U,S,I,M extends Modifier=Modifier> {
  constructor(readonly ports:CharacterRebuildPorts<D,U,S,I,M>) {}

  rebuild(frame:CharacterRebuildFrame<D,U,S,I,M>):void {
    const {ports}=this,{actor,meta,seat}=frame;
    const fold=ports.contributions.rebuild(meta,{
      get relicEffectsSuppressed(){return frame.relicEffectsSuppressed;},
      conduits:value=>frame.conduits(value),
      attributes:(value,mods)=>frame.attributes(value,mods),
      sheet:actor.sheet,
    });
    ports.equipment.derive({
      seat,actor,meta,...fold,
      passiveGrafts:()=>fold.passiveBuild.grafts,
      deriveCompanions:(definitions,sourceName,relicKey)=>frame.deriveCompanions(definitions,sourceName,relicKey),
      deactivateAura:id=>frame.deactivateAura(id),
      dismissSummon:id=>frame.dismissSummon(id),
    });
    actor.sheet.setSource('level',ports.levelModifiers(actor.level));
    actor.life=Math.min(actor.life,actor.maxLife());
    actor.mana=Math.min(actor.mana,actor.maxMana());
    frame.syncGuard();
    frame.refreshBonds();
  }
}
