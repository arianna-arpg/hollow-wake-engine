/** Synchronous bar edits over borrowed single-writer ownership. The learned
 * book and equipment investment remain separate from the bar's references. */
export interface BarSkill {def:{id:string}}
export interface BarBody<S> {skills:(S|null)[]}
export interface SkillBarPorts<Seat,Body,Skill> {
  hero(seat:Seat):Body;
  actor(seat:Seat):Body;
  resolve(seat:Seat,id:string):Skill|null;
  remember(seat:Seat,touched:readonly (Skill|null|undefined)[]):void;
  rebind(seat:Seat,touched:(Skill|null|undefined)[]):void;
  recalculate(seat:Seat):void;
  isFlask(skill:Skill):boolean;
  clearFields(body:Body,skill:Skill):void;
  resync(skill:Skill):void;
  localSeat():Seat;
  provisioning(seat:Seat):boolean;
  rememberSlot(skill:Skill,slot:number,overwrite:boolean):boolean;
  preferencesDirty():void;
}

export class SkillBarActions<Seat,Body extends BarBody<Skill>,Skill extends BarSkill> {
  readonly #p:SkillBarPorts<Seat,Body,Skill>;
  constructor(ports:SkillBarPorts<Seat,Body,Skill>){this.#p=ports;}

  bind(seat:Seat,slot:number,skillId:string|null):boolean {
    const r=this.#p,p=r.hero(seat);
    if(slot<0||slot>=p.skills.length)return false;
    const prev=p.skills[slot];
    if(skillId===null){
      r.remember(seat,[prev]);p.skills[slot]=null;r.rebind(seat,[prev]);return true;
    }
    const inst=r.resolve(seat,skillId);if(!inst)return false;
    r.remember(seat,[prev]);
    const already=prev?.def.id===skillId;
    for(let i=0;i<p.skills.length;i++)if(p.skills[i]?.def.id===skillId)p.skills[i]=null;
    if(!already)p.skills[slot]=inst;
    r.rebind(seat,[prev,inst]);return true;
  }

  swap(seat:Seat,a:number,b:number):boolean {
    const r=this.#p,p=r.hero(seat);
    if(a===b||a<0||b<0||a>=p.skills.length||b>=p.skills.length)return false;
    const ia=p.skills[a],ib=p.skills[b];if(!ia&&!ib)return true;
    p.skills[a]=ib;p.skills[b]=ia;r.rebind(seat,[ia,ib]);return true;
  }

  /** A failed callback keeps all writes completed before that callback. Hosts
   * needing atomic publication must run the whole edit on a private candidate. */
  rebind(seat:Seat,touched:(Skill|null|undefined)[]):void {
    const r=this.#p;r.remember(seat,touched);r.recalculate(seat);
    const seen=new Set<Skill>();
    for(const inst of touched){
      if(!inst||seen.has(inst))continue;seen.add(inst);
      if(r.isFlask(inst)&&!r.actor(seat).skills.includes(inst))r.clearFields(r.actor(seat),inst);
      r.resync(inst);
    }
  }

  remember(seat:Seat,touched:readonly (Skill|null|undefined)[]=this.#p.hero(seat).skills,overwrite=true):void {
    const r=this.#p;
    if(seat!==r.localSeat()||r.provisioning(seat))return;
    const bar=r.hero(seat).skills;
    for(const inst of touched)if(inst&&r.rememberSlot(inst,bar.indexOf(inst),overwrite))r.preferencesDirty();
  }
}

/** Legacy preference repair. New public command envelopes should validate
 * their own bounds before calling the borrowed-state policies above. */
export function restoreSkillSlotMemory(raw:unknown):Record<string,number> {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
  return Object.fromEntries(Object.entries(raw).filter(([id,slot])=>id.length>0&&Number.isSafeInteger(slot)&&slot>=0));
}

export function rememberSkillSlot<S extends BarSkill>(memory:Record<string,number>,inst:S,slot:number,
  overwrite:boolean,eligible:(skill:S)=>boolean):boolean {
  if(!Number.isSafeInteger(slot)||slot<0||!eligible(inst))return false;
  const previous=memory[inst.def.id];
  if(previous===slot||(!overwrite&&previous!==undefined))return false;
  memory[inst.def.id]=slot;return true;
}

export function planSkillSlots(ids:readonly string[],bar:readonly (string|null)[],memory:Record<string,number>):Map<string,number> {
  const slots=[...bar],plan=new Map<string,number>();
  const pending=[...new Set(ids)].filter(id=>{const at=slots.indexOf(id);if(at<0)return true;plan.set(id,at);return false;});
  for(const id of pending){
    const at=memory[id];if(!Number.isSafeInteger(at)||at<0||at>=slots.length||slots[at]!==null)continue;
    slots[at]=id;plan.set(id,at);
  }
  for(const id of pending){if(plan.has(id))continue;const at=slots.indexOf(null);if(at>=0)slots[at]=id;plan.set(id,at);}
  return plan;
}
