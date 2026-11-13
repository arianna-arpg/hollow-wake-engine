import {finite} from './validation.js';
/** Internal run policy over admitted seated area. Reproduces the public custody
 * service's arithmetic without loading that service into the run policy. Body
 * ownership and selection belong to the caller; no item payloads are copied. */
export function relicExperienceFactor(cells:number,penalty:number,enabled:boolean):number {
 if(finite(cells,'Seated relic cells')<0||finite(penalty,'Relic XP penalty')<0)throw Error('Relic XP factors must be nonnegative');
 if(typeof enabled!=='boolean')throw Error('Invalid relic experience policy');
 return enabled?Math.max(0,finite(1-cells*penalty,'Relic experience factor')):1;
}
