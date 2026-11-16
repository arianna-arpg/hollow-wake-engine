import assert from 'node:assert/strict';

/** Same public API course in source and physically isolated installed consumers. */
export function verifyLifecycleCourses({fixture,content,createCombatSession,emptyCombatSpace,procs=false}) {
 let observations=0;const mismatches=[];
 for(const course of fixture.courses){try{
  const space=emptyCombatSpace(1600,1200);space.viewRectFor=body=>body.frameLockRect??course.view;
  if(course.wallAt){const clamp=space.clamp;space.clamp=(at,radius,from,options)=>{
   const out=clamp(at,radius,from,options);if(out.x>course.wallAt-radius){out.x=course.wallAt-radius;if(options?.out)options.out.hit='wall';}return out;
  };}
  let worldRequests=0;
  const fields=procs?{vent:(...args)=>{
    const expected=course.environment[worldRequests++];assert(expected,'Unexpected environment request');
    assert.equal(expected.randomDraws,0,'Environment must not consume combat randomness');
    assert.equal(expected.service,'vent');assert.deepEqual(args,expected.args);return expected.result;
  },lightwell:(...args)=>{
    const expected=course.environment[worldRequests++];assert(expected,'Unexpected environment request');
    assert.equal(expected.service,'lightwell');assert.deepEqual(args,expected.args);return expected.result;
  }}:undefined;
  let environmentFrame=0;
  const environment=course.environmentFrames?()=>structuredClone(course.environmentFrames[environmentFrame++]):undefined;
  const session=createCombatSession(content,{space,fields,environment},{seed:course.seed,capacity:16});
  const skills=[...new Set(course.skills.map(id=>id.replace('meta:','')))].map(id=>({id,...(course.supports?.[id]?{sockets:[{id:course.supports[id]}]}:{})}));
  const hero=session.addActor({name:'Hero',team:'player',position:course.heroAt??{x:400,y:400},controlled:true,stats:{life:10000,mana:10000,...course.stats},resourceFraction:course.heroFraction,skills,
   attributes:Object.fromEntries(Object.keys(content.hitQueries.ATTRIBUTES).map(id=>[id,100]))});
  if(course.monster)session.addMonster(course.monster,{team:'enemy',position:{x:440,y:400},resourceFraction:course.fraction});
  else session.addActor({name:'Target',team:'enemy',position:course.targetAt??{x:440,y:400},stats:{life:10000,mana:10000,...course.targetStats},resourceFraction:course.fraction});
  const executed=[];
  for(const [team,positions]of [['player',course.allies??[]],['enemy',course.targets??[]]])for(const position of positions)
    session.addActor({name:team==='player'?'Ally':'Other',team,position,stats:{life:10000,mana:10000}});
  for(let i=0;i<course.steps.length;i++){
   const step=course.steps[i],action=step.action;
   if(action.type==='press'||action.type==='meta'){
    const controlled=session.controlled(hero)??hero;session.aim(controlled,action.aim);
    assert.equal(session[action.type](controlled,action.id,action.aim),step.accepted,course.id+' '+action.id+' step '+i);
   }
   else if(action.type==='advance')session.advance(action.dt);
   if(procs)executed.push(...session.drainSignals().filter(row=>row.kind==='proc').map(row=>row.detail));
   const actual=JSON.parse(JSON.stringify({...session.snapshot(),controlled:session.controlled(hero)?.id,effects:session.effects(),...(procs?{procs:session.procs(),procExecutions:executed,worldRequests}:{})}));
   try{assert.deepEqual(actual,step.state);observations++;}catch(error){mismatches.push({id:course.id,step:i,actual,expected:step.state,message:error.message});break;}
  }
 }catch(error){mismatches.push({id:course.id,error:error.stack});}}

 return {courses:fixture.courses.length,observations,mismatches};
}
