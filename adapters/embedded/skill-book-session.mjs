import {WorkshopSkillBook} from '@hollow-wake/engine/skills/workshop-book';
import {create as createAccount,dispatch} from './account-workshop-session.mjs';

/** Opt-in build-data capability. The published live combat equipment adapter
 * remains separate; this entry does not bind a book to a live combat actor. */
export const capability='workshop-skill-book/v1';
export const create=table=>createAccount(table,items=>new WorkshopSkillBook(items));
export {dispatch};
