import assert from 'node:assert/strict';

/** Build an independently asserted request/answer course with the accepted
 * predecessor. The native driver replays these exact JSON bytes and answers. */
export function craftingCourse({CraftingSession,ItemContent,ItemRules,CraftingContent,SkillProgression},content) {
  const items=new ItemContent(content.items),crafting=new CraftingContent(content.crafting,items),skills=new SkillProgression(content.skills);
  const sdk=new CraftingSession({crafting,skills,memoryKinds:{rough_memory:'rough',preformed_memory:'preformed'}},2),rows=[];
  const copy=x=>JSON.parse(JSON.stringify(x)),access={salvage:true,oracle:true,bench:true,counter:true};
  const call=(op,args={},profile=1)=>{const request=copy({op,profile,...(['craft','socket','reroll','salvage','salvage-bulk','lock'].includes(op)?{access}:{}),...args});const expected=copy(sdk.command(request));rows.push({request,expected});return expected;};
  const save=(profile=1)=>{const r=call('save',{},profile);assert(r.ok);return r.save;};
  const gear=(uid,extra={})=>({...new ItemRules(items,7,uid).forge({baseId:'ring_lapis',ilvl:10,rarity:'common',quality:.5}),...extra});
  const state=(extra={})=>({board:{w:16,h:16},items:[],equipped:{},overflow:[],essences:Object.fromEntries(crafting.pack.essences.map(e=>[e.id,10000])),
    account:{craftLore:Object.fromEntries(Object.values(items.pack.affixes).map(a=>[a.family,{rank:1,progress:0}])),ledger:{},features:[crafting.pack.craft.extraSlotFeature],progression:true},...extra});
  const helmet=new ItemRules(items,7,1).forge({baseId:'helmet_armor',ilvl:10,rarity:'common',sockets:0});
  const loaded=state({equipped:{head:helmet},items:Array.from({length:128},(_,i)=>gear(i+2,{x:i%16,y:Math.floor(i/16),name:('Retained cargo '+i+' ').padEnd(512,'x')}))});
  const familyCount=Object.keys(loaded.account.craftLore).length;assert.equal(familyCount,3929);
  const opened=call('open',{seed:17,state:loaded});assert(opened.ok,JSON.stringify(opened));const before=save(),menu=call('options',{uid:1,offset:0,limit:128});assert(menu.rows.length>0);const option=menu.rows[0];
  assert(call('craft',{uid:1,affixId:option.id,score:.7}).events.some(e=>e.kind==='recalculate'));
  const paid=save();assert.equal(before.state.essences[option.cost.essence]-paid.state.essences[option.cost.essence],option.cost.count);assert(paid.state.equipped.head.affixes[0].crafted);
  assert(call('socket',{uid:1}).ok);assert.equal(save().state.equipped.head.craftedSockets,1);
  assert(call('reroll',{uid:1,index:0,score:.4}).ok);
  assert(call('lock',{uid:2,on:true}).ok);const saved=save();assert.equal(saved.state.items.length,128);
  assert(call('restore',{save:saved},2).ok);
  for(const args of [{kind:'forge',options:{baseId:'ring_lapis',ilvl:10,rarity:'rare'}},{kind:'roll',options:{baseId:'ring_lapis',ilvl:10,rarity:'magic'}}]) {
    const one=call('mint',args),two=call('mint',args,2);assert(one.ok);assert.deepEqual(two,one);assert.deepEqual(save(2),save());
  }
  assert.deepEqual(save(2),save());assert(call('close',{},2).ok);
  const wrong=copy(saved);wrong.content[0]='wrong-content';assert.equal(call('restore',{save:wrong},2).reason,'content-mismatch');assert(call('close').ok);
  const def=Object.values(items.pack.affixes).find(a=>a.tiers.some(t=>!t.magicOnly&&t.ilvl<=10)),reroll=gear(1,{x:0,y:0});
  reroll.affixes=[{id:def.id,tier:def.tiers.findIndex(t=>!t.magicOnly&&t.ilvl<=10),rolls:def.lines.map(()=>.5)}];
  assert(call('open',{seed:42,state:state({items:[reroll],essences:{}})}).ok);const unpaid=save();
  call('reroll',{uid:1,index:0,score:.5,access:{...access,oracle:false}});assert.deepEqual(save(),unpaid);
  assert(call('reroll',{uid:1,index:0,score:.5}).events.some(e=>e.kind==='insufficient'));assert(save().random.draws>unpaid.random.draws);assert.deepEqual(save().state,unpaid.state);call('close');
  const skill=skills.pack.skills[0],support=skills.pack.supports[0];
  const source={uid:10,baseId:'skill_gem',ilvl:1,tier:1,name:'Saved gem',rarity:'common',baseRoll:0,implicitRolls:[],affixes:[],x:0,y:0,
    gem:{kind:'skill',skillId:skill.id,level:1,rarity:'common',sockets:[{supportId:support.id,level:1,locked:true,rolled:{cut:'choice'}},null,{supportId:support.id,level:1},{supportId:support.id,level:1}]}};
  assert(call('open',{seed:5,state:state({board:{w:3,h:1,rows:['#.#']},items:[source]})}).ok);
  assert(call('salvage',{uid:10,lane:'break'}).ok);const recovered=save();assert.deepEqual(recovered.state.items.map(i=>i.x),[0,2]);assert.equal(recovered.state.items[0].locked,true);assert.deepEqual(recovered.state.items[0].gem.rolled,{cut:'choice'});assert.equal(recovered.state.overflow.length,1);
  assert.equal(call('recover',{uid:13}).result.moved,false);assert(call('restore',{save:recovered},2).ok);
  assert.equal(call('take-overflow',{uid:13},2).result.item.uid,13);assert.equal(save(2).state.overflow.length,0);assert.equal(save().state.overflow.length,1);call('close',{},2);call('close');
  assert(call('open',{seed:9,state:state({items:[gear(1,{x:0,y:0}),gear(2,{x:1,y:0,locked:true}),gear(3,{x:2,y:0,questId:'quest'}),gear(4,{x:3,y:0,relicKey:'relic'})]})}).ok);
  assert(call('salvage-bulk',{category:'item',lane:'break'}).ok);assert.deepEqual(save().state.items.map(i=>i.uid),[2,3,4]);call('close');
  for(const [baseId,kind] of [['rough_memory','rough'],['preformed_memory','preformed']]) {
    const memory={uid:1,baseId,ilvl:1,tier:1,rarity:'common',name:'Memory',baseRoll:0,implicitRolls:[],affixes:[],x:0,y:0,mem:[{d:'quest',s:12},{d:'rare-drop',s:17}]};
    assert(call('open',{seed:1,state:state({items:[memory]})}).ok);const b=save(),gain=crafting.rules.sellMemoryYield(kind,2);
    assert(call('salvage',{uid:1,lane:'sell'}).ok);const after=save();assert.equal(after.state.essences[gain.essence]-b.state.essences[gain.essence],gain.count);assert.deepEqual(after.state.items,[]);call('close');
  }
  return {rows,coverage:{familyCount,loadedItems:128,simultaneousProfiles:2,loadedSaveBytes:Buffer.byteLength(JSON.stringify(saved)),payments:true,continuation:true,overflow:true,protectedCargo:true,memory:true}};
}
