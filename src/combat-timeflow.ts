// Mechanically extracted combat time rules; no menu, campaign or host imports.
type Team = string;
export interface TimeBody {
  id: number;
  team: Team;
  owner?: TimeBody | null;
  statuses: { id: string }[];
}

export interface ActorTimeFilter {
  /** These actor ids ride exempt (the chronomancer walking their own stop). */
  exceptIds?: number[];
  /** Anything OWNED by these ids rides exempt too (the caster's minions —
   *  including ones summoned mid-hold, which is why this isn't an id list). */
  exceptOwnedBy?: number[];
  /** A whole team rides exempt (a warband chronomancer frees its kin). */
  exceptTeam?: Team;
  /** Restrict the bend to one team only (freeze THEM, nobody else). */
  onlyTeam?: Team;
}

export interface TimeHudSpec {
  /** Full-screen wash (any CSS color; keep the alpha subtle). */
  tint?: string;
  /** A quiet banner naming the moment ("Time Stop"). */
  label?: string;
}

export interface TimeHold {
  /** Unique handle — re-holding the same id REPLACES (refresh semantics). */
  id: string;
  /** 0 = stopped, (0,1) slow-motion, 1 = inert, >1 = accelerated. */
  scale: number;
  /** Grouping/policy tag. 'menu' hard holds (scale 0) also suspend OTHER
   *  holds' aging — the true pause. 'skill', 'cinematic', … are yours. */
  kind?: string;
  /** Lifetime in RAW seconds (see clock rules above). Omit = held until
   *  release() — what DOM surfaces use. */
  duration?: number;
  /** Omit = world-scoped (the whole sim). Set = only matching actors bend. */
  actors?: ActorTimeFilter;
  hud?: TimeHudSpec;
}

export interface ChronoSpec {
  scale: number;
  /** RAW seconds; scaled by the caster's effectDuration investment. */
  duration: number;
  exempt?: 'caster' | 'pack' | 'team' | 'none';
  /** Bend the WHOLE sim instead of actors-only (menus/cinematics territory —
   *  most skills want actor scope so the exempt circle stays live). */
  world?: boolean;
  hud?: TimeHudSpec;
}

export class CombatTimeflow {
  constructor(readonly status: (id: string) => {timeScale?: number} | undefined,
    readonly surfaces: Readonly<Record<string, {scale: number; kind?: string; hud?: TimeHudSpec}>> = {}) {}
  /** Live holds, insertion-ordered (the newest with a hud wins the overlay). */
  private holds: TimeHold[] = [];
  /** The fabric's own RAW clock — advanced by beginFrame, frozen only by a
   *  'menu' hard hold. Hold expiries are absolute marks on this clock. */
  age = 0;
  private untils = new Map<string, number>();
  /** Folded world scale, recomputed on any change + each beginFrame. */
  private worldScale_ = 1;
  /** Policy gate for 'menu'-kind holds — injected by the shell (main.ts
   *  wires "no live co-op peers"); everything else always may hold. */
  allowHold: (hold: TimeHold) => boolean = () => true;

  /** Any hold at all live? (Cheap outer gate for hot paths.) */
  get active(): boolean { return this.holds.length > 0; }

  /** Push (or refresh — same id replaces) a hold. Returns whether it took;
   *  a 'menu' hold the policy refuses is a clean no-op. */
  hold(h: TimeHold): boolean {
    if (!h.id || !Number.isFinite(h.scale) || h.scale < 0 || h.duration !== undefined
      && (!Number.isFinite(h.duration) || h.duration < 0)) throw new RangeError('Invalid time hold');
    if (h.kind === 'menu' && !this.allowHold(h)) return false;
    this.release(h.id);
    this.holds.push(h);
    if (h.duration !== undefined) this.untils.set(h.id, this.age + h.duration);
    this.refold();
    return true;
  }

  /** Open a TIME_CFG.surfaces entry by id (the UI's one-liner). Unknown ids
   *  are a no-op by design — deleting a surface from the config is the off
   *  switch, no call sites to chase. */
  holdSurface(id: string): boolean {
    const spec = this.surfaces[id];
    return spec ? this.hold({ id, ...spec }) : false;
  }

