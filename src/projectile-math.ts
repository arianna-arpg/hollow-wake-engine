// Original projectile shape and flight math; explicit random input.
import type {CombatPoint as Vec2} from './combat-geometry.js';import type {ProjectileShape} from './projectile-specs.js';
export function spinOffset(spin: number, amp: number, age: number, out: Vec2): Vec2 {
    const r = amp * Math.min(1, spin / 8);
    out.x = Math.cos(spin * age) * r;
    out.y = Math.sin(spin * age) * r;
    return out;
}
export function weaveOffset(weave: number, amp: number, age: number, head: number, out: Vec2): Vec2 {
    const lat = amp * Math.sin(weave * age * 2);
    const lon = amp * 0.5 * Math.sin(weave * age * 4);
    const perp = head + Math.PI / 2;
    out.x = Math.cos(perp) * lat + Math.cos(head) * lon;
    out.y = Math.sin(perp) * lat + Math.sin(head) * lon;
    return out;
}
export function erraticTurn(erratic:number,dt:number,random:()=>number):number{return (-erratic+random()*(erratic*2))*dt*5;}
export const PROJ_FORM_GEO = {
    vortex: { arms: 3, turns: 1.4, spinRate: 9, stroke: 0.1, samples: 24 },
    square: { half: 0.8, tumbleRate: 6 },
    line: { hAlong: 1.8, hAcross: 0.35 },
    octagon: { spinRate: 2 },
    triangle: { base: 0.85 },
    bar: {
        hAlong: 0.3, hAcross: 1.9,
        ghost: { hAlong: 0.225, hAcross: 1.5, back: 0.75, alpha: 0.4 },
    },
    arc: {
        back: 0.6, ring: 1.45, halfWin: 0.42 * Math.PI, stroke: 0.55,
        ghost: { back: 1.1, ring: 1.2, halfWin: 0.38 * Math.PI, stroke: 0.3, alpha: 0.45 },
    },
    wave: { span: 1.9, amp: 0.4, stroke: 0.5, phaseRate: 8 },
} as const;
function boxTouch(ax: number, ac: number, hAlong: number, hAcross: number, cr: number): boolean {
    const qx = Math.max(Math.abs(ax) - hAlong, 0);
    const qy = Math.max(Math.abs(ac) - hAcross, 0);
    return qx * qx + qy * qy <= cr * cr;
}
export function projFormTouches(shape: ProjectileShape, px: number, py: number, dir: number, r: number, age: number, cx: number, cy: number, cr: number): boolean {
    const dx = cx - px, dy = cy - py;
    switch (shape) {
        case 'line': {
            const cos = Math.cos(dir), sin = Math.sin(dir);
            const g = PROJ_FORM_GEO.line;
            return boxTouch(dx * cos + dy * sin, -dx * sin + dy * cos, g.hAlong * r, g.hAcross * r, cr);
        }
        case 'bar': {
            const cos = Math.cos(dir), sin = Math.sin(dir);
            const g = PROJ_FORM_GEO.bar;
            return boxTouch(dx * cos + dy * sin, -dx * sin + dy * cos, g.hAlong * r, g.hAcross * r, cr);
        }
        case 'arc': {
            const g = PROJ_FORM_GEO.arc;
            const cos = Math.cos(dir), sin = Math.sin(dir);
            const lx = dx * cos + dy * sin + g.back * r;
            const ly = -dx * sin + dy * cos;
            const reach = g.stroke * r * 0.5 + cr;
            const vlen = Math.hypot(lx, ly);
            const ang = Math.atan2(ly, lx);
            if (Math.abs(ang) <= g.halfWin) {
                return Math.abs(vlen - g.ring * r) <= reach;
            }
            const capX = Math.cos(g.halfWin) * g.ring * r;
            const capY = Math.sin(g.halfWin) * g.ring * r * (ly >= 0 ? 1 : -1);
            return Math.hypot(lx - capX, ly - capY) <= reach;
        }
        case 'wave': {
            const g = PROJ_FORM_GEO.wave;
            const span = g.span * r, amp = g.amp * r;
            const reach = g.stroke * r * 0.5 + cr;
            const th = dir + Math.PI / 2;
            const cos = Math.cos(th), sin = Math.sin(th);
            const lx = dx * cos + dy * sin;
            const ly = -dx * sin + dy * cos;
            if (Math.abs(lx) > span + reach || Math.abs(ly) > amp + reach)
                return false;
            const phase = age * g.phaseRate;
            const r2 = reach * reach;
            let prevX = -span, prevY = Math.sin((-span / span) * Math.PI * 2 + phase) * amp;
            const step = span / 8;
            for (let wx = -span + step; wx <= span + step / 2; wx += step) {
                const X = Math.min(wx, span);
                const Y = Math.sin((X / span) * Math.PI * 2 + phase) * amp;
                const sx = X - prevX, sy = Y - prevY;
                const t = Math.max(0, Math.min(1, ((lx - prevX) * sx + (ly - prevY) * sy) / (sx * sx + sy * sy)));
                const qx = prevX + sx * t - lx, qy = prevY + sy * t - ly;
                if (qx * qx + qy * qy <= r2)
                    return true;
                prevX = X;
                prevY = Y;
            }
            return false;
        }
        default:
            return dx * dx + dy * dy <= (r + cr) * (r + cr);
    }
}
export function projFormNose(shape: ProjectileShape): number {
    switch (shape) {
        case 'line': return PROJ_FORM_GEO.line.hAlong;
        case 'bar': return PROJ_FORM_GEO.bar.hAlong;
        case 'arc': return PROJ_FORM_GEO.arc.ring - PROJ_FORM_GEO.arc.back + PROJ_FORM_GEO.arc.stroke * 0.5;
        case 'wave': return PROJ_FORM_GEO.wave.amp + PROJ_FORM_GEO.wave.stroke * 0.5;
        default: return 1;
    }
}
export interface ViewRect {
    x: number;
    y: number;
    w: number;
    h: number;
}
export function frameReflect(x: number, y: number, dir: number, r: number, rect: ViewRect, pad = 0): {
    x: number;
    y: number;
    dir: number;
} | null {
    let dx = Math.cos(dir), dy = Math.sin(dir);
    const loX = rect.x + r + pad, hiX = rect.x + rect.w - r - pad;
    const loY = rect.y + r + pad, hiY = rect.y + rect.h - r - pad;
    const midX = (loX + hiX) / 2, midY = (loY + hiY) / 2;
    let nx = x, ny = y, hit = false;
    if (nx < loX) {
        nx = loX <= hiX ? loX : midX;
        if (dx < 0)
            dx = -dx;
        hit = true;
    }
    else if (nx > hiX) {
        nx = loX <= hiX ? hiX : midX;
        if (dx > 0)
            dx = -dx;
        hit = true;
    }
    if (ny < loY) {
        ny = loY <= hiY ? loY : midY;
        if (dy < 0)
            dy = -dy;
        hit = true;
    }
    else if (ny > hiY) {
        ny = loY <= hiY ? hiY : midY;
        if (dy > 0)
            dy = -dy;
        hit = true;
    }
    return hit ? { x: nx, y: ny, dir: Math.atan2(dy, dx) } : null;
}
export function speedLingerMul(spec: {
    ref: number;
    exp?: number;
    min?: number;
    max?: number;
} | undefined, speed: number): number {
    if (!spec)
        return 1;
    const raw = Math.pow(Math.max(1, speed) / Math.max(1, spec.ref), spec.exp ?? 1);
    return Math.min(spec.max ?? 4, Math.max(spec.min ?? 0.25, raw));
}
