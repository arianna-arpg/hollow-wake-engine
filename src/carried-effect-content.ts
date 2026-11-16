// Pinned carried definitions and visual records. No mutable registry.
import type {CombatPoint as Vec2} from './combat-geometry.js';
type SkillTag=string;type OrbPaint=unknown;
export type SatelliteEmission = {
    interval: number;
    range: number;
    windup?: number;
    target?: 'nearest' | 'farthest';
} & ({
    mode: 'lob';
    flight: number;
    arc: number;
    flash: number;
} | {
    mode: 'projectile';
});
export interface SatelliteDef {
    id: string;
    name: string;
    description: string;
    skill: string;
    tags: SkillTag[];
    orbit: number;
    radius: number;
    turnSpeed: number;
    armTime: number;
    rehit?: number;
    projectileReflect?: number;
    sourcePayload?: boolean;
    emit?: SatelliteEmission;
    orbPaint?: OrbPaint;
    color: string;
    core: string;
}
export interface AuroraDef {
    id: string;
    name: string;
    description: string;
    skill: string;
    tags: SkillTag[];
    recharge: number;
    cascade: number;
    ready: number;
    range: number;
    orbit: number;
    ringSpacing: number;
    perRing: number;
    turnSpeed: number;
    color: string;
    orbPaint: OrbPaint;
}
export interface GuardianDef {
    id: string;
    name: string;
    description: string;
    recharge: number;
    reach: number;
    flash: number;
    color: string;
    moteRadius: number;
    moteOffset: number;
    moteSpread: number;
}
export interface CreeperDef {
    id: string;
    name: string;
    description: string;
    skill: string;
    tags: SkillTag[];
    bodyRadius: number;
    speed: number;
    returnSpeed: number;
    acquire: number;
    leash: number;
    home: number;
    wander: number;
    wanderMin: number;
    wanderMax: number;
    arm: number;
    windup: number;
    recovery: number;
    flash: number;
    recall: number;
    trailSpacing: number;
    trailLife: number;
    color: string;
    soil: string;
}
export interface SatelliteFlightVisual {
    owner: number;
    family: string;
    slot: number;
    tier: number;
    from: Vec2;
    to: Vec2;
    radius: number;
    arc: number;
    phase: 'flight' | 'impact';
    progress: number;
}
export interface SatelliteVisual {
    owner: number;
    family: string;
    slot: number;
    x: number;
    y: number;
    cx: number;
    cy: number;
    orbit: number;
    radius: number;
    angle: number;
    tier: number;
    armed: boolean;
    progress: number;
    blocked: boolean;
    aimX?: number;
    aimY?: number;
    aimProgress?: number;
}
export interface AuroraVisual {
    owner: number;
    family: string;
    slot: number;
    tier: number;
    x: number;
    y: number;
    radius: number;
    charge: number;
    releasing: boolean;
}
export interface GuardianVisual {
    owner: number;
    family: string;
    slot: number;
    tier: number;
    x: number;
    y: number;
    radius: number;
    angle: number;
    progress: number;
    kind: 'reserve' | 'catch';
}
export interface CreeperVisual {
    owner: number;
    family: string;
    slot: number;
    tier: number;
    x: number;
    y: number;
    angle: number;
    radius: number;
    phase: 'arm' | 'roam' | 'hunt' | 'return' | 'windup' | 'strike';
    progress: number;
    strikeRadius: number;
    trail: {
        x: number;
        y: number;
        life: number;
    }[];
}
