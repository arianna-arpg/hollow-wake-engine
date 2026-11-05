import {Random} from './random.js';
import {UnlockContent, type UnlockPack} from './unlock-content.js';
import {UnlockLifecycle, type UnlockAccount} from './unlock-lifecycle.js';
import {MemoryRewardContent, type MemoryRewardPack} from './memory-reward-content.js';
import {ProgressionGateContent, type ProgressionGatePack} from './progression-gate-content.js';
import {RelicCustody, type RelicState} from './relic-custody.js';
import {StashPolicy} from './stash-policy.js';
import type {MemoryAccount} from './memory-rewards.js';

export interface ProgressionSessionContent {unlocks: UnlockPack; memories: MemoryRewardPack; gates: ProgressionGatePack}
export type ProgressionJSON = null | boolean | number | string | ProgressionJSON[] | {[key: string]: ProgressionJSON};
/** Geometry is explicit; payload is opaque JSON retained exactly. This boundary
 * does not perform item rolling, equipment changes or custody transfers. */
export interface ProgressionRelic {uid: number; relicKey: string; w: number; h: number; x?: number; y?: number; payload: ProgressionJSON}
type Account = UnlockAccount & MemoryAccount & {reliquary: RelicState<ProgressionRelic>};
type Profile = {account: Account; random: Random};
const stringSets = ['unlockedClasses','pendingClassUnlocks','unlockedClassTiers','unlockedSkills','unlockedSupports',
  'explicitSkillUnlocks','features','packageUnlocks','memorySecondary'] as const;
const accountFields = ['level','credits','ledger','invested','unlockedSlots',...stringSets,'memoryReceipts','skillGraft','reliquary','roster'];
const refuse = (reason: string) => ({ok:false as const, reason});
class Invalid extends Error {}
function requireValue(value: unknown, label: string): asserts value {if (!value) throw new Invalid(label);}
function record(value: unknown): asserts value is Record<string, unknown> {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'invalid-object');
}
function fields(value: unknown, names: readonly string[]): asserts value is Record<string, unknown> {
  record(value); requireValue(Object.keys(value).every(key => names.includes(key)), 'unknown-field');
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): asserts value is number {
  requireValue(Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max, 'invalid-integer');
}
function text(value: unknown): asserts value is string {requireValue(typeof value === 'string' && value.length > 0 && value.length <= 256, 'invalid-string');}
function bool(value: unknown): asserts value is boolean {requireValue(typeof value === 'boolean', 'invalid-boolean');}
function array(value: unknown, max = 2048): asserts value is unknown[] {requireValue(Array.isArray(value) && value.length <= max, 'invalid-array');}
function strings(value: unknown): string[] {
  array(value); value.forEach(text); requireValue(new Set(value).size === value.length, 'duplicate-id'); return value as string[];
}
function numbers(value: unknown): Record<string, number> {
  record(value); requireValue(Object.keys(value).length <= 2048, 'record-limit');
  const result: Record<string,number> = Object.create(null);
  for (const [key, amount] of Object.entries(value)) {text(key); integer(amount); result[key] = amount;}
  return result;
}
/** Copy only JSON data. Refuse accessors, cycles, exotic objects, nonfinite
 * numbers and excessive nesting before executing a command. Limits are protocol
 * limits, not a claim about total host/VM allocations. */
function jsonCopy(value: unknown): ProgressionJSON {
  let nodes = 0, characters = 0, bytes = 0;
  const charge = (amount: number) => {bytes += amount; requireValue(bytes <= 512*1024, 'json-byte-limit');};
  const string = (value: string) => {
    characters += value.length; requireValue(characters <= 131072, 'json-limit');
    let size = 2;
    // Canonical JSON UTF-8 length, without allocating an encoded copy. Leave
    // headroom under the Godot host's 1 MiB request cap for float formatting.
    for(let index = 0; index < value.length; index++) {
      const c = value.charCodeAt(index);
      if(c === 0) throw new Invalid('unsupported-nul');
      if(c === 34 || c === 92 || c === 8 || c === 9 || c === 10 || c === 12 || c === 13) size += 2;
      else if(c < 32) size += 6;
      else if(c < 128) size++;
      else if(c < 2048) size += 2;
      else if(c >= 0xd800 && c <= 0xdbff && value.charCodeAt(index+1) >= 0xdc00 && value.charCodeAt(index+1) <= 0xdfff) {size += 4; index++;}
      else if(c >= 0xd800 && c <= 0xdfff) throw new Invalid('invalid-unicode');
      else size += 3;
    }
    charge(size);
  };
  function visit(row: unknown, depth: number): ProgressionJSON {
    requireValue(++nodes <= 32768 && depth <= 16, 'json-limit');
    if (row === null || typeof row === 'boolean') {charge(row === false ? 5 : 4); return row;}
    if (typeof row === 'number') {requireValue(Number.isFinite(row), 'invalid-number'); charge(String(row).length); return row;}
    if (typeof row === 'string') {string(row); return row;}
    if (Array.isArray(row)) {
      requireValue(Object.getPrototypeOf(row) === Array.prototype && Object.keys(row).length === row.length, 'invalid-array');
      const out: ProgressionJSON[] = []; charge(2+Math.max(0,row.length-1));
      for(let index = 0; index < row.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(row,String(index));
        requireValue(descriptor && 'value' in descriptor, 'invalid-array'); out.push(visit(descriptor.value,depth+1));
      }
      return out;
    }
    record(row);
    const proto = Object.getPrototypeOf(row);
    requireValue(proto === Object.prototype || proto === null, 'invalid-object');
    const out: Record<string,ProgressionJSON> = Object.create(null); charge(2); let first = true;
    for (const key of Object.keys(row)) {
      string(key); charge(first ? 1 : 2); first = false;
      const descriptor = Object.getOwnPropertyDescriptor(row,key)!;
      requireValue('value' in descriptor, 'invalid-accessor'); out[key] = visit(descriptor.value,depth+1);
    }
    return out;
  }
  return visit(value,0);
}

