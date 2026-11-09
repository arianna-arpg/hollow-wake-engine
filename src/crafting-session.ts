import {CraftingContent} from './crafting-content.js';
import {CraftingActions, type CraftingCue, type CraftingRefusal, type SalvageLane, type SalvageCategory} from './crafting-actions.js';
import {SkillProgression} from './skill-progression.js';
import {createGemCargo, type GemSkill, type GemSupport} from './gem-residence.js';
import {createItemHost} from './item-host.js';
import {InventoryHost} from './inventory-host.js';
import {EquipmentSlots,equipOnBoard,unequipOnBoard,equipmentTierLevel} from './equipment-actions.js';
import type {WorkshopRack,WorkshopEvent} from './workshop-rack.js';
import {Random} from './random.js';
import {CraftingSessionData, craftingSaveVersion, type CraftingSessionState, type CraftingSessionDefinitions} from './crafting-session-data.js';
import type {ItemInstance, ItemRollOptions, ItemForgeOptions} from './item-types.js';
import {validateMint} from './item-validation.js';
import {copySessionJSON, cloneOwnedJSON, retainSessionPart, type SessionPart, SessionInputError, requireSession as need, sessionFields as fields, sessionRecord as record,
  sessionInteger as integer, sessionText as text, sessionBoolean as bool} from './session-json.js';
export type {CraftingSessionState, CraftingSessionDefinitions} from './crafting-session-data.js';

type Profile = {state: CraftingSessionState; nextUid: number; random: Random; account?:Readonly<SessionPart>};
type SkillDef = ReturnType<SkillProgression['skill']>;
type SupportDef = ReturnType<SkillProgression['support']>;
type Access = {salvage: boolean; oracle: boolean; bench: boolean; counter: boolean};
type Event = WorkshopEvent | {kind: 'cue'; cue: CraftingCue} | {kind: 'refused'; reason: CraftingRefusal; noteKey: string}
  | {kind: 'insufficient'; essence: string; count: number; noteKey: string}
  | {kind: 'recalculate' | 'dirty' | 'account-save'} | {kind: 'recovered'; uid: number; destination: 'bag' | 'overflow'};
const refuse = (reason: string) => ({ok: false as const, reason});
const allItems = (s: CraftingSessionState) => [...s.items,...Object.values(s.equipped),...s.overflow];

/** Bounded owned crafting/UI sessions. Content is shared; each profile owns its
 * item bodies, wallet, lore, UID and random continuation. Hosts authorize station
 * observations and persist saves/events. No host callback runs during a command. */
