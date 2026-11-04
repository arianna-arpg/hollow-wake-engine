import {Engine,CastRuntime,TimedDamage} from '@hollow-wake/engine';

/** Synthetic zero payment keeps the five cast-speed groups continuously active.
 * The host applies a resolved timed effect on each completed cast. */
export function createLifecycleWorkload(pack,definition,count) {
  const engine=new Engine(pack,12345);
  const skill=engine.skill({id:'ruin',level:1,sockets:0,treePoints:0});
  const actors=Array.from({length:count},(_,i)=>{
    const character=engine.character({classId:'magician',passivePoints:1});
    character.sheet.setSource('cast-rate',[{stat:'castSpeed',kind:'more',value:(i%5)/10}]);
    const profile=engine.castProfile(character,skill);
    profile.cost={mana:0,life:0};
    profile.cooldown=.5;
    return {character,profile,cast:new CastRuntime({mana:100,life:100}),
      dot:new TimedDamage(definition),target:engine.target({life:1e9})};
  });
  let completions=0,ticks=0,checksum=0;
  function frame(){
    for(const actor of actors){
      if(!actor.cast.busy&&actor.cast.useLock<=0&&!actor.cast.cooldown(skill.definition.id))actor.cast.press(actor.profile);
      const event=actor.cast.advance(1/60);
      if(event?.kind==='completed'){
        completions++;
        checksum+=engine.resolveHit(actor.character,skill,actor.target).damage;
        actor.dot.apply(10);
      }
      if(actor.dot.present){
        ticks++;
        checksum+=actor.target.receiveDot(actor.dot.advance(1/60),'fire');
      }
    }
  }
  const read=()=>({completions,ticks,checksum,planBuilds:engine.planBuilds});
  return {frame,read};
}
