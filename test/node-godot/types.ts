import {createNodeCombatHost,createReferenceSpace,listenCombatHost,lineDecoder,createMemoryCharacterStore} from '@hollow-wake/node-godot';
import {combatContent} from '@hollow-wake/combat/content';
const host=createNodeCombatHost(combatContent,{space:createReferenceSpace(combatContent),nativeHero:{name:'Host',team:'player',position:{x:0,y:0},skills:['firebolt']}});
host.input({t:'input',seq:1,move:[1,0],aim:[80,0],press:['firebolt']});
host.session.move(host.hero,{x:1,y:0},1/60);host.session.pose(host.hero);host.session.poses();
const frame=host.step(),tick:number=frame.tick,positions:number[]=frame.bodies.map(body=>body.x);
void tick;void positions;
host.grant({kind:'xp',amount:100});
// @ts-expect-error trusted grants have an explicit domain, not a quest command
host.grant({kind:'quest',id:'campaign'});
const store=createMemoryCharacterStore();void listenCombatHost(host,{port:0,save:value=>store.save(value)});
lineDecoder(message=>{void message;})(new Uint8Array());
// @ts-expect-error the host owns time and ordinary input cannot submit a pose
host.session.move(host.hero,{position:{x:1,y:1}},.1);
// @ts-expect-error no automatic quest/account/save authority
createNodeCombatHost(combatContent,{space:createReferenceSpace(combatContent),questBook:{}});
// @ts-expect-error physical providers return explicit floors
createReferenceSpace(combatContent).stepPhysical=()=>({pos:{x:0,y:0}});
