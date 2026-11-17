// Original authored projectile schemas; see projectile-extraction.json.
import type {DamageType} from './damage-pipeline-types.js';import type {SizeEnvelopeSpec} from './combat-fields.js';
export interface TrajectorySpec {
    homing?: number;
    guide?: number;
    erratic?: number;
    spiral?: number;
    orbit?: number;
    spin?: number;
    weave?: number;
    amplitude?: number;
    orbitRadius?: number;
    accel?: number;
    zigzag?: {
        interval: number;
        angleDeg: number;
        onHit?: boolean;
        shed?: number;
    };
    bounce?: number;
    frameBounce?: number;
    recurve?: {
        chance: number;
        decay?: number;
    };
    selectivePierce?: true;
    caromOnHit?: number;
    arcTo?: number;
}
export interface ProjectileDelivery {
    orbPaint?: OrbPaint;
    type: 'projectile';
    speed: number;
    radius: number;
    range: number;
    occlusion?: 'blocked' | 'free';
    pierce?: number;
    count?: CountSpec;
    spreadDeg?: number;
    shape?: ProjectileShape;
    hitForm?: 'visual' | 'circle';
    trajectory?: TrajectorySpec;
    fire?: 'fan' | 'salvo' | 'volley';
    salvoInterval?: number;
    volleySpacing?: number;
    ring?: {
        phaseJitter?: boolean;
    };
    duration?: number;
    origin?: 'caster' | 'cursor';
    originRange?: number;
    trail?: ProjTrailSpec;
    forks?: number;
    returns?: 'origin' | 'caster';
    rehit?: number;
    emit?: {
        skillId: string;
        interval: number;
        pattern?: 'rotating' | 'random' | 'forward';
        inherit?: number;
    };
    shatter?: {
        skillId: string;
        count: number;
        spreadDeg: number;
        inherit?: number;
    };
    explode?: {
        radius: number;
        damageScale?: number;
    };
    plantOnLand?: {
        look?:string;
        duration: number;
        life?: number;
        embed?: EmbedSpec;
    };
    zap?: {
        interval: number;
        radius: number;
        damageScale?: number;
    };
    aura?: {
        radius: number;
        dps: number;
        damageType?: DamageType;
    };
    endZone?: DropZoneSpec & {
        seek?: {
            speed: number;
            range?: number;
        };
    };
    sequel?: SequelSpec;
    catch?: {
        charge: string;
        amount: number;
        max: number;
    };
    catchSpot?: {
        charge: string;
        amount: number;
        max: number;
        duration?: number;
        nearRadius?: number;
        look?: string;
    };
    spreadByAim?: {
        near: number;
        far: number;
        range: number;
    };
    caroms?: {
        anchors: number;
        window: number;
        hang?: {
            triggerRadius?: number;
            duration?: number;
        };
    };
    fissureTrail?: FissureTrailSpec;
}
export type ProjectileShape = 'vortex' | 'circle' | 'square' | 'line' | 'triangle' | 'octagon' | 'bar' | 'arc' | 'wave';
export interface ProjTrailSpec {
    every: number;
    blast?: {
        radius: number;
        damageScale?: number;
    };
    zone?: DropZoneSpec;
}
export interface FissureTrailSpec {
    radius: number;
    linger: number;
    tickInterval?: number;
    damageScale?: number;
    close?: {
        delay: number;
        damageScale: number;
    };
}
export interface DropZoneSpec {
    radius: number;
    duration: number;
    tickInterval?: number;
    damageScale?: number;
    sizeOver?: SizeEnvelopeSpec;
    durationBySpeed?: DurationBySpeedSpec;
}
export interface SequelSpec {
    skillId: string;
    on?: 'hit' | 'expire' | 'any';
    chance?: number;
    damageScale?: number;
}
export interface OrbPaint {
    fill: number;
    rim: number;
    spark?: boolean;
}
export type CountSpec = number | [
    number,
    number
];
export interface EmbedSpec {
    runOver?: 'collect' | 'detonate';
    collect?: {
        charge?: string;
        amount: number;
        max?: number;
        resource?: 'life' | 'mana' | 'es';
    };
    detonateSkillId?: string;
    icd?: number;
    emitInterval?: number;
    beam?: {
        interval: number;
        range?: number;
        damageScale?: number;
        width?: number;
    };
}
export interface DurationBySpeedSpec {
    ref: number;
    exp?: number;
    min?: number;
    max?: number;
}
