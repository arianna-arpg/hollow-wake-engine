import {SkillRackActions} from './skill-rack.js';
import {packSkillGemPayload,type GemSkill} from './gem-residence.js';
import type {ItemInstance} from './item-types.js';
import type {CraftingSessionState,CraftingSessionData} from './crafting-session-data.js';
import type {InventoryHost,LiveInventoryBoard} from './inventory-host.js';
import {requireSession as need,sessionArray as array,sessionRecord as record,sessionFields as fields,
  sessionText as text,sessionInteger as integer,sessionBoolean as bool} from './session-json.js';

type Residence<S> = {
  skillOfGemItem(item: Pick<ItemInstance,'gem'|'locked'>): S|null;
  makeSkillGemItem(skill:S): ItemInstance;
  freeCellCount(items:readonly ItemInstance[]): number;
};
const seats=8;

/** Optional eight-seat workshop for one actor whose learned book is its bar.
 * The authoritative host supplies the current requirements verdict and holds
 * on departing skills. Commands run entirely on a detached session draft. */
export class WorkshopRack {
  validate(input:unknown,data:CraftingSessionData):void {
    array(input,seats);need(input.length===seats,'invalid-rack-size');
    const seen=new Set<string>();
    for(const row of input){
      if(row===null)continue;
      fields(row,['gem','locked']);need(row.locked===undefined||row.locked===true,'invalid-lock');
      data.skillPayload(row.gem);record(row.gem);
      const id=row.gem.skillId as string;
      need(!seen.has(id),'duplicate-learned-skill');seen.add(id);
    }
  }
  move<S extends GemSkill>(request:Record<string,unknown>,state:CraftingSessionState,inventory:InventoryHost<ItemInstance>,
    board:LiveInventoryBoard,gems:Residence<S>){
    const learn=request.op==='learn-skill';
    fields(request,learn?['op','profile','uid','slot','meets','blocked']:['op','profile','skillId','blocked']);
    if(learn){integer(request.uid,1);bool(request.meets);if(request.slot!==undefined)integer(request.slot,0,seats-1);}
    else text(request.skillId);
    const blocked=request.blocked;record(blocked);
    need(Object.keys(blocked).length<=seats,'invalid-rack-holds');
    for(const [id,reason] of Object.entries(blocked)){text(id);text(reason);}
    const rows=state.rack??Array<null>(seats).fill(null);
    const original=rows.map(row=>row?gems.skillOfGemItem(row):null);
    const body={skills:original.slice()};
    const known=new Map<string,S>();
    for(const skill of body.skills)if(skill)known.set(skill.def.id,skill);
    const before=state.items.findIndex(item=>item.uid===request.uid);
    let refusal:string|undefined;
    const noop=()=>{};
    const actions=new SkillRackActions<null,typeof body,S,ItemInstance>({
      maxLearned:seats,hero:()=>body,actor:()=>body,known:()=>known,granted:()=>false,
      bagItem:(_,uid)=>state.items.find(item=>item.uid===uid),unpack:gems.skillOfGemItem,pack:gems.makeSkillGemItem,
      meets:()=>request.meets===true,
      refusal:(_,skill)=>Object.hasOwn(blocked,skill.def.id)?{key:'hold',why:blocked[skill.def.id] as string}:null,
      fail:(_body,_key,why)=>{refusal=why;},remove:(_,uid)=>{inventory.remove(state.items,uid);},
      freeCells:()=>{
        let count=gems.freeCellCount(state.items);
        for(const row of state.board.rows??[])for(const cell of row)if(cell==='.')count--;
        return count;
      },
      place:(_,item,x,y)=>x===undefined?inventory.autoPlace(state.items,item,board):inventory.place(state.items,item,x,y!,board),
      beforeForget:noop,afterForget:noop,afterLearn:noop,dirty:noop,afterUnlearn:noop,
    });
    const changed=learn?actions.learn(null,request.uid as number,request.slot as number|undefined):actions.unlearn(null,request.skillId as string);
    if(changed)state.rack=body.skills.map((skill,index)=>{
      if(skill===original[index])return rows[index];
      return skill?{gem:packSkillGemPayload(skill),...(skill.locked?{locked:true as const}:{})}:null;
    });
    // A refused two-skill swap may append the original wrapper back at its cell.
    const reordered=learn && !changed && before!==state.items.findIndex(item=>item.uid===request.uid);
    return {changed,needsSave:changed||reordered,...(refusal?{refusal}:{})};
  }
}