  /** Drop a hold by id (idempotent). */
  release(id: string): void {
    const i = this.holds.findIndex(h => h.id === id);
    if (i < 0) return;
    this.holds.splice(i, 1);
    this.untils.delete(id);
    this.refold();
  }

  /** Any live hold of this kind? — how a fabric yields to another's freeze
   *  (the scene director stands down while a 'menu' pause is up). */
  heldBy(kind: string): boolean {
    return this.holds.some(h => h.kind === kind);
  }

  /** Drop every hold of a kind — how a co-op join sweeps 'menu' pauses. */
  releaseKind(kind: string): void {
    if (!this.holds.length) return;
    for (let i = this.holds.length - 1; i >= 0; i--) {
      if (this.holds[i].kind !== kind) continue;
      this.untils.delete(this.holds[i].id);
      this.holds.splice(i, 1);
    }
    this.refold();
  }

  /** Once per frame, BEFORE consuming any scale: advance the raw clock,
   *  age holds on it (unless a 'menu' hard hold has the universe stopped),
   *  expire the due, and return the folded WORLD scale for this frame.
   *  `age` ticks with or without live holds — per the clock rules above it
   *  is the fabric's RAW clock, frozen only by the true pause. (It used to
   *  advance only while holds were live; nothing read it between holds
   *  until the eyecatch pane and the ultimate throttle — engine/ultimates.ts
   *  — began stamping against it, and a pane frozen under the pause menu is
   *  exactly right: the pause stops the universe, drama included.) */
  beginFrame(rawDt: number): number {
    if (!Number.isFinite(rawDt) || rawDt < 0) throw new RangeError('Invalid raw frame duration');
    const hardMenu = this.holds.length > 0
      && this.holds.some(h => h.kind === 'menu' && h.scale <= 0);
    if (!hardMenu) {
      this.age += rawDt;
      if (this.holds.length) {
        let dropped = false;
        for (let i = this.holds.length - 1; i >= 0; i--) {
          const until = this.untils.get(this.holds[i].id);
          if (until !== undefined && this.age >= until) {
            this.untils.delete(this.holds[i].id);
            this.holds.splice(i, 1);
            dropped = true;
          }
        }
        if (dropped) this.refold();
      }
    }
    return this.worldScale_;
  }

  /** The folded WORLD scale (world-scoped holds only). 1 when quiet. */
  worldScale(): number { return this.worldScale_; }

  /** This body's OWN rate on top of the world scale — actor-scoped holds ×
   *  status time (StatusDef.timeScale). For consumers already inside a
   *  world-scaled dt (World.update's actor loop, projectiles). */
  actorScale(a: TimeBody): number {
    let s = 1;
    for (const h of this.holds) {
      if (h.actors && this.matches(a, h.actors)) s *= h.scale;
    }
    if (a.statuses.length) {
      for (const st of a.statuses) {
        const ts = this.status(st.id)?.timeScale;
        if (ts !== undefined) s *= ts;
      }
    }
    return s;
  }

  /** The body's FULL rate against raw frame time (world × actor) — for
   *  consumers fed unscaled dt (updateAI, applyInputs). */
  scaleFor(a: TimeBody): number {
    const s = this.actorScale(a);
    return this.worldScale_ === 1 ? s : this.worldScale_ * s;
  }

  /** The hud spec to draw this frame: the NEWEST live hold carrying one
   *  (a skill stop outranks the ambient surface wash it interrupted). */
  overlay(): TimeHudSpec | null {
    for (let i = this.holds.length - 1; i >= 0; i--) {
      if (this.holds[i].hud) return this.holds[i].hud!;
    }
    return null;
  }

  private matches(a: TimeBody, f: ActorTimeFilter): boolean {
    if (f.onlyTeam && a.team !== f.onlyTeam) return false;
    if (f.exceptTeam && a.team === f.exceptTeam) return false;
    if (f.exceptIds && f.exceptIds.includes(a.id)) return false;
    if (f.exceptOwnedBy && a.owner && f.exceptOwnedBy.includes(a.owner.id)) return false;
    return true;
  }

  private refold(): void {
    let s = 1;
    for (const h of this.holds) if (!h.actors) s *= h.scale;
    this.worldScale_ = s;
  }
}
