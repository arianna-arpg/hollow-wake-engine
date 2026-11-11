import {Challenges, type ChallengeActor, type ChallengeSkill, type ChallengePorts,
  type ChallengeProjectile, type ChallengeCarrier} from '@hollow-wake/engine/combat/challenges';
import {copyChallengeState, type ChallengeContinuationMapping} from '@hollow-wake/engine/combat/challenge-continuation';

type Modifier = {stat: string; kind: 'flat'; value: number};
interface Skill extends ChallengeSkill<Modifier> {challengeHost?: Skill}
interface Actor extends ChallengeActor<Skill, Modifier> {team: 'friend' | 'enemy'; owner?: Actor}
interface Projectile extends ChallengeProjectile<Actor, Skill> {distance: number}
interface Carrier extends ChallengeCarrier<Actor, Skill> {remaining: number}
type Delivery = {range: number; placeRange?: number; marker: string};
declare const ports: ChallengePorts<Actor, Skill, Modifier, Projectile, Carrier, Carrier, Carrier, Delivery>;
declare const actors: ReadonlyMap<Actor, Actor>, skills: ReadonlyMap<Skill, Skill>;
const source = new Challenges(ports), destination = new Challenges(ports);
const mapping: ChallengeContinuationMapping<Actor, Skill, Delivery> = {
  actors, skills, spec: value => ({...value}), point: value => ({...value}), delivery: value => ({...value}),
};
const copied: typeof source = copyChallengeState(source, destination, mapping);
copied.update(0);

// @ts-expect-error A skill identity map is not an actor identity map.
copyChallengeState(source, destination, {...mapping, actors: skills});
// @ts-expect-error Every retained skill needs an enumerable mapping.
copyChallengeState(source, destination, {...mapping, skills: new WeakMap<Skill, Skill>()});
// @ts-expect-error Point mapping must retain numeric coordinates.
copyChallengeState(source, destination, {...mapping, point: () => ({x: 'wrong', y: 0})});
// @ts-expect-error Copy callbacks are synchronous.
copyChallengeState(source, destination, {...mapping, spec: async value => value});
// @ts-expect-error Opaque host delivery fields retain their declared type.
copyChallengeState(source, destination, {...mapping, delivery: () => ({range: 1})});
// @ts-expect-error Actor identity mapping cannot be omitted.
copyChallengeState(source, destination, {skills, spec: mapping.spec, point: mapping.point, delivery: mapping.delivery});
// @ts-expect-error The controller itself is not a durable restore API.
copied.restore({});
// @ts-expect-error The return value retains the controller type.
const invalid: number = copied;
