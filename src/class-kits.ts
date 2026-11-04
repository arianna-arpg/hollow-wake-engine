export interface ClassKitRow {
  readonly tier: string;
  readonly skill: string;
  readonly replaces?: string;
}
export interface ClassKitDefinition<Row extends ClassKitRow = ClassKitRow> {
  readonly id: string;
  readonly bar: readonly (string|null)[];
  readonly kit?: readonly Row[];
}
export interface ClassKitAccount {
  readonly unlockedClassTiers: {has(id: string): boolean};
  readonly kitPicks: Record<string,Record<string,string>|undefined>;
}
export interface KitSlotChoice {base: string;options:string[];picked:string}
export interface KitGrant {skill:string;tier:string}

function readPick<T>(record: Readonly<Record<string,T>> | undefined, key: string): T | undefined {
  return record && Object.hasOwn(record,key) ? record[key] : undefined;
}

function writePick<T>(record: Record<string,T>, key: string, value: T): void {
  if (key === '__proto__') {
    Object.defineProperty(record,key,{value,writable:true,enumerable:true,configurable:true});
  } else {
    record[key]=value;
  }
}

export function classTierOwned(account: ClassKitAccount,classId: string,tier: string): boolean {
  return account.unlockedClassTiers.has(`tier_${classId}_${tier}`);
}

export function ownedKitRungs<Row extends ClassKitRow>(account: ClassKitAccount,definition: ClassKitDefinition<Row>): Row[] {
  return (definition.kit??[]).filter(row=>classTierOwned(account,definition.id,row.tier));
}

export function kitChoicesFor(account: ClassKitAccount,definition: ClassKitDefinition): {slots:KitSlotChoice[];grants:KitGrant[]} {
  const owned=ownedKitRungs(account,definition), remembered=readPick(account.kitPicks,definition.id);
  const slots:KitSlotChoice[]=[],grants:KitGrant[]=[];
  for(const base of definition.bar) {
    if(!base)continue;
    const options=[base];
    for(const row of owned)if(row.replaces===base)options.push(row.skill);
    const want=readPick(remembered,base);
    slots.push({base,options,picked:want&&options.includes(want)?want:base});
  }
  for(const row of owned)if(!row.replaces)grants.push({skill:row.skill,tier:row.tier});
  return {slots,grants};
}

export function resolveClassKit(account: ClassKitAccount,definition: ClassKitDefinition,picks?: Readonly<Record<string,string>>): (string|null)[] {
  const {slots,grants}=kitChoicesFor(account,definition),bySlot=new Map<string,KitSlotChoice>();
  for(const slot of slots)bySlot.set(slot.base,slot);
  const bar=definition.bar.map(base=>{
    if(!base)return null;
    const slot=bySlot.get(base),want=readPick(picks,base)??slot?.picked??base;
    return slot&&slot.options.includes(want)?want:base;
  });
  for(const grant of grants){
    if(bar.includes(grant.skill))continue;
    const free=bar.indexOf(null);
    if(free<0)break;
    bar[free]=grant.skill;
  }
  return bar;
}

export function rememberKitPicks(account: ClassKitAccount,definition: ClassKitDefinition,picks: Readonly<Record<string,string>>): void {
  const {slots}=kitChoicesFor(account,definition),kept:Record<string,string>={};
  for(const slot of slots){
    const want=readPick(picks,slot.base);
    if(want&&want!==slot.base&&slot.options.includes(want))writePick(kept,slot.base,want);
  }
  if(Object.keys(kept).length)writePick(account.kitPicks,definition.id,kept);
  else delete account.kitPicks[definition.id];
}

export function kitHasOptions(account: ClassKitAccount,definition: ClassKitDefinition): boolean {
  return (definition.kit??[]).some(row=>classTierOwned(account,definition.id,row.tier)
    && (!row.replaces||definition.bar.includes(row.replaces)));
}

export function kitRungOf(definition: ClassKitDefinition,skill: string,label: (id:string)=>string|undefined) {
  const row=definition.kit?.find(r=>r.skill===skill);
  return row?{tier:row.tier,label:label(row.tier)??row.tier}:undefined;
}
