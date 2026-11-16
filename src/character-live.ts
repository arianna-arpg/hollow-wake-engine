import {CharacterRebuild,type CharacterRebuildFrame} from './character-rebuild.js';
import {BuildContributions} from './build-contributions.js';
import {EquipmentSkills,type EquipmentSkillDefinition,type EquipmentSkill} from './equipment-skills.js';
import type {CharacterBuildPorts} from './character-builds.js';
import type {CharacterPublication,CharacterPublisher} from './character-session.js';
import type {GemDefinition,GemSkill} from './gem-residence.js';
import type {ItemInstance,GrantedSkillState} from './item-types.js';
import type {Modifier} from './types.js';
import type {CharacterSkill,CharacterSkillDefinition} from './skill-queries.js';

type Skill<D extends EquipmentSkillDefinition,U extends GemDefinition>=Omit<EquipmentSkill<D,U>,'sockets'>&GemSkill<D,U>&{companionGrant?:boolean};
const beforeInvestment = new Set(['capture-summons', 'dismiss', 'clear-summons', 'clear-fields']);
export type CharacterLiveRules=CharacterBuildPorts<CharacterSkillDefinition,GemDefinition,CharacterSkill,ItemInstance,{id:string;innate?:Modifier[]},{id:string;active:boolean}>;
export interface CharacterLiveEffects<S> {
  /** Retire a removed/replaced learned instance, including its invalid casts
   * and owned toggles. Retained instances are never passed here. */
  retire(skill:S):void;
  /** Ordered skill/passive/progression signals. Level-up fills living actors;
   * support and awakening changes resynchronize the host's surviving effects. */
  event(event:CharacterPublication['events'][number]):void;
}

/** Applies admitted investment to current actor identities. The caller owns
 * spatial services, effects and combat clocks. Private preview skills never
 * enter the actor. Use once for initial creation, then as the session publisher. */
export class CharacterLive<D extends EquipmentSkillDefinition,U extends GemDefinition,S extends Skill<D,U>,I extends ItemInstance,C extends {id:string;innate?:Modifier[]},T extends {id:string;active:boolean}> implements CharacterPublisher {
  readonly #equipment:EquipmentSkills<D,U,S,I,GrantedSkillState,C>;
  #busy=false;
  constructor(readonly rules:CharacterBuildPorts<D,U,S,I,C,T>,readonly frame:CharacterRebuildFrame<D,U,S,I>,readonly effects:CharacterLiveEffects<S>){
    this.#equipment=new EquipmentSkills(rules.equipment);
  }
  initialize(change:CharacterPublication):void {
    for(const id of change.data.sourceOrder)this.frame.actor.sheet.setSource(id,[]);
    this.publish({...change,events:[{kind:'recalculate'}]});
  }
  publish(change:CharacterPublication):void {
    if(this.#busy)throw Error('Reentrant live character publication');this.#busy=true;
    try{
      const {rules:p,frame:f}=this,input=change.input,known=f.meta.knownSkills;
      // Retirement and refund capture read the old live investment. In
      // particular, a removed summon branch must still describe its released
      // descendants while those descendants are being retired.
      for(const event of change.events)if(beforeInvestment.has(event.kind))this.effects.event(event);
      const wanted=new Set(input.learned.map(row=>row.gem.skillId)),replace=new Set(change.edits.replaceLearned??[]);
      for(const[id,inst]of known)if(!wanted.has(id)||replace.has(id)){this.effects.retire(inst);known.delete(id);}
      for(const row of input.learned){let inst=known.get(row.gem.skillId);if(inst)p.updateLearned(inst,row.gem);else{inst=p.restoreLearned(row.gem);known.set(row.gem.skillId,inst);}
        if(row.locked)inst.locked=true;else delete inst.locked;
      }
      // Only explicit investment edits may replace an existing grant's payload.
      // Ordinary rebuilds keep its current runtime state and identity.
      for(const edit of change.edits.grants??[]){const inst=f.seat.grantedInsts?.get(edit.skillId);
        if(!inst||inst.grantedHostUid!==edit.hostUid)throw Error('Stale live grant investment');p.updateGrant(inst,edit.state);
      }
      const classDef=p.class(input.classId);if(!classDef)throw Error('Unknown live character class');
      Object.assign(f.meta,{...input,classDef,allocated:new Set(input.allocated)});f.actor.level=input.level;
      const rebind=()=>{const owner={meta:f.meta,grantedInsts:f.seat.grantedInsts};for(let i=0;i<change.data.state.skillBook.bar.length;i++){const id=change.data.state.skillBook.bar[i];
        f.actor.skills[i]=id===null?null:known.get(id)??this.#equipment.resolve(owner,id,p.contributions.compileItem)??null;
        if(id!==null&&!f.actor.skills[i])throw Error('Unresolved live character binding');
      }f.seat.grantedInsts=owner.grantedInsts;};
      // Resolve the requested positions before slot-dependent graft derivation.
      // Cold bindings are learned skills or admitted worn grants, like World.
      rebind();
      let rebuilt=false;
      for(const event of change.events){
        if(beforeInvestment.has(event.kind))continue;
        if(event.kind==='recalculate'){
          const features=new Set(input.features),contributions=new BuildContributions<I,Modifier,T>({...p.contributions,
            board:def=>p.contributions.board(def,features),beginPassives:meta=>p.passives.begin(meta.baseAttrs,meta.allocated,meta.choices,'skip')});
          new CharacterRebuild({contributions,equipment:this.#equipment,levelModifiers:p.levelModifiers}).rebuild(f);rebuilt=true;rebind();
        }
        this.effects.event(event);
      }
      // Bar/rack and currency operations may have no recalculation signal.
      // Rebinding never replaces surviving learned or granted skill identities.
      if(!rebuilt)rebind();
    }finally{this.#busy=false;}
  }
}
