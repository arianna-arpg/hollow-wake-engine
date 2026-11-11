import {Challenges, type ChallengeActor, type ChallengeSkill, type ChallengePorts,
  type ChallengeProjectile, type ChallengeCarrier, type ChallengeSpec} from '@hollow-wake/engine/combat/challenges';
import {ChallengeContent} from '@hollow-wake/engine/combat/challenge-content';

type Modifier = {stat: string; kind: 'flat'; value: number};
interface Skill extends ChallengeSkill<Modifier> {
  def: ChallengeSkill<Modifier>['def'] & {tree?: Record<string, ChallengeSpec>};
  challengeHost?: Skill;
}
interface Actor extends ChallengeActor<Skill, Modifier> {team: 'friend' | 'enemy'; owner?: Actor}
interface Projectile extends ChallengeProjectile<Actor, Skill> {distance: number}
interface Carrier extends ChallengeCarrier<Actor, Skill> {remaining: number}
type Delivery = {range: number; placeRange?: number};
declare const ports: ChallengePorts<Actor, Skill, Modifier, Projectile, Carrier, Carrier, Carrier, Delivery>;
declare const owner: Actor, target: Actor, host: Skill;
const controller = new Challenges(ports);
const content = new ChallengeContent<Skill>({patch: (definition, id) => definition.tree?.[id]});
const cast: Skill = controller.prepare(owner, host, true);
controller.completed(owner, cast);
controller.beforeEffects(owner, cast, target, 10, 0);
controller.afterHit(owner, cast, target, 10, 0, 1);
const delivery = content.delivery(host);
if (delivery) controller.toss(owner, cast, {x: 0, y: 0}, delivery, 1);
controller.update(1 / 60);
controller.clear(owner, host);
controller.clearAll();

// @ts-expect-error Host identity is an actor, not its numeric ID.
controller.prepare(owner.id, host, true);
// @ts-expect-error Clock advancement requires a number.
controller.update('next-frame');
// @ts-expect-error Host randomness is explicitly supplied through a function.
ports.random = 0.5;
// @ts-expect-error A construction delivery requires a numeric range.
controller.toss(owner, cast, {x: 0, y: 0}, {range: 'wide'}, 1);
// @ts-expect-error A prepared cast retains the caller's skill type.
const invalid: number = cast;
// @ts-expect-error The content callback returns a structured mechanic patch.
new ChallengeContent({patch: () => 'device'});
// @ts-expect-error Carrier replacement preserves the caller's projectile fields.
ports.projectiles = [{caster: owner, inst: host, anchor: {x: 0, y: 0}, hits: new Map()}];
// @ts-expect-error The challenge controller is not a persistence/clone service.
controller.restore({});
