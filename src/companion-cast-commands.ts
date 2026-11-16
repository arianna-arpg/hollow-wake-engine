export interface CompanionCommandPoint {x: number; y: number}
export interface CompanionCommandSkill {
  readonly def: {readonly id: string; readonly color: string};
  readonly hostSkillId?: string;
}
export interface CompanionCommandActor<A, I> {
  readonly owner?: A | null;
  readonly dead: boolean;
  readonly companion?: boolean;
  readonly companionDormant?: boolean;
  readonly downed?: boolean;
  readonly anchored?: boolean;
  readonly leap?: unknown;
  readonly construct?: {readonly kind: string; readonly deathBurst?: unknown};
  readonly defId?: string;
  readonly sourceSkillId?: string;
  readonly summonInst?: I;
  readonly manaReserved: number;
  readonly pos: CompanionCommandPoint;
  readonly radius: number;
  readonly facing: number;
  readonly tier: number;
  readonly team: string;
  life: number;
  push?: unknown;
  maxLife(): number;
  isMinion(): boolean;
}
export interface CompanionCommandPorts<A, I, Controller, Stance extends string> {
  actors(): readonly A[];
  companions(actor: A, hostSkillId: string): readonly A[];
  noRecall(definitionId: string): boolean;
  /** Native authored delivery, deliberately not a rewritten runtime payload. */
  nativeDelivery(skill: I): {type: string; persistent?: boolean};
  revive(actor: A, fraction: number): void;
  recover(actor: A): void;
  teleport(actor: A, at: CompanionCommandPoint, color: string, layer?: number): void;
  companionCue(actor: A, kind: 'answer', owner: A): void;
  whistleBonds(actor: A, skill: I, aim: CompanionCommandPoint): void;
  controller(actor: A): Controller | undefined;
  stance(controller: Controller, hostSkillId: string | undefined, stance: Stance | undefined): void;
  refundCooldown(actor: A, skillId: string): void;
  refused(actor: A, key: string, message: string): void;
  explode(actor: A, fraction: number, caster: A, skill: I, color: string): void;
  kill(actor: A, violent: boolean, killer?: A): void;
  selfCue(caster: A, skill: I, body: A): void;
  burst(at: CompanionCommandPoint, radius: number, amount: number, color: string, team: string, layer: number, caster: A, skill: I): void;
}

/** Skill-specific recipient selection and ordered commands. Hosts retain body
 * presence, spatial movement, general AI and campaign consequences. Recovery,
 * bonds and death ports connect the corresponding SDK combat services. */
export class CompanionCastCommands<
  A extends CompanionCommandActor<A, I>, I extends CompanionCommandSkill, Controller extends object, Stance extends string,
> {
  constructor(readonly ports: CompanionCommandPorts<A, I, Controller, Stance>) {}

  whistle(caster: A, skill: I, aim: CompanionCommandPoint): void {
    const bonded = skill.hostSkillId ? this.ports.companions(caster, skill.hostSkillId)
      : this.ports.actors().filter(actor => actor.companion && !actor.dead && actor.owner === caster);
    if (!bonded.length) {
      this.ports.refused(caster, skill.def.id + ':nobond', 'no companion bonded');
      this.ports.refundCooldown(caster, skill.def.id);
      return;
    }
    bonded.forEach((companion, i) => {
      if (companion.companionDormant) return;
      if (companion.downed) this.ports.revive(companion, 1);
      else this.ports.recover(companion);
      companion.life = companion.maxLife();
      const angle = caster.facing + Math.PI * 0.75 + i * 0.7;
      this.ports.teleport(companion, {x: caster.pos.x + Math.cos(angle) * 40, y: caster.pos.y + Math.sin(angle) * 40}, '#a8d8a0');
      this.ports.companionCue(companion, 'answer', caster);
    });
    this.ports.whistleBonds(caster, skill, aim);
  }

  stance(caster: A, skill: I, stance?: Stance): void {
    const controller = this.ports.controller(caster);
    if (!controller) this.ports.refundCooldown(caster, skill.def.id);
    else this.ports.stance(controller, skill.hostSkillId, stance);
  }

  recall(caster: A, skill: I, radius?: number): void {
    const mobile = this.ports.actors().filter(actor => actor.owner === caster && !actor.dead && actor.isMinion()
      && !actor.construct && !actor.anchored && !actor.leap && !this.ports.noRecall(actor.defId ?? ''));
    const reach = radius ?? caster.radius + 34;
    mobile.forEach((actor, i) => {
      const angle = i / Math.max(1, mobile.length) * Math.PI * 2;
      actor.push = null;
      this.ports.teleport(actor, {x: caster.pos.x + Math.cos(angle) * reach, y: caster.pos.y + Math.sin(angle) * reach}, skill.def.color, caster.tier);
    });
  }

  detonate(caster: A, skill: I, fraction: number, color = skill.def.color): void {
    let spent = 0;
    for (const actor of [...this.ports.actors()]) {
      if (actor.owner !== caster || actor.dead || actor.construct) continue;
      if (skill.hostSkillId && actor.sourceSkillId !== skill.hostSkillId) continue;
      if (actor.manaReserved > 0) continue;
      const delivery = actor.summonInst && this.ports.nativeDelivery(actor.summonInst);
      if (delivery?.type === 'summon' && delivery.persistent) continue;
      this.ports.explode(actor, fraction, caster, skill, color);
      if (!actor.dead) this.ports.kill(actor, false, caster);
      spent++;
    }
    if (!spent) this.ports.refused(caster, skill.def.id + ':nobodies', 'no minions to spend');
  }

  shatter(caster: A, skill: I, fraction: number, radius: number, color = skill.def.color): void {
    let blown = 0;
    for (const actor of [...this.ports.actors()]) {
      if (actor.owner !== caster || actor.dead || !actor.construct) continue;
      if (actor.construct.deathBurst) {
        this.ports.selfCue(caster, skill, actor);
        this.ports.kill(actor, true);
        blown++;
        continue;
      }
      if (!['totem', 'sentry', 'pylon'].includes(actor.construct.kind)) continue;
      this.ports.burst({x: actor.pos.x, y: actor.pos.y}, radius, actor.maxLife() * fraction, color, caster.team, caster.tier, caster, skill);
      this.ports.kill(actor, true);
      blown++;
    }
    if (!blown) this.ports.refused(caster, skill.def.id + ':nototems', 'nothing standing to shatter');
  }
}
