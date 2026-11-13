import {AccountWorkshopSessionCore,type AccountWorkshopDefinitions,type AccountWorkshopLimits} from './account-workshop-core.js';
export type {AccountWorkshopDefinitions,AccountWorkshopLimits} from './account-workshop-core.js';
/** Existing public entry: constructor extras cannot select a new save policy. */
export class AccountWorkshopSession extends AccountWorkshopSessionCore {
 constructor(definitions:AccountWorkshopDefinitions,limits:AccountWorkshopLimits={}) {super(definitions,limits);}
}
