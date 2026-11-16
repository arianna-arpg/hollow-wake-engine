import {readList,type LiveList} from './live-list.js';
export interface CorpsePoint {x: number; y: number}
export interface CorpseBody {
  pos: CorpsePoint;
  defId: string;
  level: number;
  tier?: number;
  maxLife: number;
  remaining: number;
}
export interface CorpseCaster<Tags, Modifier> {
  readonly tier: number;
  readonly sheet: {get(stat: string, tags: Tags, modifiers: readonly Modifier[]): number};
}
export interface CorpseEffectRules {
  readonly max: number;
  readonly duration: number;
  readonly mint: {readonly spread: number; readonly life: number; readonly lifePerLevel: number};
  readonly batch: {readonly aoePerExtra: number};
}
export interface CorpseEffectPorts<A> {
  monster(id: string): boolean;
  level(): number;
  random(): number;
  clamp(point: CorpsePoint, radius: number, mover?: A): CorpsePoint;
  layerAt(point: CorpsePoint): number;
  created(at: CorpsePoint, color: string): void;
  gathered(at: CorpsePoint, color: string): void;
  empty(actor: A, skillId: string): void;
}

/** Corpse spell rules over a host-owned combat roster. Ground projection and
 * current encounter level are explicit facts; no geography generator, loot
 * table, quest book or persistence service is imported. */
export class CorpseEffects<A extends CorpseCaster<Tags, Modifier>, Tags, Modifier> {
  constructor(readonly rules: CorpseEffectRules, private readonly corpseOwner: LiveList<CorpseBody>, readonly ports: CorpseEffectPorts<A>) {}
  get corpses():CorpseBody[]{return readList(this.corpseOwner);}
  spawn(caster: A, aim: CorpsePoint, monsterId: string, count: number, tags: Tags, extra: readonly Modifier[], color: string): void {
    if (!this.ports.monster(monsterId)) return;
    const spread = this.rules.mint.spread;
    const total = count + Math.max(0, Math.round(caster.sheet.get('corpseBatch', tags, extra)));
    for (let i = 0; i < total; i++) {
      if (this.corpses.length >= this.rules.max) this.corpses.shift();
      this.corpses.push({
        pos: this.ports.clamp({x: aim.x + (-spread + this.ports.random() * (spread * 2)), y: aim.y + (-spread + this.ports.random() * (spread * 2))}, 10, caster),
        defId: monsterId,
        level: this.ports.level(),
        tier: caster.tier,
        maxLife: this.rules.mint.life + this.ports.level() * this.rules.mint.lifePerLevel,
        remaining: this.rules.duration,
      });
    }
    this.ports.created({x: aim.x, y: aim.y}, color);
  }
  gather(caster: A, aim: CorpsePoint, skillId: string, radius: number, areaScale: number, tags: Tags, extra: readonly Modifier[], color: string): void {
    const reach = radius * areaScale * (1 + this.rules.batch.aoePerExtra * Math.max(0, Math.round(caster.sheet.get('corpseBatch', tags, extra))));
    let count = 0;
    for (const corpse of this.corpses) {
      if (Math.hypot(aim.x - corpse.pos.x, aim.y - corpse.pos.y) > reach) continue;
      if ((corpse.tier ?? this.ports.layerAt(corpse.pos)) !== caster.tier) continue;
      const index = count++, ring = index === 0 ? 0 : 22 + 8 * Math.floor(index / 3);
      corpse.pos = this.ports.clamp({x: aim.x + Math.cos(index * 2.1) * ring, y: aim.y + Math.sin(index * 2.1) * ring}, 8);
    }
    if (count) this.ports.gathered({x: aim.x, y: aim.y}, color);
    else this.ports.empty(caster, skillId);
  }
}
