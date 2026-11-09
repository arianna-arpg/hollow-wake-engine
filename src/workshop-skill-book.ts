import {WorkshopRack,moveWorkshopRack,type WorkshopResidence,type WorkshopSignal} from './workshop-rack.js';
import {WorkshopVestiges} from './workshop-vestiges.js';
import {SkillBarActions} from './skill-bar.js';
import {packSkillGemPayload,type GemSkill} from './gem-residence.js';
import type {CraftingSessionData,CraftingSessionState} from './crafting-session-data.js';
import type {ItemContent} from './item-rules.js';
import type {ItemInstance} from './item-types.js';
import type {InventoryHost,LiveInventoryBoard} from './inventory-host.js';
import {sessionFields as fields,sessionArray as array,sessionText as text,sessionInteger as integer,requireSession as need} from './session-json.js';

type Book=NonNullable<CraftingSessionState['skillBook']>;
const seats=8;
const unavailable=():never=>{throw new Error('Workshop bar binding must not execute live actor effects');};

function validateBook(input:unknown,data:CraftingSessionData):void {
  fields(input,['known','bar']);array(input.known,seats);array(input.bar,seats);
  need(input.bar.length===seats,'invalid-bar-size');need(input.known.every(row=>row!==null),'invalid-learned-book');
  WorkshopRack.prototype.validate([...input.known,...Array(seats-input.known.length).fill(null)],data);
  const known=new Set((input.known as Book['known']).map(row=>row.gem.skillId)),bound=new Set<string>();
  for(const id of input.bar){
    if(id===null)continue;text(id);need(known.has(id),'unresolved-bar-skill');need(!bound.has(id),'duplicate-bar-skill');bound.add(id);
  }
}

/** One admitted candidate, with learned payloads owned independently of the bar. */
function openBook<S extends GemSkill>(state:CraftingSessionState,gems:WorkshopResidence<S>){
  const book=state.skillBook!;const known=new Map<string,S>(),original=new Map<S,Book['known'][number]>();
  for(const row of book.known){const skill=gems.skillOfGemItem(row);need(skill,'unresolved-learned-skill');known.set(skill.def.id,skill);original.set(skill,row);}
  const body={skills:book.bar.map(id=>id===null?null:known.get(id)!)};
  return {body,known,save:()=>{
    state.skillBook={known:[...known.values()].map(skill=>original.get(skill)??
      {gem:packSkillGemPayload(skill),...(skill.locked?{locked:true as const}:{})}),bar:body.skills.map(skill=>skill?.def.id??null)};
  }};
}

/** Optional build-data owner. It composes the existing rack, support and vestige
 * policies. Preference observations and live bar handoff are explicit events;
 * this owner does not execute actor effects or mutate shared account preferences. */
export class WorkshopSkillBook implements WorkshopRack {
  readonly #legacy:WorkshopVestiges;
  readonly inlays;
  readonly validate=WorkshopRack.prototype.validate;
  readonly validateBook=validateBook;
  readonly accountPreservingMove=WorkshopSkillBook.prototype.move;
  readonly handles=(op:string)=>op==='promote-skill-book'||op==='bind-skill'||op==='swap-skill-slots'||this.#legacy.handles(op);
  constructor(items:ItemContent){this.#legacy=new WorkshopVestiges(items);this.inlays=this.#legacy.inlays;}

  move<S extends GemSkill>(request:Record<string,unknown>,state:CraftingSessionState,inventory:InventoryHost<ItemInstance>,
    board:LiveInventoryBoard,gems:WorkshopResidence<S>,signal?:WorkshopSignal){
    const op=request.op;
    if(op==='promote-skill-book'){
      fields(request,['op','profile']);
      if(state.skillBook)return {changed:false,needsSave:false};
      const rows=state.rack??Array<null>(seats).fill(null);
      state.skillBook={known:rows.filter((row):row is Book['known'][number]=>row!==null),bar:rows.map(row=>row?.gem.skillId??null)};
      delete state.rack;signal?.({kind:'dirty'});return {changed:true,needsSave:true};
    }
    if(op==='bind-skill'||op==='swap-skill-slots'){
      fields(request,op==='bind-skill'?['op','profile','slot','skillId']:['op','profile','a','b']);
      if(op==='bind-skill'){integer(request.slot,0,seats-1);if(request.skillId!==null)text(request.skillId);}
      else {integer(request.a,0,seats-1);integer(request.b,0,seats-1);}
      need(state.skillBook,'skill-book-required');
      const view=openBook(state,gems),before=view.body.skills.slice();
      const remember=(_seat:null,touched:readonly (S|null|undefined)[])=>{
        for(const inst of touched)if(inst)signal?.({kind:'remember-skill-slot',skillId:inst.def.id,slot:view.body.skills.indexOf(inst)});
      };
      const actions=new SkillBarActions<null,typeof view.body,S>({
        hero:()=>view.body,resolve:(_,id)=>view.known.get(id)??null,remember,
        rebind:(_,touched)=>{remember(null,touched);signal?.({kind:'bar-rebound',skillIds:[...new Set(touched.filter((s):s is S=>!!s).map(s=>s.def.id))]});},
        // These ports belong to live rebind/preference policies, never to the
        // borrowed binding methods used here. Fail loudly if that boundary moves.
        actor:unavailable,recalculate:unavailable,isFlask:unavailable,clearFields:unavailable,resync:unavailable,
        localSeat:unavailable,provisioning:unavailable,rememberSlot:unavailable,preferencesDirty:unavailable,
      });
      const accepted=op==='bind-skill'?actions.bind(null,request.slot as number,request.skillId as string|null)
        :actions.swap(null,request.a as number,request.b as number);
      const changed=before.some((skill,index)=>skill!==view.body.skills[index]);
      if(changed)view.save();return {accepted,changed,needsSave:changed};
    }
    if(state.skillBook&&(op==='learn-skill'||op==='unlearn-skill'))
      return moveWorkshopRack(request,state,inventory,board,gems,()=>openBook(state,gems));
    return this.#legacy.move(request,state,inventory,board,gems,signal);
  }
}
