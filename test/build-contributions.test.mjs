import test from 'node:test';
import assert from 'node:assert/strict';
import {BuildContributions} from '../dist/build-contributions.js';
import {PassiveGrants} from '../dist/passive-grants.js';
import {ContainerPolicy,SeatGeometry,SeatRules} from '../dist/container-policy.js';

const line=(stat,value,kind='flat')=>({stat,kind,value});
function fixture(){
 const passives=new PassiveGrants({schemaVersion:1,capability:'passive-grants/v1',contentId:'build-contract',
  attributes:[{id:'strength',perPoint:[line('life',2)]}],statIds:['life','damage','skillgrant_spark','seatPower_outward','seatPower_solitude'],supportIds:['echo'],
  nodes:[{id:'root',attributes:{strength:2},mods:[line('damage',.2,'increased')],choiceGroup:'temper',
   conduit:{from:'mana',to:'life',ratio:1},graft:{support:'echo'}}],
  groups:[{id:'temper',options:[{id:'strong',name:'Strong',description:'',attributesPct:{strength:.25}}]}]});
 const seat=new SeatRules({amplifiers:[{stat:'seatPower_outward',mode:'outward'},{stat:'seatPower_solitude',mode:'solitude'}],
  relicCaps:[{stat:'life',cap:80},{stat:'strength',cap:null}],relicBaseline:1});
 const policy=new ContainerPolicy({footprint:()=>({w:1,h:1}),base:()=>({category:'relic',tags:[]}),level:()=>0,unique:()=>undefined});
 const geometry=new SeatGeometry(()=>({w:1,h:1}),(mods,mode)=>seat.power(mods,mode));
 const board={w:3,h:1,open:[true,true,true],cells:3},defs=[{id:'reliquary',active:true},{id:'pouch',active:true},{id:'inactive',active:false},{id:'unowned',active:true}];
 const item=(uid,x,...mods)=>({uid,x,y:0,mods});
 const worn=item(1,0,line('strength',1),line('life',5));
 const relic=item(2,0,line('strength',2),line('life',10),line('skillgrant_spark',3));
 const amplifier=item(3,1,line('seatPower_outward',.5),line('life',4));
 const pouch=item(4,0,line('seatPower_solitude',.25),line('life',8));
 const excluded=item(5,0,line('life',900));
 const input={baseAttrs:{strength:5},allocated:new Set(['root']),choices:{root:['strong']},classDef:{innate:[line('life',3)]},
  equipped:{main:worn},containers:{reliquary:[relic,amplifier],pouch:[pouch],inactive:[excluded],unowned:[excluded]},relicEmpowerment:1};
 const sources=new Map(),events=[],compiles=[];
 const ports={beginPassives:m=>passives.begin(m.baseAttrs,m.allocated,m.choices),equipSlots:()=>[{id:'main'},{id:'ring'}],containers:()=>defs,
  compileItem:item=>{compiles.push(item.uid);return item.mods;},board:def=>def.id==='unowned'?null:board,
  misfits:(b,items)=>policy.misfits(b,items),amplification:(b,items,mods)=>geometry.amplification(b,items,mods),
  amplify:(mods,factor)=>seat.amplify(mods,factor),empower:(mods,power,factor)=>seat.empower(mods,power,factor)};
 const sink={conduits:value=>{events.push(['conduits',value]);},attributes:(value,mods)=>{sink.attrs=value;sink.sheet.setSource('attributes',mods);},
  sheet:{setSource:(id,mods)=>{events.push(['set',id]);sources.set(id,mods);},removeSource:id=>{events.push(['remove',id]);sources.delete(id);}}};
 const runtime=new BuildContributions(ports);
 return {runtime,input,sink,ports,sources,events,compiles,defs,board,worn,relic,amplifier,pouch,excluded,item};
}

