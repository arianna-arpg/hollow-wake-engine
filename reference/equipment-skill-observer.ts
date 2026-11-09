// Observe original objects without importing any SDK policy or invoking saves.
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
export function equipmentSkillObserver() {
  const worlds: any[] = [], rows: any[] = [], identities = new WeakMap<object, number>();
  let nextIdentity = 1;
  const identity = (object: any) => {
    if (!object) return null;
    if (!identities.has(object)) identities.set(object, nextIdentity++);
    return identities.get(object);
  };
  const json = (value: any) => JSON.parse(JSON.stringify(value));
  const socket = (s: any) => s ? {id: s.def.id, level: s.level, rolled: s.rolled, forwardScale: s.forwardScale} : null;
  const instance = (s: any) => ({identity: identity(s), id: s.def.id, level: s.level,
    bonusLevels: s.bonusLevels, sockets: s.sockets.map(socket), treeNodes: s.treeNodes,
    grafts: s.grafts?.map(socket), grantedBy: s.grantedBy, grantedHostUid: s.grantedHostUid, relicSource: s.relicSource});
  function observe(w: any) {
    const seat = w.localSeat, p = seat.actor, meta = seat.meta;
    return {time: w.time, known: [...meta.knownSkills].map(([id, s]: any) => [id, instance(s)]),
      granted: seat.grantedInsts ? [...seat.grantedInsts].map(([id, s]: any) => [id, instance(s)]) : null,
      bar: p.skills.map(identity),
      grantRows: seat.grantedSkills?.map((r: any) => ({id: r.def.id, level: r.level, instance: identity(r.inst),
        source: r.source, hostUid: r.hostUid, slot: r.slot})) ?? null,
      wornGrafts: seat.wornGrafts?.map((r: any) => ({slot: r.slot, id: r.def.id, level: r.level, skillId: r.skillId, state: r.state})) ?? null,
      equipped: meta.equipped, items: meta.items, containers: meta.containers,
      attributes: p.attributeValues, sources: p.sheet.sourceNames().map((name: string) => [name, p.sheet.getSourceMods(name)]),
      resources: {life: p.life, mana: p.mana}, cooldowns: [...p.cooldowns], useLock: p.useLock,
      cast: p.casting ? {identity: identity(p.casting), instance: identity(p.casting.inst), mode: p.casting.mode,
        elapsed: p.casting.elapsed, total: p.casting.total, paidCost: p.casting.paidCost} : null,
      auras: [...p.activeAuras].map(([id, value]: any) => [id, identity(value.inst)]),
      summons: [...p.summonToggles].map(([id, value]: any) => [id, identity(value.inst)])};
  }
  return {
    track<T>(world: T): T {worlds.push(world); return world;},
    check(name: string, passed: boolean, detail: string) {
      rows.push(json({name, passed, detail, worlds: worlds.map(observe)}));
    },
    finish(file: string, failed: number) {
      assert.equal(failed, 0, 'An unchanged original-game assertion failed');
      assert(rows.every(r => r.passed));
      writeFileSync(file, JSON.stringify({schemaVersion: 1,
        scope: 'Original legend and worn-support probes with identity, saved-item and derived-state observations; not complete effect or callback-failure coverage',
        worlds: worlds.length, rows}) + '\n', {flag: 'wx'});
    }
  };
}
