import test from 'node:test';
import assert from 'node:assert/strict';

export function inventoryDataContracts({InventoryData,ItemRules,definitions}){
  const data=new InventoryData(definitions),copy=structuredClone;
  const state=()=>({board:{w:8,h:8},items:[],equipped:{},overflow:[],essences:{}});
  const gear=uid=>new ItemRules(definitions.crafting.items,7,uid).forge({baseId:'ring_lapis',ilvl:10,rarity:'common',quality:.5});
  const skill=definitions.skills.pack.skills[0],support=definitions.skills.pack.supports[0];
  const gem=()=>({kind:'skill',skillId:skill.id,level:1,rarity:'common',sockets:[]});

  test('raw Inventory admission detaches data and rejects executable or hidden input',()=>{
    const input=state();input.items=[{...gear(1),x:0,y:0}];
    const admitted=data.admit(input);assert.notEqual(admitted,input);assert.notEqual(admitted.items[0],input.items[0]);
    admitted.items[0].name='Changed';assert.notEqual(input.items[0].name,'Changed');
    let reads=0;const accessor=state();Object.defineProperty(accessor,'items',{enumerable:true,get(){reads++;return[];}});
    assert.throws(()=>data.admit(accessor),/invalid-property/);assert.equal(reads,0);
    const hidden=state();Object.defineProperty(hidden,'extra',{value:1});assert.throws(()=>data.admit(hidden),/invalid-property/);
    const cyclic=state();cyclic.items.push(cyclic);assert.throws(()=>data.admit(cyclic),/json-limit/);
    const sparse=state();sparse.items.length=2;assert.throws(()=>data.admit(sparse),/invalid-array/);
  });

  test('Inventory admission needs no account, quest, save envelope or random service',()=>{
    const input=state();input.items=[{...gear(1),x:0,y:0}];input.equipped.ring=gear(2);input.overflow=[gear(3)];
    const before=copy(input);assert.equal(data.inventory(input),input);assert.deepEqual(input,before);
    assert.equal(Object.hasOwn(input,'account'),false);
    for(const extra of ['account','save','questBook'])assert.throws(()=>data.inventory({...input,[extra]:{}}));
  });

  test('shared item identity, occupancy and wallet checks remain strict',()=>{
    const valid=state();valid.items=[{...gear(1),x:0,y:0}];
    const edits=[
      input=>input.overflow.push(gear(1)),
      input=>input.items.push({...gear(2),x:0,y:0}),
      input=>input.items[0].x=8,
      input=>input.board.rows=Array(8).fill('........'),
      input=>input.board.w=257,
      input=>input.equipped.ring={...gear(2),x:0,y:0},
      input=>input.essences.unknown=1,
      input=>input.essences[definitions.crafting.pack.essences[0].id]=-.5,
      input=>input.items[0].baseId='unknown',
    ];
    for(const edit of edits){const input=copy(valid);edit(input);const before=copy(input);assert.throws(()=>data.inventory(input));assert.deepEqual(input,before);}
  });

  test('learned payloads use the shared validator and explicit caller-owned book policy',()=>{
    const input=state();input.skillBook={known:[{gem:gem()}],bar:Array(8).fill(null)};
    assert.throws(()=>data.inventory(input),/skill-book-unavailable/);
    let calls=0;const book=(value,validator)=>{assert.equal(validator,data);calls++;for(const row of value.known)validator.skillPayload(row.gem);};
    assert.equal(data.inventory(input,undefined,book),input);assert.equal(calls,1);
    input.skillBook.known[0].gem.sockets=[{supportId:'unknown',level:1}];assert.throws(()=>data.inventory(input,undefined,book),/unknown-support/);
    input.rack=[];assert.throws(()=>data.inventory(input,undefined,book),/duplicate-skill-authority/);
  });

  test('legacy rack and grant residence validation reuse the same strict payload rules',()=>{
    const input=state();input.rack=[{gem:gem()},null];
    assert.throws(()=>data.inventory(input),/rack-unavailable/);
    data.inventory(input,(rows,validator)=>{for(const row of rows)if(row)validator.skillPayload(row.gem);});
    data.grantState(skill.id,{sockets:[{supportId:support.id,level:1}]});
    assert.throws(()=>data.grantState(skill.id,{sockets:[{supportId:support.id,level:0}]}));
    assert.throws(()=>data.grantState('unknown',{sockets:[]}));
  });

  test('item overrides remain active for every owned residence',()=>{
    const calls=[];class ObservedData extends InventoryData{item(input){calls.push(input.uid);return super.item(input);}}
    const input=state();input.items=[{...gear(1),x:0,y:0}];input.equipped.ring=gear(2);input.overflow=[gear(3)];
    new ObservedData(definitions).inventory(input);assert.deepEqual(calls,[1,2,3]);
  });
}