/** Persistent, bounded account sessions for engine adapters. Host-authorized
 * observations and durable I/O remain outside this service. No ambient RNG,
 * engine objects, timers or filesystem access. */
export class ProgressionSession {
  readonly #profiles = new Map<number,Profile>();
  readonly #content: UnlockContent;
  readonly #sdk: UnlockLifecycle<Account>;
  readonly #relics: RelicCustody<ProgressionRelic>;
  readonly #identity: readonly string[];
  readonly #maxProfiles: number;
  constructor(input: ProgressionSessionContent, maxProfiles = 8) {
    integer(maxProfiles,1,64); this.#maxProfiles = maxProfiles;
    const gates = new ProgressionGateContent(input.gates), memories = new MemoryRewardContent(input.memories);
    this.#content = new UnlockContent(input.unlocks,{gates,memories});
    const pack = this.#content.pack;
    this.#identity = [pack.contentId,gates.pack.contentId,memories.pack.contentId];
    const stash = {...pack.relicStash, accepts: (_item: ProgressionRelic) => true};
    // This service never calls migration/UID allocation/bag placement. These
    // ports fail explicitly if its operation surface is expanded incorrectly.
    const unused = (): never => {throw new Error('Progression session does not transfer item custody');};
    this.#relics = new RelicCustody({isRelic:() => true,footprint:item => item,nextUid:unused,bumpUidFloor:() => {},
      cloneItems:items => items.map(item => ({...item,payload:jsonCopy(item.payload)})),stash:() => stash,
      bagBoard:unused,progression:() => pack.reliquaryConfig});
    const storage = new StashPolicy<ProgressionRelic>(item => item);
    this.#sdk = new UnlockLifecycle<Account>(this.#content.context<Account>({
      reliquaryCost:state => this.#relics.cost(state),reliquaryPower:state => this.#relics.power(state),
      stashPageCost:state => storage.pageCost(stash,state),
      investReliquary:(a,amount) => this.#relics.investPower(a.reliquary,a,!!a.ledger[pack.reliquaryConfig.attunement],amount),
      investRelicStash:(a,amount) => this.#relics.investStorage(a.reliquary,a,a.features.has(pack.reliquaryFeature),amount),
    }));
  }
  #relicState(value: unknown): RelicState<ProgressionRelic> {
    fields(value,['items','seated','carried','released','enabled','rank','invested','stash']);
    bool(value.enabled); integer(value.rank,0,this.#content.pack.reliquaryConfig.maxRank);
    integer(value.invested,0,this.#relics.cost({rank:value.rank})-1);
    array(value.items,512); const keys = new Set<string>(), uids = new Set<number>();
    for (const item of value.items) {
      fields(item,['uid','relicKey','w','h','x','y','payload']); integer(item.uid,0,0xffffffff); text(item.relicKey);
      integer(item.w,1,256); integer(item.h,1,256); if(item.x !== undefined) integer(item.x); if(item.y !== undefined) integer(item.y);
      requireValue(Object.hasOwn(item,'payload'),'missing-payload');
      requireValue(!keys.has(item.relicKey) && !uids.has(item.uid),'duplicate-item'); keys.add(item.relicKey); uids.add(item.uid);
    }
    const seated = strings(value.seated), carried = strings(value.carried), released = strings(value.released);
    requireValue([...seated,...carried].every(key => keys.has(key)) && carried.every(key => !seated.includes(key))
      && released.every(key => !keys.has(key)), 'invalid-custody');
    fields(value.stash,['pages','invested','cells']); const def = this.#content.pack.relicStash;
    integer(value.stash.pages,def.initialPages,def.maxPages);
    integer(value.stash.invested,0,def.pageCostBase*(value.stash.pages-def.initialPages+1)**2-1);
    record(value.stash.cells);
    for (const [key,cell] of Object.entries(value.stash.cells)) {
      requireValue(keys.has(key) && !seated.includes(key) && !carried.includes(key),'invalid-storage-key');
      fields(cell,['page','x','y']); integer(cell.page,0,value.stash.pages-1); integer(cell.x); integer(cell.y);
    }
    const state = value as unknown as RelicState<ProgressionRelic>;
    // Refuse noncanonical placement instead of silently repairing/dropping save
    // data. Unplaced reserve items are allowed only when no cell can hold them.
    const repaired = this.#relics.restore(state);
    const cells = (s: typeof state.stash) => Object.entries(s.cells).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key,c]) => [key,c.page,c.x,c.y]);
    requireValue(JSON.stringify(cells(repaired.stash)) === JSON.stringify(cells(state.stash)), 'invalid-storage-layout');
    return state;
  }
  #roster(value: unknown): Account['roster'] {
    array(value,128); const ids = new Set();
    for (const row of value) {
      fields(row,['charId','name','fallen']); text(row.charId); text(row.name);
      requireValue(!ids.has(row.charId),'duplicate-character'); ids.add(row.charId);
      if (row.fallen !== undefined) {fields(row.fallen,['level','fee']); integer(row.fallen.level); integer(row.fallen.fee);}
    }
    return value as Account['roster'];
  }
  #account(value: unknown): Account {
    fields(value,accountFields); integer(value.level); integer(value.credits); bool(value.skillGraft);
    const ledger = numbers(value.ledger), invested = numbers(value.invested);
    for (const key of stringSets) value[key] = new Set(strings(value[key]));
    array(value.unlockedSlots); value.unlockedSlots.forEach(v => integer(v,1,256));
    requireValue(new Set(value.unlockedSlots).size === value.unlockedSlots.length,'duplicate-slot'); value.unlockedSlots = new Set(value.unlockedSlots);
    record(value.memoryReceipts);
    for (const [key,receipt] of Object.entries(value.memoryReceipts)) {
      text(key); fields(receipt,['sequence','kind','id','tier']); integer(receipt.sequence,1); text(receipt.id);
      requireValue(['skill','support'].includes(receipt.kind as string) && ['discovery','secondary'].includes(receipt.tier as string),'invalid-receipt');
    }
    return {...value,ledger,invested,roster:this.#roster(value.roster),reliquary:this.#relicState(value.reliquary)} as unknown as Account;
  }
  #empty(): Account {
    const sets = Object.fromEntries(stringSets.map(key => [key,new Set<string>()])) as Record<typeof stringSets[number],Set<string>>;
    return {...sets,level:0,credits:0,ledger:Object.create(null),
      invested:Object.create(null),unlockedSlots:new Set<number>(),memoryReceipts:Object.create(null),skillGraft:false,
      roster:[],reliquary:this.#relics.empty()};
  }
  #snapshot(profile: Profile) {
    const account = profile.account;
    // Validate the largest transport envelope, so a successfully admitted state
    // can both produce a save reply and reenter through a restore command.
    const envelope = jsonCopy({op:'restore',profile:0xffffffff,save:{schemaVersion:1,capability:'progression-session/v1',
      content:[...this.#identity],random:profile.random.snapshot(),
      account:{...account,...Object.fromEntries(stringSets.map(key => [key,[...account[key]]])),unlockedSlots:[...account.unlockedSlots]}}}) as {save: ProgressionJSON};
    return envelope.save;
  }
  #mutate(profile: Profile, work: (draft: Profile) => unknown): unknown {
    // These are account/UI transactions, not simulation-frame operations. A
    // detached draft makes capacity refusals atomic, including RNG continuation.
    // Shared immutable content is never cloned. Item payloads cross only this
    // JSON-facing boundary; live custody APIs retain their zero-copy contract.
    const saved = this.#snapshot(profile) as unknown as {account: Record<string,unknown>};
    const account = saved.account;
    for(const key of stringSets) account[key] = new Set(account[key] as string[]);
    account.unlockedSlots = new Set(account.unlockedSlots as number[]);
    const draft = {account:account as unknown as Account,random:Random.restore(profile.random.snapshot())};
    // A reply is part of the transaction: an oversized result must not commit
    // ownership and then look like an ordinary refusal to its caller.
    const result = jsonCopy(work(draft)), checked = this.#snapshot(draft) as unknown as {account: unknown};
    integer(draft.random.draws); this.#account(checked.account);
    profile.account = draft.account; profile.random = draft.random;
    return result;
  }
  /** Accept plain JSON values. Invalid commands return a refusal before mutation;
   * unexpected execution failures throw and the embedding host must stop/reload. */
  command(input: unknown): unknown {
    try {return jsonCopy(this.#command(jsonCopy(input)));}
    catch (error) {if(error instanceof Invalid) return refuse(error.message); throw error;}
  }
  #command(request: unknown): unknown {
    record(request); integer(request.profile,0,0xffffffff); text(request.op);
    const id = request.profile, profile = this.#profiles.get(id);
    if (request.op === 'open' || request.op === 'restore') {
      fields(request,request.op === 'open' ? ['op','profile','seed','account'] : ['op','profile','save']);
      if(profile) return refuse('already-open'); if(this.#profiles.size >= this.#maxProfiles) return refuse('profile-limit');
      let next: Profile;
      if(request.op === 'open') {integer(request.seed,0,0xffffffff); next = {account:request.account === undefined ? this.#empty() : this.#account(request.account),random:new Random(request.seed)};}
      else {
        const save = request.save; fields(save,['schemaVersion','capability','content','random','account']);
        requireValue(save.schemaVersion === 1 && save.capability === 'progression-session/v1','unsupported-save');
        requireValue(JSON.stringify(save.content) === JSON.stringify(this.#identity),'content-mismatch');
        fields(save.random,['algorithm','state','draws']); requireValue(save.random.algorithm === 'mulberry32/v1','unsupported-random');
        integer(save.random.state,0,0xffffffff); integer(save.random.draws);
        next = {account:this.#account(save.account),random:Random.restore({algorithm:'mulberry32/v1',state:save.random.state,draws:save.random.draws})};
      }
      this.#snapshot(next); this.#profiles.set(id,next); return {ok:true};
    }
    if(!profile) return refuse('not-open');
    const a = profile.account, sdk = this.#sdk;
    switch(request.op) {
      case 'close': fields(request,['op','profile']); this.#profiles.delete(id); return {ok:true};
      case 'save': fields(request,['op','profile']); return {ok:true,save:this.#snapshot(profile)};
      case 'observe': {
        fields(request,['op','profile','level','credits','ledger','roster']); integer(request.level); integer(request.credits);
        const ledger = numbers(request.ledger), roster = this.#roster(request.roster);
        return this.#mutate(profile, draft => {
          draft.account.level = request.level as number; draft.account.credits = request.credits as number;
          draft.account.ledger = ledger; draft.account.roster = roster; return {ok:true};
        });
      }
      case 'relics': {
        fields(request,['op','profile','state']); const state = this.#relicState(request.state);
        return this.#mutate(profile,draft => {draft.account.reliquary = state; return {ok:true};});
      }
      case 'settle': fields(request,['op','profile']); return this.#mutate(profile,draft => ({ok:true,claimed:sdk.settleClassUnlocks(draft.account).map(row => row.id)}));
      case 'catalogue': {
        fields(request,['op','profile','offset','limit']); integer(request.offset); integer(request.limit,1,64);
        const rows = sdk.allUnlockables(a);
        return {ok:true,total:rows.length,rows:rows.slice(request.offset,request.offset+request.limit).map(row => ({
          id:row.id,kind:row.kind,label:row.label,description:row.description,cost:row.cost,
          owned:sdk.isUnlockOwned(a,row),visible:sdk.isUnlockVisible(a,row),remaining:sdk.remainingCost(a,row),
          invested:sdk.investedToward(a,row),lines:sdk.sealedGateLines(a,row),
          ...(row.kind === 'class' ? {progress:sdk.classUnlockProgress(a,row),rumor:sdk.classRumorRead(a,row)} : {}),
        }))};
      }
      case 'buy': case 'invest': case 'acknowledge': {
        fields(request,request.op === 'invest' ? ['op','profile','id','amount'] : ['op','profile','id']); text(request.id);
        if(request.op === 'invest') integer(request.amount);
        const row = sdk.allUnlockables(a).find(row => row.id === request.id); if(!row) return refuse('unknown-unlock');
        return this.#mutate(profile,draft => {
          const account = draft.account, before = account.credits;
          const result = request.op === 'buy' ? sdk.applyUnlock(account,row,() => draft.random.next())
            : request.op === 'invest' ? sdk.investUnlock(account,row,request.amount as number,() => draft.random.next()) : sdk.acknowledgeClassUnlock(account,row);
          return {ok:true,result,spent:before-account.credits,credits:account.credits,draws:draft.random.draws,
            ...(row.kind === 'memory' ? {receipt:account.memoryReceipts[row.payload.memoryUnlockId] ?? null} : {})};
        });
      }
      default: return refuse('unknown-operation');
    }
  }
}
