import {createCombatSession} from '@hollow-wake/combat';

const point=p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e7);
const ids=a=>Array.isArray(a)&&a.length<=8&&a.every(s=>typeof s==='string'&&s.length<=128);
const conditions=Object.freeze({
 inventory:{salvage:true,oracle:true,bench:true,counter:true,study:true},support:{hold:null},
 skill:{nearFont:true,memory:{},hold:null},passive:{refundRefusal:null,openAllRealms:false,runLedger:{}},
 rack:{meets:true,blocked:{}},bar:{},merge:{nearFont:true,memory:{},hold:null},
});
const statIds=['life','mana','damage','moveSpeed','armor','castSpeed','attackSpeed'];

/** Node host ownership. Input is untrusted; character grants, setup, spatial
 * facts and storage remain trusted services, never network commands. */
export function createNodeCombatHost(content,{kit,character,nativeHero,space,seed=1234,position={x:400,y:400},conditionsFor}={}) {
 if(!space||(!nativeHero&&(!kit||!character)))throw Error('Character kit and character, or native encounter body, and space are required');
 const session=createCombatSession(content,{space},{seed,capacity:64});
 const hero=nativeHero?session.addActor({...nativeHero,controlled:true}):session.addCharacter(kit,character,{name:'Theorycrafter',position});
 const bar=()=>nativeHero?(nativeHero.skills??[]).map(s=>({id:typeof s==='string'?s:s.id})):character.inspect().bar;
 let seq=-1,tick=0,queue=[],latest={move:[0,0],aim:[position.x+100,position.y],held:[]},revision=0,closed=false;
 const currentHero=()=>session.controlled(hero)??hero;
 const available=()=>{if(closed)throw Error('Combat host is closed');};
 const input=message=>{
  available();
  if(!message||message.t!=='input'||!Number.isSafeInteger(message.seq)||message.seq<0||message.seq<=seq
   ||!point(message.move)||Math.hypot(...message.move)>1.000001||!point(message.aim)||!ids(message.press)
   ||!ids(message.held??[])||Object.keys(message).some(k=>!['t','seq','move','aim','press','held','hold'].includes(k))
   ||message.hold!==undefined&&typeof message.hold!=='boolean')return {accepted:false,reason:'invalid-input'};
  if(queue.length>=32)return {accepted:false,reason:'input-queue-full'};
  const held=message.held??[];
  seq=message.seq;queue.push({seq,move:[...message.move],aim:[...message.aim],press:[...message.press],held:[...held],hold:message.held===undefined&&message.hold===true});
  return {accepted:true};
 };
 const stats=c=>Object.fromEntries(statIds.map(id=>[id,c.stat(id)]));
 const inventory=()=>nativeHero?{revision,mode:'effect-gallery',build:{bar:bar()},data:null,actions:[],stats:Object.fromEntries(statIds.map(id=>[id,session.stat(hero,id)]))}
  :{revision,build:character.inspect(),data:character.export(),stats:stats(character)};
 const publish=change=>{
  if(!change.accepted)return {accepted:false,reason:change.refusal};
  const result=session.commitCharacter(hero,change);if(result.accepted)revision++;
  return {...result,inventory:result.accepted?inventory():undefined};
 };
 const grant=request=>{
  available();
  if(nativeHero)return {accepted:false,reason:'native-encounter-has-no-character-investment'};
  return publish(character.authorize(request));
 };
 const build=(command,{preview=false}={})=>{
  available();
  if(nativeHero)return {accepted:false,reason:'native-encounter-has-no-character-investment'};
  if(!command||!Object.hasOwn(conditions,command.kind)||Object.keys(command).some(k=>!['kind','request'].includes(k)))return {accepted:false,reason:'invalid-build-command'};
  const change=character.prepare(command,conditionsFor?.(command.kind)??conditions[command.kind]);
  if(!change.accepted)return {accepted:false,reason:change.refusal};
  if(preview){const view=character.preview(change),candidate=kit.admit(view.data,view.projection);
   return {accepted:true,preview:true,build:candidate.inspect(),stats:stats(candidate)};}
  return publish(change);
 };
 const step=(dt=1/60)=>{
  available();if(!Number.isFinite(dt)||dt<=0||dt>.25)throw Error('Invalid host step');
  const pending=queue;queue=[];
  if(pending.length)latest=pending.at(-1);
  const actor=currentHero();
  // The original applyInputs order: ordinary motion, live aim/hold, fresh
  // casts, then the complete combat clock. Movement is applied only once.
  session.move(actor,{x:latest.move[0],y:latest.move[1]},dt);
  session.aim(actor,{x:latest.aim[0],y:latest.aim[1]});
  const casting=session.inspect(actor).casting;
  if(casting&&!latest.hold&&!latest.held.includes(casting.id))session.release(actor);
  for(const entry of pending)for(const skill of entry.press)session.press(currentHero(),skill,{x:entry.aim[0],y:entry.aim[1]});
  session.advance(dt);tick++;
  const state=session.snapshot(),poses=new Map(session.poses().map(p=>[p.id,p])),controlled=currentHero();
  // Reuse the detached view already captured for this frame, including a
  // possession transfer. A retired controlled body can be absent from the
  // roster while its retained handle is still valid.
  const hud=state.actors.find(a=>a.id===controlled.id)??session.inspect(controlled);
  return {t:'state',tick,time:state.time,ack:seq,hero:controlled.id,inventoryRevision:revision,
   bodies:state.actors.map(a=>{const p=poses.get(a.id);return{id:a.id,plan:a.defId??'character',x:a.pos.x,y:a.pos.y,
    h:space.heightAt?.(a.pos,a.tier)??0,floor:a.tier,yaw:p.facing,r:p.radius,life:a.life,maxLife:session.stat(session.actor(a.id),'life'),
    mana:a.mana,team:a.team,dead:a.dead,anim:a.casting?'cast':Math.hypot(p.velocity.x,p.velocity.y)>1?'walk':'idle',cast:a.casting,statuses:a.statuses};}),
   shots:state.projectiles.map((p,id)=>({id,skill:p.skill,x:p.pos.x,y:p.pos.y,h:30,r:3})),zones:state.zones,
   events:session.drainSignals(),hud:{life:hud.life,mana:hud.mana,
    cooldowns:Object.fromEntries(hud.cooldowns),skills:bar().map(s=>s?.id??null)}};
 };
 return Object.freeze({session,hero,character,input,build,grant,inventory,step,
  hello:()=>({t:'hello',protocol:1,profile:'hollow-wake-sdk/1',hero:hero.id,ground:space.description?.(),rules:{unitsPerMetre:30,heightUnit:'cm'},inventory:inventory()}),
  disconnect(){if(closed)return;queue=[];seq=-1;latest={...latest,move:[0,0],held:[],hold:false};session.release(currentHero());},
  close(){queue=[];closed=true;},
 });
}
