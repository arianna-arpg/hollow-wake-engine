export interface ClassAccess {
  readonly unlockedClasses: {has(id: string): boolean};
  readonly pendingClassUnlocks: {has(id: string): boolean};
}

export function isClassDiscovered(access: ClassAccess, id: string): boolean {
  return access.unlockedClasses.has(id);
}

export function isClassUnlocked(access: ClassAccess, id: string): boolean {
  return isClassDiscovered(access,id) && !access.pendingClassUnlocks.has(id);
}

export function unlockedClassCount(classes: readonly {readonly id:string}[], access: ClassAccess): number {
  let count=0;
  classes.forEach(definition=>{if(isClassUnlocked(access,definition.id))count++;});
  return count;
}

export function findSavedClass<Definition extends {readonly id:string}>(classes: readonly Definition[], id: string): Definition | undefined {
  return classes.find(definition=>definition.id===id);
}

export interface ClassIdentityDefinition<Attributes extends object,Skill> {
  readonly name: string;
  readonly attributes: Attributes;
  readonly bar: readonly (Skill|null)[];
}
export interface SavedClassIdentity<Attributes extends object,Skill,Stances> {
  readonly opening?: readonly (Skill|null)[];
  readonly stances?: Stances;
  readonly name?: string;
  readonly baseAttrs: Attributes;
}

/** A character owns its opening and its two attribute records. The registered
 * class definition stays shared with the host's live content registry. */
export function createClassIdentity<Attributes extends object,Skill,Definition extends ClassIdentityDefinition<Attributes,Skill>>(
  classDef: Definition & ClassIdentityDefinition<Attributes,Skill>, opening: readonly (Skill|null)[],
) {
  return {classDef,opening:[...opening],stances:{},name:classDef.name,baseAttrs:{...classDef.attributes},attrs:{...classDef.attributes}};
}

export function restoreClassIdentity<Attributes extends object,Skill,Definition extends ClassIdentityDefinition<Attributes,Skill>,Stances,Restored>(
  classDef: Definition, save: SavedClassIdentity<Attributes,Skill,Stances>, restoreStances: (stances: Stances|undefined)=>Restored,
) {
  return {classDef,opening:[...(save.opening??classDef.bar)],stances:restoreStances(save.stances),
    name:save.name?.trim()||classDef.name,baseAttrs:{...save.baseAttrs},attrs:{...save.baseAttrs}};
}

export function restoreLifeIdentity(save: {readonly modeId?:string;readonly modeStage?:number;readonly charId?:string},defaultMode: string,mintId: ()=>string) {
  return {modeId:save.modeId??defaultMode,modeStage:save.modeStage??0,charId:save.charId||mintId()};
}