export class CraftingSession {
  readonly #defs: CraftingSessionDefinitions;
  readonly #data: CraftingSessionData;
  readonly #profiles = new Map<number, Profile>();
  readonly #accountViews = new WeakMap<Readonly<SessionPart>, number>();
  #nextAccountView = 1;
  readonly #identity: unknown[];
  readonly #maxProfiles: number;
  readonly #inventory: InventoryHost<ItemInstance>;
  readonly #skills;
  readonly #supports;
  #wear?: Parameters<typeof equipOnBoard<ItemInstance>>[1];
  readonly #rack?: WorkshopRack;
  constructor(definitions: CraftingSessionDefinitions, maxProfiles = 8, rack?: WorkshopRack) {
    need(definitions?.crafting instanceof CraftingContent && definitions?.skills instanceof SkillProgression,'invalid-session-content');
    integer(maxProfiles,1,64); this.#maxProfiles = maxProfiles;
    if(rack){
      const gem=definitions.crafting.items.pack.bases.skill_gem;
      need(gem?.w===1&&gem.h===1,'unsupported-gem-footprint');this.#rack=rack;
    }
    const memoryKinds = copySessionJSON(definitions.memoryKinds); record(memoryKinds);
    for (const [base,kind] of Object.entries(memoryKinds)) {
      text(kind); need(Object.hasOwn(definitions.crafting.items.pack.bases,base),'unknown-memory-base');
      need(Object.hasOwn(definitions.crafting.pack.sell.memoryUnit,kind),'unknown-memory-price');
    }
    Object.freeze(memoryKinds);
    this.#defs = Object.freeze({crafting:definitions.crafting,skills:definitions.skills,memoryKinds:memoryKinds as Record<string,string>});
    this.#data = new CraftingSessionData(this.#defs);
    this.#identity = [definitions.crafting.items.id,definitions.crafting.pack.contentId,definitions.skills.pack.contentId,
      Object.entries(memoryKinds).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)];
    this.#skills = new Map(definitions.skills.pack.skills.map(row => [row.id,row]));
    this.#supports = new Map(definitions.skills.pack.supports.map(row => [row.id,row]));
    this.#inventory = new InventoryHost(item => this.#defs.crafting.items.pack.bases[item.baseId]);
  }
  #snapshot(profile: Profile) {
    const version=craftingSaveVersion(profile.state);
    return {schemaVersion:version,capability:'crafting-session/v'+version,content:this.#identity,
      random:profile.random.snapshot(),nextUid:profile.nextUid,state:profile.state};
  }
  /** Write the committed portable save directly for storage. */
  snapshotText(id: number) {
    if(!Number.isSafeInteger(id)||id<0||id>0xffffffff)return refuse('invalid-integer');
    const profile=this.#profiles.get(id);
    return profile?{ok:true as const,text:JSON.stringify(this.#snapshot(profile))}:refuse('not-open');
  }
  /** Only worn item bodies cross into the combat projection; no bag, account,
   * wallet or random state is serialized by this read. */
  equipmentText(id: number) {
    if(!Number.isSafeInteger(id)||id<0||id>0xffffffff)return refuse('invalid-integer');
    const profile=this.#profiles.get(id);
    return profile?{ok:true as const,text:JSON.stringify(profile.state.equipped)}:refuse('not-open');
  }
  /** Detached read projection. An account token is valid only in this session
   * instance; zero requests the full account. A matching token replaces that
   * unchanged subtree with null, retaining its property position. The reader
   * must replace the marker with its matching account before saving the view.
   * Ordinary save/snapshotText stay complete. */
  snapshotView(id: number, knownAccountVersion = 0) {
    if(!Number.isSafeInteger(id)||id<0||id>0xffffffff||!Number.isSafeInteger(knownAccountVersion)||knownAccountVersion<0)
      return refuse('invalid-integer');
    const profile=this.#profiles.get(id);
    if(!profile)return refuse('not-open');
    const part=profile.account!;
    let accountVersion=this.#accountViews.get(part);
    if(accountVersion===undefined){
      if(this.#nextAccountView>Number.MAX_SAFE_INTEGER)return refuse('view-version-exhausted');
      accountVersion=this.#nextAccountView++;
      this.#accountViews.set(part,accountVersion);
    }
    const state={...profile.state,account:accountVersion===knownAccountVersion?null:profile.state.account};
    const view={...this.#snapshot(profile),state};
    return {ok:true as const,accountVersion,view:cloneOwnedJSON(view)};
  }
  /** Bind the host's authored slot pack once. Existing profiles retain their
   * identities and legacy slot keys. Only equip and unequip consume this pack. */
  configureEquipment(slots: EquipmentSlots): void {
    need(!this.#wear,'already-configured');
    need(slots instanceof EquipmentSlots,'invalid-equipment-slots');
    const pack=this.#defs.crafting.items.pack;
    this.#wear={slots:()=>slots.slots(),slot:id=>slots.slot(id),base:item=>pack.bases[item.baseId],
      level:item=>pack.bases[item.baseId].category==='relic'?1:equipmentTierLevel(item.tier,pack.config.tierBreaks)};
  }
  #validate(profile: Profile): void {
    this.#data.state(profile.state,this.#rack?.validate,profile.account?.value,this.#rack?.validateBook); integer(profile.nextUid,1); integer(profile.random.draws);
    for (const item of allItems(profile.state)) need(item.uid < profile.nextUid,'uid-floor');
    if(!Object.is(profile.state.account,profile.account?.value)){
      profile.account=retainSessionPart(profile.state.account);
      profile.state.account=profile.account.value as unknown as CraftingSessionState['account'];
    }
    // Reserve the whole restore envelope. Keep its checked copy so even a
    // rack extension that retained its draft cannot reach committed cargo.
    const checked=copySessionJSON({op:'restore',profile:0xffffffff,save:this.#snapshot(profile)},profile.account);
    profile.state=(checked as unknown as {save:{state:CraftingSessionState}}).save.state;
  }
  #mutate(profile: Profile, work: (draft: Profile, events: Event[]) => unknown, editAccount=false): unknown {
    const draft: Profile = {state:cloneOwnedJSON(profile.state,editAccount?undefined:profile.account?.value),account:profile.account,
      nextUid:profile.nextUid,random:Random.restore(profile.random.snapshot())};
    const events: Event[] = [], result = work(draft,events);
    this.#validate(draft);
    const reply = copySessionJSON({ok:true,result:result ?? null,events,draws:draft.random.draws,nextUid:draft.nextUid});
    // Only a fully validated state AND reply may replace the owned profile.
    profile.state = draft.state; profile.random = draft.random; profile.nextUid = draft.nextUid;
    profile.account=draft.account;
    return reply;
  }
  #next(profile: Profile): number {
    need(profile.nextUid < Number.MAX_SAFE_INTEGER,'uid-exhausted'); return profile.nextUid++;
  }
  #random(profile: Profile): number {
    need(profile.random.draws < Number.MAX_SAFE_INTEGER,'random-exhausted'); return profile.random.next();
  }
  #board(state: CraftingSessionState) {
    const b = state.board;
    return {w:b.w,h:b.h,...(b.rows ? {open:(x: number,y: number) => b.rows![y][x] === '#'} : {})};
  }
  #receive(profile: Profile, item: ItemInstance, events: Event[]): void {
    const state = profile.state, placed = this.#inventory.autoPlace(state.items,item,this.#board(state));
    if (!placed) state.overflow.push(item);
    events.push({kind:'recovered',uid:item.uid,destination:placed ? 'bag' : 'overflow'});
  }
  #gems(profile: Profile) {
    const s = profile.state, skills = this.#defs.skills;
    return createGemCargo({
      skill:(id: string) => this.#skills.get(id),support:(id: string) => this.#supports.get(id),
      // This session preserves attunement IDs without interpreting world forms.
      hasForm:() => true,makeSkill:(def,level,sockets): GemSkill<SkillDef,SupportDef> => ({def,level,sockets:Array<GemSupport<SupportDef> | null>(sockets).fill(null)}),
      validTreeNodes:(def,ids,level,inst) => skills.tree(def.id).restore(ids,level,inst),nextUid:() => this.#next(profile),
      bagWidth:() => s.board.w,bagHeight:() => s.board.h,itemGridSize:(item: ItemInstance) => this.#defs.crafting.items.pack.bases[item.baseId],
    });
  }
  #actions(profile: Profile, access: Access, events: Event[]) {
    const s=profile.state,gems=this.#gems(profile);
    return new CraftingActions(this.#defs.crafting.rules,{
      carry:() => s,account:() => s.account,hasFeature:id => s.account.features.includes(id),progression:() => s.account.progression,
      reach:(_ctx: null,station) => access[station],nearBench:() => access.bench,nearCounter:() => access.counter,
      bagItem:(_ctx: null,uid) => s.items.find(i => i.uid === uid),
      findCarried:(_ctx: null,uid) => s.items.find(i => i.uid === uid) ?? Object.values(s.equipped).find(i => i.uid === uid),
      remove:(items,uid) => {this.#inventory.remove(items,uid);},
      spend:(_ctx: null,cost,noteKey) => {
        const have = s.essences[cost.essence] ?? 0;
        if (have < cost.count) {events.push({kind:'insufficient',...cost,noteKey}); return false;}
        s.essences[cost.essence] = have - cost.count; return true;
      },
      grant:(_ctx: null,gain) => {const next = (s.essences[gain.essence] ?? 0) + gain.count; integer(next); s.essences[gain.essence] = next;},
      random:() => this.#random(profile),recalc:() => events.push({kind:'recalculate'}),dirty:() => events.push({kind:'dirty'}),
      save:() => events.push({kind:'account-save'}),refuse:(_ctx: null,reason,noteKey) => events.push({kind:'refused',reason,noteKey}),
      cue:(_ctx: null,cue) => events.push({kind:'cue',cue}),skill:item => gems.skillOfGemItem(item),support:item => gems.supportOfGemItem(item),
      skillPayload:item => gems.skillGemPayloadOf(item),grantSupport:(_ctx: null,support) => this.#receive(profile,gems.makeSupportGemItem(support),events),
      memoryKind:item => this.#defs.memoryKinds[item.baseId],
    });
  }
  /** Invalid data and capacity overflows refuse atomically. Unexpected internal
   * failures throw without committing; hosts must not retry blindly after I/O. */
  command(input: unknown): unknown {
    try {
      const reply=this.#command(copySessionJSON(input));
      // Each committed profile passed the larger restore envelope. A public
      // save still gets a detached, mutable copy, including account lore.
      if(reply && typeof reply==='object' && Object.hasOwn(reply,'save'))return cloneOwnedJSON(reply);
      return copySessionJSON(reply);
    }
    catch (error) {if (error instanceof SessionInputError) return refuse(error.message); throw error;}
  }
  #command(request: unknown): unknown {
    record(request); text(request.op); integer(request.profile,0,0xffffffff);
    const profile = this.#profiles.get(request.profile);
    if (request.op === 'open' || request.op === 'restore') {
      fields(request,request.op === 'open' ? ['op','profile','seed','nextUid','state'] : ['op','profile','save']);
      if (profile) return refuse('already-open'); if (this.#profiles.size >= this.#maxProfiles) return refuse('profile-limit');
      let next: Profile;
      if (request.op === 'open') {
        integer(request.seed,0,0xffffffff); const state = this.#data.state(request.state,this.#rack?.validate,undefined,this.#rack?.validateBook);
        const floor = allItems(state).reduce((n,i) => Math.max(n,i.uid + 1),1), nextUid = request.nextUid ?? floor;
        integer(nextUid,1); next = {state,nextUid,random:new Random(request.seed)};
      } else {
        const save = request.save; fields(save,['schemaVersion','capability','content','random','nextUid','state']);
        record(save.state);
        const version=craftingSaveVersion(save.state);
        need(save.schemaVersion === version && save.capability === 'crafting-session/v'+version,'unsupported-save');
        need(JSON.stringify(save.content) === JSON.stringify(this.#identity),'content-mismatch'); integer(save.nextUid,1);
        const random = save.random; fields(random,['algorithm','state','draws']); need(random.algorithm === 'mulberry32/v1','unsupported-random');
        integer(random.state,0,0xffffffff); integer(random.draws);
        next = {state:this.#data.state(save.state,this.#rack?.validate,undefined,this.#rack?.validateBook),nextUid:save.nextUid,random:Random.restore({algorithm:'mulberry32/v1',state:random.state,draws:random.draws})};
      }
      this.#validate(next); this.#profiles.set(request.profile,next); return {ok:true};
    }
    if (!profile) return refuse('not-open');
    const rack=this.#rack;
    if(rack && (request.op==='learn-skill'||request.op==='unlearn-skill'||rack.handles?.(request.op))){
      return this.#mutate(profile,(draft,events)=>{
        const result=rack.move(request,draft.state,this.#inventory,this.#board(draft.state),this.#gems(draft),event=>events.push(event));
        if(result.changed&&!events.length)events.push({kind:'recalculate'},{kind:'dirty'});
        return {...result,needsSave:result.needsSave || draft.nextUid!==profile.nextUid};
      },rack.move!==rack.accountPreservingMove);
    }
    if(request.op==='equip'||request.op==='unequip'){
      const wear=this.#wear;
      if(!wear)return refuse('equipment-unavailable');
      const equip=request.op==='equip';
      fields(request,equip?['op','profile','uid','actorLevel','slot']:['op','profile','uid','slot','x','y']);
      const {uid,slot,actorLevel}=request; integer(uid,1);
      if(equip)integer(actorLevel,1);
      if(!equip||slot!==undefined)text(slot);
      if(!equip && (request.x!==undefined || request.y!==undefined)){
        integer(request.x);integer(request.y);
      }
      return this.#mutate(profile,(draft,events)=>{
        const state=draft.state,board=this.#board(state);
        if(!equip&&state.equipped[slot as string]?.uid!==uid)return {changed:false};
        const action=equip?equipOnBoard(this.#inventory,wear,{carry:state,bagBoard:board,level:actorLevel as number,
          drop:item=>{state.overflow.push(item);events.push({kind:'recovered',uid:item.uid,destination:'overflow'});}},uid,slot as string|undefined)
          :unequipOnBoard(this.#inventory,{carry:state,bagBoard:board},slot as string,
            request.x as number|undefined,request.y as number|undefined);
        if(action.changed)events.push({kind:'recalculate'},{kind:'dirty'});
        return action.refusal?{changed:false,refusal:action.refusal}:{changed:action.changed};
      });
    }
    const state = profile.state, rules = this.#defs.crafting.rules;
    if (request.op === 'save') {fields(request,['op','profile']); return {ok:true,save:this.#snapshot(profile)};}
    if (request.op === 'close') {fields(request,['op','profile']); this.#profiles.delete(request.profile); return {ok:true};}
    if (request.op === 'options' || request.op === 'station-view') {
      fields(request,['op','profile','uid','offset','limit']); integer(request.uid,1); integer(request.offset); integer(request.limit,1,128);
      const item = state.items.find(i => i.uid === request.uid) ?? Object.values(state.equipped).find(i => i.uid === request.uid);
      if (!item) return refuse('unknown-item');
      const rows = rules.craftableAffixesFor(item,state.account.craftLore);
      const options={ok:true,total:rows.length,rows:rows.slice(request.offset,request.offset + request.limit).map(row => ({
        id:row.def.id,name:row.def.names.at(-1) ?? row.def.id,rank:row.rank,cost:rules.ports.cost(row.rank),
      })),crafted:rules.craftedCount(item),slots:rules.ports.craft.maxCraftedAffixes + (state.account.features.includes(rules.ports.craft.extraSlotFeature) ? 1 : 0)};
      if(request.op==='options')return options;
      return {...options,
        socket:{count:item.sockets?.length??0,cap:rules.ports.socketCap(this.#defs.crafting.items.pack.bases[item.baseId].category),cost:rules.ports.craft.socketCost},
        reroll:{cost:rules.ports.oracleCost(item.rarity),affixes:item.affixes.map((affix,index)=>{
          const definition=rules.ports.affix(affix.id)!;
          return {index,id:affix.id,name:definition.names[affix.tier]??definition.names.at(-1)??affix.id,
            locked:affix.locked===true,crafted:affix.crafted===true};
        })}};
    }
    if (request.op === 'recover' || request.op === 'take-overflow') {
      fields(request,['op','profile','uid']); integer(request.uid,1);
      return this.#mutate(profile,draft => {
        const index = draft.state.overflow.findIndex(i => i.uid === request.uid); if (index < 0) return {moved:false};
        const item = draft.state.overflow[index];
        if (request.op === 'recover' && !this.#inventory.autoPlace(draft.state.items,item,this.#board(draft.state))) return {moved:false};
        draft.state.overflow.splice(index,1); return request.op === 'recover' ? {moved:true} : {moved:true,item};
      });
    }
    if (request.op === 'mint') {
      fields(request,['op','profile','kind','options']); need(request.kind === 'roll' || request.kind === 'forge','unknown-mint'); record(request.options);
      try {validateMint(request.options as unknown as ItemRollOptions,request.kind === 'forge');} catch {throw new SessionInputError('invalid-mint');}
      return this.#mutate(profile,(draft,events) => {
        const host = createItemHost(this.#defs.crafting.items,() => this.#next(draft));
        const item = request.kind === 'forge' ? host.forge(request.options as unknown as ItemForgeOptions,() => this.#random(draft))
          : host.roll(request.options as unknown as ItemRollOptions,() => this.#random(draft));
        if (item) {this.#data.item(item); this.#receive(draft,item,events);} return {uid:item?.uid ?? null};
      });
    }
    const args: Record<string,string[]> = {craft:['uid','affixId','score'],socket:['uid'],reroll:['uid','index','score'],
      salvage:['uid','lane'],'salvage-bulk':['category','rarity','lane'],lock:['uid','on']};
    if (!Object.hasOwn(args,request.op)) return refuse('unknown-operation');
    fields(request,['op','profile','access',...args[request.op]]);
    const access = request.access; fields(access,['salvage','oracle','bench','counter']);
    for (const key of ['salvage','oracle','bench','counter']) bool(access[key]);
    if (request.op !== 'salvage-bulk') integer(request.uid,1);
    if (request.op === 'craft') text(request.affixId);
    if (request.op === 'craft' || request.op === 'reroll') need(typeof request.score === 'number' && Number.isFinite(request.score),'invalid-score');
    if (request.op === 'reroll') integer(request.index);
    if (request.op === 'lock') bool(request.on);
    if (request.lane !== undefined) need(request.lane === 'break' || request.lane === 'sell','invalid-lane');
    if (request.op === 'salvage-bulk') {
      need(['item','skill','support'].includes(request.category as string),'invalid-category');
      if (request.rarity !== undefined) {
        text(request.rarity); const valid = request.category === 'skill' ? Object.keys(rules.ports.gemEssences) : ['common','magic','rare','unique'];
        need(valid.includes(request.rarity),'invalid-rarity');
      }
    }
    return this.#mutate(profile,(draft,events) => {
      const actions = this.#actions(draft,access as Access,events), uid = request.uid as number;
      switch (request.op) {
        case 'craft': actions.craftAffix(null,uid,request.affixId as string,request.score as number); break;
        case 'socket': actions.craftSocket(null,uid); break;
        case 'reroll': actions.rerollAffix(null,uid,request.index as number,request.score as number); break;
        case 'salvage': actions.salvageItem(null,uid,request.lane as SalvageLane | undefined); break;
        case 'salvage-bulk': actions.salvageBulk(null,request.category as SalvageCategory,request.rarity as string | undefined,request.lane as SalvageLane | undefined); break;
        case 'lock': actions.salvageLockSet(null,uid,request.on as boolean); break;
      }
    },request.op==='salvage' || request.op==='salvage-bulk');
  }
}
