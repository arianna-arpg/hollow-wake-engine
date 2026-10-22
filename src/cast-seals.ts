export interface CastMatch {
  readonly ids?: readonly string[];
  readonly tags?: readonly string[];
  readonly laws?: readonly string[];
}
export interface CastSealSpec {
  readonly mode?: 'shut' | 'open';
  readonly open?: CastMatch;
  readonly shut?: CastMatch;
  readonly binds?: 'all' | 'seats';
  readonly line?: string;
}
export interface CastSealSkill {
  readonly def: { readonly id: string };
  readonly hostSkillId?: string;
}
export interface CastSealContext {
  readonly inst: CastSealSkill;
  readonly seated: boolean;
}
export type CastLaw<C> = (context: C) => boolean;

/** One owner's live rule registry. No built-in or process-wide registrations.
 * Context, authored rows and tags are borrowed; predicates may re-enter or throw. */
export class CastSeals<C extends CastSealContext> {
  readonly #laws = new Map<string, CastLaw<C>>();
  readonly #tags: (inst: C['inst']) => ReadonlySet<string>;
  constructor(contextTags: (inst: C['inst']) => ReadonlySet<string>) { this.#tags = contextTags; }

  register(id: string, law: CastLaw<C>): void { this.#laws.set(id, law); }
  known(id: string): boolean { return this.#laws.has(id); }
  ids(): string[] { return [...this.#laws.keys()]; }

  matches(match: CastMatch | undefined, context: C): boolean {
    if (!match) return false;
    const inst = context.inst;
    if (match.ids && (match.ids.includes(inst.def.id)
      || (inst.hostSkillId !== undefined && match.ids.includes(inst.hostSkillId)))) return true;
    if (match.tags && match.tags.length) {
      const tags = this.#tags(context.inst);
      for (const tag of match.tags) if (tags.has(tag)) return true;
    }
    if (match.laws) {
      for (const id of match.laws) {
        const law = this.#laws.get(id);
        if (law && law(context)) return true;
      }
    }
    return false;
  }

  shuts(spec: CastSealSpec, context: C): boolean {
    if ((spec.binds ?? 'all') === 'seats' && !context.seated) return false;
    if (this.matches(spec.shut, context)) return true;
    if (this.matches(spec.open, context)) return false;
    return (spec.mode ?? 'shut') === 'shut';
  }

  issues(spec: CastSealSpec, skillKnown: (id: string) => boolean): string[] {
    const out: string[] = [];
    for (const row of ['open', 'shut'] as const) {
      const match = spec[row];
      if (!match) continue;
      for (const id of match.ids ?? []) if (!skillKnown(id)) out.push(`${row}.ids names no skill '${id}'`);
      for (const id of match.laws ?? []) if (!this.#laws.has(id)) out.push(`${row}.laws names no registered law '${id}'`);
    }
    if (spec.mode === 'open' && !spec.shut) out.push("mode 'open' with no shut row seals nothing — drop the seal");
    return out;
  }
}
