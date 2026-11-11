import {ChallengeContent} from '@hollow-wake/engine/combat/challenge-content';
import {treeNodeOf, type SkillInstance, type ConstructDelivery} from './skills';
export type {ChallengeSpec} from '@hollow-wake/engine/combat/challenges';

const content = new ChallengeContent<SkillInstance>({patch: (definition, id) => treeNodeOf(definition, id)?.challenge});
export function challengeOf(inst: SkillInstance) {return content.spec(inst);}
export function challengeDelivery(inst: SkillInstance): ConstructDelivery | undefined {return content.delivery(inst);}
