/** Content is plain serializable data. Host engine objects never enter these contracts. */
export type ModifierKind = 'flat' | 'increased' | 'more' | 'override' | 'link';
export interface Modifier {
  stat: string;
  kind: ModifierKind;
  value: number;
  fromStat?: string;
  tags?: string[];
  when?: string;
  gauge?: string;
  gaugeAt?: number;
}
export interface StatDefinition {
  base: number;
  min?: number;
  max?: number;
  label?: string;
  percent?: boolean;
  desc?: string;
}
export interface StatTrade { from: string; to: string; rateStat: string; forgoStat: string }
export interface AttributeDefinition { perPoint: Modifier[]; label?: string }
export interface ClassDefinition {
  id: string;
  name: string;
  attributes: Record<string, number>;
  startNode: string;
  mods: Modifier[];
  levelMods: Modifier[];
}
export interface PassiveDefinition {
  id: string;
  name: string;
  attributes?: Record<string, number>;
  attributesPct?: Record<string, number>;
  mods?: Modifier[];
  links?: string[];
  kind?: string;
}
export interface ItemDefinition {
  id: string;
  name: string;
  category: string;
  slots: string[];
  mods: Modifier[];
}
export interface SkillNode {
  id: string;
  name: string;
  mods?: Modifier[];
  links?: string[];
  excludes?: string[];
  /** Authored metadata retained for migration. This capability allows only the first rank. */
  ranks?: number;
  empowermentPassive?: boolean;
}
export interface SkillDefinition {
  id: string;
  name: string;
  tags: string[];
  castTag: 'cast:instant' | 'cast:timed';
  manaCost: number;
  lifeCost?: number;
  cooldown: number;
  useTime: number;
  addedEffectiveness?: number;
  baseDamage: Record<string, [number, number]>;
  requirements?: Record<string, number>;
  innateMods?: Modifier[];
  perLevel: Modifier[];
  treeLevel: number;
  nodes: Record<string, SkillNode>;
}
export interface SupportDefinition {
  id: string;
  name: string;
  requiresTags?: string[];
  excludeTags?: string[];
  mods: Modifier[];
  perLevel?: Modifier[];
}
export interface ContentPack {
  schemaVersion: 1;
  id: string;
  capability: 'resolved-spell-hit/v1';
  stats: Record<string, StatDefinition>;
  trades: StatTrade[];
  attributes: Record<string, AttributeDefinition>;
  damageTypes: string[];
  defense: { armorK: number; resistanceHardCap: number; resistanceFloor: number };
  classes: Record<string, ClassDefinition>;
  passives: Record<string, PassiveDefinition>;
  items: Record<string, ItemDefinition>;
  skills: Record<string, SkillDefinition>;
  supports: Record<string, SupportDefinition>;
}
export interface SupportSelection { id: string; level: number }
export interface SkillSelection {
  id: string;
  level: number;
  sockets: number;
  treePoints: number;
  supports?: SupportSelection[];
  nodes?: string[];
}
export interface CharacterBuild {
  classId: string;
  passivePoints: number;
  allocated?: string[];
  equipped?: Record<string, string>;
  conditions?: string[];
  gauges?: [string, number][];
}
export interface RandomState { algorithm: 'mulberry32/v1'; state: number; draws: number }
export interface TargetSpec { life: number; mods?: Modifier[] }
export interface HitReceipt {
  outgoing: Record<string, number>;
  crit: boolean;
  rollT?: number;
  damage: number;
  life: number;
  randomDraws: number;
}
