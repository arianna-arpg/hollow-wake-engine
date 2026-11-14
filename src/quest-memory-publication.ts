import type {PreparedQuestMemories,QuestMemoryPlacement} from './quest-memory-mint.js';
import type {CharacterMemoryDelivery} from './memory-delivery.js';
import {copySessionJSON,requireSession as need,sessionArray as array,type SessionJSON} from './session-json.js';

export interface QuestMemoryPublicationPorts {
 drop(drop:CharacterMemoryDelivery,placement:QuestMemoryPlacement):undefined;
 presentation(value:SessionJSON):undefined;
}
type Plan=Pick<PreparedQuestMemories,'drops'|'placements'|'presentations'>;
const copy=<T>(value:T):T=>copySessionJSON(value) as T;

/** A single-use live lease over an admitted private mint. Construction has no
 * live effects and allocates no item identity. The durable owner calls play only
 * after storage acknowledgement. A callback failure consumes the lease: recover
 * from the saved outbox instead of replaying partially published live effects. */
export class QuestMemoryPublication {
 readonly #plan:Plan;readonly #ports:QuestMemoryPublicationPorts;#state:'ready'|'consumed'|'discarded'='ready';
 constructor(plan:Plan,ports:QuestMemoryPublicationPorts){
  const held=copy(plan);array(held.drops,64);array(held.placements,64);array(held.presentations,64);
  need(held.drops.length===held.placements.length&&held.drops.length===held.presentations.length,'quest-publication-count');
  need(typeof ports.drop==='function'&&typeof ports.presentation==='function','quest-publication-ports');
  this.#plan=held;this.#ports={drop:ports.drop.bind(ports),presentation:ports.presentation.bind(ports)};
 }
 get state(){return this.#state;}
 play():void{
  need(this.#state==='ready','quest-publication-lease-expired');this.#state='consumed';
  for(let i=0;i<this.#plan.drops.length;i++){
   need(this.#ports.drop(copy(this.#plan.drops[i]),copy(this.#plan.placements[i]))===undefined,'quest-publication-must-be-synchronous');
   need(this.#ports.presentation(copy(this.#plan.presentations[i]))===undefined,'quest-publication-must-be-synchronous');
  }
 }
 discard():void{need(this.#state==='ready','quest-publication-lease-expired');this.#state='discarded';}
}
