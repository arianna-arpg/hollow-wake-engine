/** Optional host policy. No automatic save, account or combat-clock coupling. */
export function createMemoryCharacterStore() {
 let data=null;
 return Object.freeze({load:()=>structuredClone(data),save:value=>{data=structuredClone(value);}});
}
