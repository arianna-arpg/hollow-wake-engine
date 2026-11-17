import assert from 'node:assert/strict';
export function prototypeSpace(emptyCombatSpace,hostGeometry){
 const space=emptyCombatSpace();space.viewRectFor=()=>({...hostGeometry.view});
 // Empty-room form of the prototype scenery sweep. This is host geometry,
 // not a tolerance in the exact combat comparisons.
 const clamp=space.clamp;
 space.clamp=(at,radius,from,options)=>{const to=clamp(at,radius);
  return from&&!options?.disp?.ignoreConfine&&Math.hypot(to.x-from.x,to.y-from.y)<=1e-7?{...from}:to;};
 return space;
}
function difference(actual,expected,at='state'){
  if(Object.is(actual,expected))return;
  if(actual===null||expected===null||typeof actual!=='object'||typeof expected!=='object')return {at,actual,expected};
  for(const key of new Set([...Object.keys(actual),...Object.keys(expected)])){const diff=difference(actual[key],expected[key],at+'.'+key);if(diff)return diff;}
}
export function replayCombat({createCombatSession,combatContent,emptyCombatSpace,fixtures,hostGeometry,filter}){
  const savedRandom=Math.random;Math.random=()=>assert.fail('Ambient combat random');
  const failures=[];let courses=0,comparisons=0;
  try {for(const fixture of fixtures)for(const course of fixture.courses){
    if(filter&&!course.id.includes(filter))continue;
    courses++;
    try{
    assert.deepEqual(course.config.position,hostGeometry.position);
    const space=prototypeSpace(emptyCombatSpace,hostGeometry);
    const session=createCombatSession(combatContent,{space},{seed:fixture.seed}),hero=session.addActor(course.config);
    const enemy=course.target?session.addActor(course.target):undefined;
    for(const target of course.targets??[])session.addActor(target);
    const same=(index,expected=course.steps[index])=>{const diff=difference(JSON.parse(JSON.stringify(session.snapshot())),expected);if(diff)throw Error('frame '+index+': '+JSON.stringify(diff));comparisons++;};
    if(course.steps[0].action){
      for(let n=0;n<course.steps.length;n++){
        const {action,accepted,state}=course.steps[n];
        if(action.type==='spawn')session.addMonster(action.monster,action.config);
        else if(action.type==='press')assert.equal(session.press(action.actor?session.actor(action.actor):hero,action.skill,action.aim),accepted);
        else if(action.type==='release')session.release(hero);
        else if(action.type==='meta')assert.equal(session.meta(hero,action.skill,action.aim),accepted);
        else if(action.type==='timing')session.timingPress(hero);
        else if(action.type==='dismiss')assert.equal(session.dismissFrame(hero,action.skill),accepted);
        else if(action.type==='move'){
          if(action.layer!==undefined)space.stepPhysical=(_actor,to)=>({pos:{...to},tier:action.layer});
          try{session.move(action.actor?session.actor(action.actor):course.steps[n].details?hero:enemy,action.direction,action.seconds);}finally{delete space.stepPhysical;}
        }
        else if(action.type==='tactics'){
          const results=[];
          for(const a of session.snapshot().actors){if(a.id<=2||a.dead)continue;
            const ref=session.actor(a.id),result=session.summonTactic(ref,enemy,action.seconds);
            results.push({id:a.id,...result});
            if(result.movement)session.move(ref,{x:result.movement.x-a.pos.x,y:result.movement.y-a.pos.y},action.seconds);
          }
          assert.deepEqual(results,accepted);
        }
        else {assert.equal(action.type,'advance');session.advance(action.seconds);}
        same(n,state);
        if(course.steps[n].details){const actual=session.snapshot().actors.map(a=>({id:a.id,...session.details(session.actor(a.id))}));
          const diff=difference(JSON.parse(JSON.stringify(actual)),course.steps[n].details,'details');if(diff)throw Error('frame '+n+': '+JSON.stringify(diff));comparisons++;}
      }
      if(course.id==='corpse-rite-bone-offering')assert(session.snapshot().actors.some(a=>
        session.details(session.actor(a.id)).buffs.some(b=>b.id==='bone_offering')),'Corpse rite did not reach its summon');
      continue;
    }
    assert.equal(session.press(hero,course.config.skills[0].id,course.aim),course.accepted);same(0);
    for(let n=0;n<course.ticks;n++){session.advance(1/60);same(n+1);}
    session.release(hero);for(let n=0;n<3;n++){session.advance(1/60);same(course.ticks+n+1);}
    }catch(error){failures.push({course:course.id,error:error.message});}
  }}finally {Math.random=savedRandom;}
  return {passed:!failures.length,courses,comparisons,failures};
}
