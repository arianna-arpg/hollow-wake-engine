/** Pinned original combat geometry. Inputs are admitted finite combat facts. */
export interface CombatPoint {x:number;y:number}
type Vec2=CombatPoint;
type AoeShape=number;
export interface BandSwingGeo {halfWidth:number;halfDepth:number;standoff:number}
export const AOE_SHAPE=Object.freeze({circle:0,square:1,triangle:2,crescent:3,sector:4,band:5});
export const AOE_BAND_DEPTH=.4;
const CRESCENT_INNER=.55,CRESCENT_ARC=110*Math.PI/180;
export function dist(a: Vec2, b: Vec2): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}
export function angleTo(from: Vec2, to: Vec2): number {
    return Math.atan2(to.y - from.y, to.x - from.x);
}
export function angleDiff(a: number, b: number): number {
    let d = b - a;
    while (d > Math.PI)
        d -= Math.PI * 2;
    while (d < -Math.PI)
        d += Math.PI * 2;
    return d;
}
export function bandSwingGeo(reach: number, arcRad: number): BandSwingGeo {
    const halfWidth = Math.max(1, reach * Math.sin(Math.min(Math.PI, Math.max(0, arcRad)) / 2));
    const halfDepth = halfWidth * AOE_BAND_DEPTH;
    return { halfWidth, halfDepth, standoff: reach - halfDepth };
}
export function inAoe(center: Vec2, radius: number, shape: AoeShape, facing: number, target: Vec2, targetRadius: number, arcRad?: number): boolean {
    if (shape === AOE_SHAPE.band) {
        const dx = target.x - center.x, dy = target.y - center.y;
        const fx = Math.cos(facing), fy = Math.sin(facing);
        const along = dx * fx + dy * fy;
        const across = dy * fx - dx * fy;
        return Math.abs(across) <= radius + targetRadius
            && Math.abs(along) <= radius * AOE_BAND_DEPTH + targetRadius;
    }
    if (shape >= 3) {
        const dd = dist(center, target);
        const inner = shape >= 4 ? 0 : radius * CRESCENT_INNER;
        if (dd - targetRadius > radius || dd + targetRadius < inner)
            return false;
        const half = (arcRad ?? CRESCENT_ARC) / 2 + Math.atan2(targetRadius, Math.max(dd, 1));
        return Math.abs(angleDiff(facing, angleTo(center, target))) <= half;
    }
    if (shape >= 2) {
        const R = radius * 1.25 + targetRadius;
        const vx: number[] = [], vy: number[] = [];
        for (let i = 0; i < 3; i++) {
            const a = facing + i * (Math.PI * 2 / 3);
            vx.push(center.x + Math.cos(a) * R);
            vy.push(center.y + Math.sin(a) * R);
        }
        const sign = (ax: number, ay: number, bx: number, by: number): number => (bx - ax) * (target.y - ay) - (by - ay) * (target.x - ax);
        const d1 = sign(vx[0], vy[0], vx[1], vy[1]);
        const d2 = sign(vx[1], vy[1], vx[2], vy[2]);
        const d3 = sign(vx[2], vy[2], vx[0], vy[0]);
        const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
        const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
        return !(hasNeg && hasPos);
    }
    if (shape >= 1) {
        const half = radius + targetRadius;
        return Math.abs(target.x - center.x) <= half && Math.abs(target.y - center.y) <= half;
    }
    return dist(center, target) - targetRadius <= radius;
}
export function zoneHoleSpares(z: {
    pos: Vec2;
    radius: number;
    shape?: AoeShape;
    facing?: number;
    edge?: number;
}, p: Vec2, pr: number): boolean {
    if (!z.edge)
        return false;
    return inAoe(z.pos, z.radius * z.edge, z.shape ?? 0, z.facing ?? 0, p, -pr);
}
