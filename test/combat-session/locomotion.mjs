import assert from 'node:assert/strict';

export function verifyLocomotionCourses({fixture,content,createCombatSession,emptyCombatSpace}) {
 let observations=0;
 for(const c of fixture.courses){
  let frame=0;
  // The original probe's positive levitation override is a host morphology
  // fact. It is not an authored registered stat. The public native-body flag
  // enters the same original `levitates || sheet.get('levitation') > 0` rule.
  const {levitation,...stats}=c.stats??{};
  const session=createCombatSession(content,{space:emptyCombatSpace(1600,1200),
   environment:()=>frame++===0&&c.status?[{actor:1,status:c.status,dps:0,magnitude:1,source:'reference-ground'}]:[]},{seed:c.seed,capacity:16});
  const hero=c.monster?session.addMonster(c.monster,{team:'player',position:c.start??{x:400,y:400}}):session.addActor({
   name:'Hero',team:'player',position:c.start??{x:400,y:400},controlled:true,levitates:levitation>0,stats:{life:10000,mana:10000,...stats},
   skills:c.skill?[c.skill]:[],attributes:Object.fromEntries(Object.keys(content.hitQueries.ATTRIBUTES).map(id=>[id,100]))});
  session.addActor({name:'Target',team:'enemy',position:c.enemySkill?{x:370,y:400}:{x:900,y:400},stats:{life:10000,mana:10000},skills:c.enemySkill?[c.enemySkill]:[]});
  for(let i=0;i<c.steps.length;i++){
   const step=c.steps[i],a=step.action;
   if(a.type==='advance')session.advance(a.dt);
   else if(a.type==='move')session.move(hero,{x:a.direction[0],y:a.direction[1]},a.dt);
   else if(a.type==='press')assert.equal(session.press(session.actor(a.actor),a.id,a.aim),step.accepted,c.id);
   else if(a.type==='release')session.release(hero);
   const actual=JSON.parse(JSON.stringify({...session.snapshot(),pose:session.pose(hero)}));
   assert.deepEqual(actual,step.state,`${c.id}: ${i} ${a.type}`);observations++;
  }
 }
 return {courses:fixture.courses.length,observations};
}
