/** Borrowed character-only vocation ownership, independent of campaign progress. */
export interface VocationCharacter {readonly vocations:{readonly length:number;includes(id:string):boolean;push(id:string):unknown};readonly allocated:{add(id:string):unknown}}
export function vocationRootId(id: string): string { return 'voc_' + id + '_root'; }

/** Character-only ownership transition. Definition and grant authority belong
 * to the caller; optional campaign/account consequences run after this step. */
export function takeVocation(id:string,character:VocationCharacter,maxPerCharacter:number|(()=>number)):boolean{
  if(character.vocations.includes(id)||character.vocations.length>=(typeof maxPerCharacter==='function'?maxPerCharacter():maxPerCharacter))return false;
  character.vocations.push(id);character.allocated.add(vocationRootId(id));return true;
}
