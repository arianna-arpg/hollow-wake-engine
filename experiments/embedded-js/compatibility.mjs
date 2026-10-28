import {Engine,Inventory} from '../../dist/index.js';
import {ItemContent,ItemRules} from '../../dist/item-rules.js';
import {PassivePolicy} from '../../dist/passive-policy.js';

export function observe(input) {
  Math.random=()=>{throw new Error('Ambient randomness');};
  globalThis.fetch=()=>{throw new Error('Network use');};
  for(const key of ['window','document','localStorage']) Object.defineProperty(globalThis,key,{get(){throw new Error(key);}});
  const copy=value=>JSON.parse(JSON.stringify(value));
  const engine=new Engine(input.core,42),hero=engine.character({classId:'magician',passivePoints:1});
  hero.equip('lapis-reference','ring1');hero.allocate('cross_int_pursuit');
  const skill=engine.skill({id:'ruin',level:5,sockets:2,treePoints:1,
    supports:[{id:'corrosion',level:2},{id:'measured_blows',level:1}],nodes:['ruin_studies']});
  const core={attributes:hero.attributes,preview:engine.preview(hero,skill),costs:engine.costs(hero,skill),hits:[]};
  for(let i=0;i<32;i++) core.hits.push(engine.resolveHit(hero,skill,engine.target({life:500,mods:[{stat:'chaosRes',kind:'flat',value:.25}]})));
  core.random=engine.randomSnapshot();core.build=hero.snapshot();
  const content=new ItemContent(input.items),rules=new ItemRules(content,126),items=[];
  for(let i=0;i<256;i++) {
    const item=rules.roll({ilvl:1+(17*i)%80});
    items.push(item?{item:copy(item),mods:rules.compile(item)}:null);
  }
  const restored=ItemRules.restore(content,copy(rules.snapshot())),continuation=[];
  for(let i=0;i<16;i++) continuation.push({live:rules.roll({ilvl:21}),restored:restored.roll({ilvl:21})});
  const ring=rules.forge({baseId:'ring_lapis',ilvl:21,rarity:'rare',quality:1,affixes:[{id:'attr_intelligence'}]});
  if(!ring) throw new Error('Missing forged item');
  const board=new Inventory({w:2,h:2});board.insert({id:'ring',w:1,h:1,data:ring});
  const inventory=Inventory.restore(copy(board.snapshot())).snapshot();
  const policy=new PassivePolicy(input.passives),passives=[];
  for(const c of input.passives.classes) {
    const build=policy.create({classId:c.id,allocated:[c.startNode],choices:{},grafts:{},vocations:[],passivePoints:10,vocationPoints:0,realmPoints:{}});
    for(const id of input.passives.adjacency[c.startNode]) {
      const node=policy.node(id),group=policy.group(node),allocation=build.allocate(id,{ledger:{}},group?.options[0].id);
      const entry={classId:c.id,id,allocation:copy(allocation),afterAllocation:build.snapshot()};
      if(allocation.accepted) {
        entry.refund=build.refund(id);entry.afterRefund=build.snapshot();
        entry.restored=policy.restore(copy(entry.afterRefund)).snapshot();
      }
      passives.push(copy(entry));
    }
  }
  return {scope:'Compatibility discovery, no timing or engine-package claim',
    content:{bases:Object.keys(input.items.bases).length,affixes:Object.keys(input.items.affixes).length,
      passiveNodes:input.passives.nodes.length,classes:input.passives.classes.length},
    core,items,continuation,itemState:rules.snapshot(),inventory,passives};
}
