import { Content, type ConfiguredSkill } from './content.js';
import { StatSheet } from './stats.js';
import type { CharacterBuild, Modifier } from './types.js';
import { copy, finite, freeze, integer, known } from './validation.js';

export class Character {
  private build: CharacterBuild;
  private currentSheet!: StatSheet;
  private currentAttributes: Record<string, number> = {};
  private conditions: string[] = [];
  private gauges: [string, number][] = [];
  get sheet(): StatSheet { return this.currentSheet; }
  get attributes(): Readonly<Record<string, number>> { return this.currentAttributes; }
  constructor(readonly content: Content, initial: CharacterBuild) {
    this.build = copy(initial);
    this.conditions = copy(initial.conditions ?? []);
    this.gauges = copy(initial.gauges ?? []);
    this.rebuild();
  }
  snapshot(): CharacterBuild {
    return copy({
      ...this.build,
      ...(this.conditions.length || this.build.conditions ? { conditions: this.conditions } : {}),
      ...(this.gauges.length || this.build.gauges ? { gauges: this.gauges } : {}),
    });
  }
  get pointsRemaining(): number { return this.build.passivePoints - (this.build.allocated?.length ?? 0); }
  equip(itemId: string, slot: string): void {
    const item = known(this.content.pack.items, itemId, 'item');
    if (!item.slots.includes(slot)) throw new Error(`Item ${itemId} does not fit ${slot}`);
    const equipped = { ...this.build.equipped };
    if (Object.entries(equipped).some(([other, id]) => id === itemId && other !== slot)) throw new Error('Item instance is already equipped');
    equipped[slot] = itemId;
    this.replace({ ...this.build, equipped });
  }
  unequip(slot: string): void {
    const equipped = { ...this.build.equipped };
    delete equipped[slot];
    this.replace({ ...this.build, equipped });
  }
  allocate(id: string): void {
    if (this.build.allocated?.includes(id)) throw new Error('Passive is already allocated');
    this.replace({ ...this.build, allocated: [...this.build.allocated ?? [], id] });
  }
  refund(id: string): void {
    if (!this.build.allocated?.includes(id)) throw new Error('Passive is not allocated');
    this.replace({ ...this.build, allocated: this.build.allocated.filter(other => other !== id) });
  }
  setConditions(values: string[]): void { this.conditions = [...values]; this.sheet.setConditions(values); }
  setGauges(values: [string, number][]): void { this.sheet.setGauges(values); this.gauges = copy(values); }
  validateSkill(skill: ConfiguredSkill): void {
    if (skill.content !== this.content) throw new Error('Skill belongs to different content');
    for (const [id, required] of Object.entries(skill.definition.requirements ?? {})) {
      if ((this.attributes[id] ?? 0) < required) throw new Error(`Skill requires ${required} ${id}`);
    }
  }
  private replace(next: CharacterBuild): void {
    const before = this.build;
    this.build = copy(next);
    try { this.rebuild(); } catch (error) { this.build = before; throw error; }
  }
  private rebuild(): void {
    const pack = this.content.pack;
    const def = known(pack.classes, this.build.classId, 'class');
    integer(this.build.passivePoints, 0, 'passive points');
    const picked = this.build.allocated ?? [];
    if (new Set(picked).size !== picked.length || picked.includes(def.startNode)) throw new Error('Duplicate or already-owned passive');
    if (picked.length > this.build.passivePoints) throw new Error('Not enough passive points');
    const all = [def.startNode, ...picked];
    const connected = new Set([def.startNode]);
    // Validate the full allocation graph, including snapshots supplied by another host.
    for (let changed = true; changed;) {
      changed = false;
      for (const id of all) {
        const node = known(pack.passives, id, 'passive');
        if (connected.has(id)) continue;
        if ([...connected].some(other => node.links?.includes(other) || pack.passives[other].links?.includes(id))) {
          connected.add(id); changed = true;
        }
      }
    }
    if (connected.size !== all.length) throw new Error('Passive allocation is disconnected');
    const attrs = Object.fromEntries(Object.keys(pack.attributes).map(id => [id, def.attributes[id] ?? 0]));
    const pct: Record<string, number> = {};
    const passiveMods: Modifier[] = [];
    for (const id of all) {
      const node = pack.passives[id];
      for (const [attr, value] of Object.entries(node.attributes ?? {})) attrs[attr] = (attrs[attr] ?? 0) + finite(value, attr);
      for (const [attr, value] of Object.entries(node.attributesPct ?? {})) pct[attr] = (pct[attr] ?? 0) + finite(value, attr);
      passiveMods.push(...node.mods ?? []);
    }
    const gear: { slot: string; mods: Modifier[] }[] = [];
    const seenItems = new Set<string>();
    for (const [slot, id] of Object.entries(this.build.equipped ?? {})) {
      const item = known(pack.items, id, 'item');
      if (!item.slots.includes(slot) || seenItems.has(id)) throw new Error('Invalid equipped item');
      seenItems.add(id);
      const mods: Modifier[] = [];
      for (const mod of item.mods) {
        if (Object.hasOwn(pack.attributes, mod.stat)) {
          if (mod.kind === 'flat') attrs[mod.stat] += mod.value;
          else if (mod.kind === 'increased') pct[mod.stat] = (pct[mod.stat] ?? 0) + mod.value;
          else throw new Error('Attribute modifiers require flat or increased');
        } else mods.push(mod);
      }
      gear.push({ slot, mods });
    }
    const attrMods: Modifier[] = [];
    for (const [id, attr] of Object.entries(pack.attributes)) {
      attrs[id] = Math.max(0, Math.round(attrs[id] * (1 + (pct[id] ?? 0))));
      if (attrs[id]) for (const mod of attr.perPoint) attrMods.push({ ...mod, value: mod.value * attrs[id] });
    }
    const sheet = new StatSheet(this.content.rules);
    sheet.setSource('attributes', attrMods);
    sheet.setSource('class', def.mods);
    sheet.setSource('passives', passiveMods);
    sheet.setSource('level', def.levelMods);
    for (const row of gear) sheet.setSource(`gear:${row.slot}`, row.mods);
    sheet.setConditions(this.conditions);
    sheet.setGauges(this.gauges);
    this.currentAttributes = freeze(attrs);
    this.currentSheet = sheet;
  }
}