test('full passive/gear/container fold rounds attributes once and preserves source order',()=>{
 const f=fixture(),result=f.runtime.rebuild(f.input,f.sink);
 // (base 5 + passive 2 + worn 1 + relic 2 * empowerment 2 * neighbour 1.5) * 1.25 = 17.5.
 assert.equal(f.sink.attrs.strength,18);
 assert.deepEqual(f.sources.get('attributes'),[line('life',36)]);
 assert.deepEqual(f.sources.get('container:reliquary'),[line('life',30),line('skillgrant_spark',3),line('life',8)]);
 assert.deepEqual(f.sources.get('container:pouch'),[line('life',10)]);
 assert.deepEqual([...f.sources.keys()],['attributes','class','passives','gear:main','container:reliquary','container:pouch']);
 assert.equal(f.sources.get('class'),f.input.classDef.innate);
 assert.deepEqual(result.passiveBuild.grafts.map(g=>[g.key,g.graft.support]),[['root','echo']]);
 assert.deepEqual(f.events.map(e=>e.slice(0,2)),[['conduits',[{from:'mana',to:'life',ratio:1}]],['set','attributes'],['set','class'],['set','passives'],
  ['set','gear:main'],['remove','gear:ring'],['set','container:reliquary'],['set','container:pouch'],['remove','container:inactive'],['remove','container:unowned']]);
});
test('grant discovery keeps exact item keys and complete scaled lines; each seated item compiles once',()=>{
 const f=fixture(),r=f.runtime.rebuild(f.input,f.sink);
 assert.deepEqual(f.compiles,[1,2,3,4]);assert.deepEqual([...r.containerPieceMods.keys()],[f.relic,f.amplifier,f.pouch]);
 assert.equal([...r.containerPieceMods.keys()][0],f.relic);
 assert.deepEqual(r.containerPieceMods.get(f.relic),[line('strength',6),line('life',30),line('skillgrant_spark',3)]);
 assert.deepEqual(r.gearSheetMods.get('main'),[line('life',5)]);
});
test('disabled, suppressed, inactive and unowned boards cannot contribute or invoke item compilation',()=>{
 for(const gate of ['disabled','suppressed']){
  const f=fixture();if(gate==='disabled')f.input.relicEnabled=false;else f.sink.relicEffectsSuppressed=true;
  const r=f.runtime.rebuild(f.input,f.sink);assert.deepEqual(f.compiles,[1,4]);assert.equal(r.containerPieceMods.size,1);
  assert(!f.sources.has('container:reliquary'));assert.equal(f.sink.attrs.strength,10);
 }
});
test('misfits do not amplify neighbours, become grant hosts or contribute attributes',()=>{
 const f=fixture();f.input.containers.reliquary.push(f.item(6,0,line('seatPower_outward',100),line('strength',100)),f.item(7,9,line('life',100)));
 const r=f.runtime.rebuild(f.input,f.sink);assert.deepEqual(f.compiles,[1,2,3,4]);assert.equal(f.sink.attrs.strength,18);assert.equal(r.containerPieceMods.size,3);
});
test('removed build sources and conduits clear without disturbing other live sources',()=>{
 const f=fixture();f.sources.set('live-buff',[line('life',11)]);f.runtime.rebuild(f.input,f.sink);
 f.input.equipped={};f.input.containers={};f.input.allocated.clear();f.input.classDef={};f.events.length=0;
 const r=f.runtime.rebuild(f.input,f.sink);
 assert.deepEqual(f.events[0],['conduits',undefined]);assert.deepEqual([...f.sources.keys()],['live-buff','attributes','class','passives']);
 assert.deepEqual(f.sources.get('class'),[]);assert.deepEqual(f.sources.get('passives'),[]);assert.equal(r.containerPieceMods.size,0);
});
test('current account power and item layout are re-read; repeated builds do not multiply saved lines',()=>{
 const f=fixture(),before=structuredClone(f.input);f.runtime.rebuild(f.input,f.sink);f.runtime.rebuild(f.input,f.sink);
 assert.equal(f.sink.attrs.strength,18);assert.deepEqual(f.input,before);
 f.input.relicEmpowerment=0;f.relic.x=2;f.amplifier.x=0;f.runtime.rebuild(f.input,f.sink);
 assert.equal(f.sink.attrs.strength,13);assert.deepEqual(f.sources.get('container:reliquary'),[line('life',10),line('skillgrant_spark',3),line('life',4)]);
});
test('late compilation failure preserves the original early conduit phase and no later publication',()=>{
 const f=fixture();f.sources.set('prior',[line('life',9)]);const compile=f.ports.compileItem;
 f.ports.compileItem=item=>{if(item===f.amplifier)throw Error('item-failure');return compile(item);};
 assert.throws(()=>f.runtime.rebuild(f.input,f.sink),/item-failure/);assert.equal(f.events.length,1);assert.equal(f.events[0][0],'conduits');
 assert.deepEqual([...f.sources.keys()],['prior']);assert.equal(f.sink.attrs,undefined);
});
test('publication failures retain completed writes and do not advance to later phases',()=>{
 const f=fixture(),set=f.sink.sheet.setSource;f.sink.sheet.setSource=(id,mods)=>{if(id==='passives')throw Error('sink-failure');set(id,mods);};
 assert.throws(()=>f.runtime.rebuild(f.input,f.sink),/sink-failure/);assert.deepEqual([...f.sources.keys()],['attributes','class']);
 assert.equal(f.sink.attrs.strength,18);
});
test('absent amplification rows mean one, while a real zero remains zero',()=>{
 const f=fixture();f.ports.amplification=()=>new Map([[f.relic,0]]);f.runtime.rebuild(f.input,f.sink);
 assert.deepEqual(f.sources.get('container:reliquary'),[line('life',0),line('skillgrant_spark',3),line('life',8)]);
 assert.deepEqual(f.sources.get('container:pouch'),[line('life',8)]);assert.equal(f.sink.attrs.strength,10);
});
test('equipment declaration order controls non-associative attribute accumulation',()=>{
 const f=fixture();f.input.baseAttrs.strength=0;f.input.allocated.clear();f.input.containers={};
 f.ports.equipSlots=()=>[{id:'first'},{id:'middle'},{id:'last'}];
 f.input.equipped={last:f.item(3,0,line('strength',1)),middle:f.item(2,0,line('strength',-1e16)),first:f.item(1,0,line('strength',1e16))};
 f.runtime.rebuild(f.input,f.sink);assert.equal(f.sink.attrs.strength,1);assert.deepEqual(f.compiles,[1,2,3]);
});
