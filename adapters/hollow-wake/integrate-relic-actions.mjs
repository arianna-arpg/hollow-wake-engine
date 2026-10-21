import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
export const relicActionWorld='src/engine/world.ts',relicActionBridge='src/engine/relicActionAdapter.ts';
const lf=s=>s.replaceAll('\r\n','\n');
function methods(source){const ast=ts.createSourceFile(relicActionWorld,source,ts.ScriptTarget.Latest,true),world=ast.statements.find(s=>ts.isClassDeclaration(s)&&s.name?.text==='World');assert(world);const counts=new Map();return {ast,counts,methods:new Map(world.members.filter(ts.isMethodDeclaration).map(m=>{const name=m.name.getText(ast);counts.set(name,(counts.get(name)??0)+1);return [name,{start:m.getStart(ast),end:m.end,text:source.slice(m.getStart(ast),m.end)}];}))};}
export function renderRelicActions(source,reference){
 const current=lf(source),original=lf(reference);assert(!current.includes('sdkRelicActions'),'Relic action bridge already applied');const parsed=methods(current),baseline=methods(original),edits=[];
 const world=parsed.ast.statements.find(s=>ts.isClassDeclaration(s)&&s.name?.text==='World');
 for(const name of ['sdkRelicAccess','sdkRelicContext','sdkRelicAccessCache'])assert(!world.members.some(member=>member.name?.getText(parsed.ast)===name),`Relic helper name already exists: ${name}`);
 const replacements={
  canManageAccountRelics:`private readonly sdkRelicAccessCache = new WeakMap<Seat, RelicAccess>();
  private sdkRelicAccess(seat: Seat): RelicAccess {
    let access = this.sdkRelicAccessCache.get(seat);
    if (!access) {
      const world = this;
      access = { get ownHosted() { return seat === world.localSeat && !world.clientActionHook; },
        get featureOwned() { return world.account.features.has(FEATURE.RELIQUARY); },
        get fallen() { return seat.actor.dead || seat.actor.downed; },
        casting: () => !!world.seatHero(seat).casting, oracleReach: () => world.stationReach('oracle', seat),
        foeNear: () => world.pressingFoeNear(seat.actor.pos, seat.actor.tier),
        get elapsedSinceCombat() { return world.time - world.lastCombatAt; },
        get calmSeconds() { return RELIQUARY_CFG.toggleCalmSeconds; } };
      this.sdkRelicAccessCache.set(seat, access);
    }
    return access;
  }
  private sdkRelicContext(seat: Seat): RelicActionContext<ItemInstance> {
    const world = this;
    return { state: this.account.reliquary, carry: seat.meta,
      scope: seat.meta.relicScope ?? (seat.meta.charId || 'run:' + this.manifest.seed), access: this.sdkRelicAccess(seat),
      get definition() { return CONTAINERS.reliquary; }, get board() { return containerBoard(CONTAINERS.reliquary); },
      get bagBoard() { return bagBoard(); }, get level() { return world.seatHero(seat).level; }, lesson: this.reliquaryLesson() };
  }
  canManageAccountRelics(seat: Seat): boolean { return relicCanManage(this.sdkRelicAccess(seat)); }`,
  reliquaryRefusal:'reliquaryRefusal(seat: Seat): string | null { return relicEquipmentRefusal(this.sdkRelicAccess(seat)); }',
  reliquaryToggle:`reliquaryToggle(seat: Seat, enabled: boolean): void {
    const result = sdkRelicActions.toggle(this.account.reliquary, this.sdkRelicAccess(seat), enabled);
    if (result.refusal) this.failNote(seat.actor, result.refusal.key, result.refusal.reason);
    if (!result.changed) return;
    if (!enabled) for (const body of this.actors) {
      if (!body.dead && body.owner === this.seatHero(seat) && body.summonInst?.relicSource) this.kill(body, true);
    }
    const hero = this.seatHero(seat), life = hero.life / Math.max(1, hero.maxLife());
    this.recalcSeat(seat); hero.life = hero.maxLife() * life; this.persistAccountRelics(seat);
  }`,
  withdrawRelic:`withdrawRelic(seat: Seat, uid: number, x?: number, y?: number): void {
    const result = sdkRelicActions.withdraw(this.sdkRelicContext(seat), uid, x, y);
    if (result.refusal) this.failNote(seat.actor, result.refusal.key, result.refusal.reason);
    if (result.changed) { this.recalcSeat(seat); this.persistAccountRelics(seat); }
  }`,
  restoreAccountRelics:'restoreAccountRelics(seat: Seat): void { sdkRelicActions.reconcile(this.sdkRelicContext(seat)); }',
  persistAccountRelics:`private persistAccountRelics(seat: Seat): void {
    if (!sdkRelicActions.sync(this.sdkRelicContext(seat))) return;
    this.accountDirty = true; saveAccount(this.account); this.markMetaDirty(seat);
  }`,
  oracleAttune:`oracleAttune(seat: Seat): void {
    if (sdkRelicActions.attune(this.sdkRelicAccess(seat), this.account.ledger, RELIQUARY_CFG.attunement)) this.persistAccountRelics(seat);
  }`,
  personalStash:`personalStash(seat: Seat, uid: number, operation: 'store' | 'take' | 'move', x?: number, y?: number): void {
    const definition = STASH_DEFS[this.seatModeDef(seat).stash ?? ''];
    const result = sdkRelicActions.personal(seat.meta, this.sdkRelicAccess(seat), definition, bagBoard(), uid, operation, x, y);
    if (result.refusal) this.failNote(seat.actor, result.refusal.key, result.refusal.reason);
    if (result.changed) this.markMetaDirty(seat);
  }`,
  relicStashMove:`relicStashMove(seat: Seat, uid: number, target?: StashCell): void {
    const result = sdkRelicActions.store(this.sdkRelicContext(seat), uid, target);
    if (result.refusal) this.failNote(seat.actor, result.refusal.key, result.refusal.reason);
    if (result.changed) { this.recalcSeat(seat); this.persistAccountRelics(seat); }
  }`,
  oracleRelic:`oracleRelic(seat: Seat, uid: number, operation: 'store' | 'equip' | 'unseat' | 'release' | 'withdraw'): void {
    if (operation === 'unseat' || operation === 'withdraw') { this.withdrawRelic(seat, uid); return; }
    if (operation === 'equip') {
      if (this.canManageAccountRelics(seat) && this.account.features.has(FEATURE.RELIQUARY)) this.seatAccountRelic(seat, uid);
      return;
    }
    if (operation === 'release') {
      if (sdkRelicActions.release(this.sdkRelicContext(seat), uid).changed) this.persistAccountRelics(seat);
      return;
    }
    this.relicStashMove(seat, uid);
  }`,
  seatAccountRelic:`private seatAccountRelic(seat: Seat, uid: number, x?: number, y?: number): void {
    const result = sdkRelicActions.place(this.sdkRelicContext(seat), uid, x, y);
    if (result.refusal) this.failNote(seat.actor, result.refusal.key, result.refusal.reason);
    if (!result.changed) return;
    if (result.lessonCompleted) this.account.ledger[RELIQUARY_LESSON] = 1;
    this.recalcSeat(seat); this.persistAccountRelics(seat);
  }`,
 };
 for(const [name,text] of Object.entries(replacements)){const node=parsed.methods.get(name),expected=baseline.methods.get(name);assert(node&&expected);assert.equal(parsed.counts.get(name),1,`Ambiguous action method: ${name}`);assert.equal(node.text,expected.text,`Unreviewed relic action method: ${name}`);edits.push({...node,text});}
 for(const [from,names] of [['./accountReliquary',['accountRelicBoard','bankRelic','planRelicStorage','reconcileRelicStash']],['./stash',['emptyStash','personalStashEntries','planStashMove']]]){
  const imports=parsed.ast.statements.filter(n=>ts.isImportDeclaration(n)&&n.moduleSpecifier.text===from);assert.equal(imports.length,1);const node=imports[0],clause=node.importClause.namedBindings;assert(ts.isNamedImports(clause));
  const kept=clause.elements.filter(n=>!names.includes(n.name.text)).map(n=>n.getText(parsed.ast));assert.equal(clause.elements.length-kept.length,names.length);
  edits.push({start:node.getStart(parsed.ast),end:node.end,text:`import { ${kept.join(', ')} } from '${from}';`});
 }
 const end=parsed.ast.statements.filter(ts.isImportDeclaration).at(-1).end;edits.push({start:end,end,text:"\nimport { sdkRelicActions, relicCanManage, relicEquipmentRefusal, type RelicAccess, type RelicActionContext } from './relicActionAdapter';"});
 let result=current;for(const e of edits.sort((a,b)=>b.start-a.start))result=result.slice(0,e.start)+e.text+result.slice(e.end);return result;
}
export function integrateRelicActions(game,write=true){
 const lock=JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))),bytes=fs.readFileSync(path.join(root,'.reference',relicActionWorld));assert.equal(sha256(bytes),lock.files[relicActionWorld]);
 assert(!fs.existsSync(path.join(game,relicActionBridge)),'Refusing to overwrite relic action host binding');
 const current=fs.readFileSync(path.join(game,relicActionWorld),'utf8'),result=renderRelicActions(current,bytes.toString());
 if(write){fs.writeFileSync(path.join(game,relicActionWorld),result.replaceAll('\n',current.includes('\r\n')?'\r\n':'\n'));fs.copyFileSync(path.join(root,'adapters/hollow-wake/relicActionAdapter.ts'),path.join(game,relicActionBridge));}
 return {files:[relicActionWorld,relicActionBridge]};
}
