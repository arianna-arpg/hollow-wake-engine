import {advanceConduits,validateConduitSpec} from '@hollow-wake/engine/resources/conduits';

const emptyMembership = new Set();
const readers = {specs: skill => skill.pumps, tags: () => undefined, modifiers: () => undefined};
const sheet = {get: stat => stat === 'poiseOvercharge' ? .25 : 1};
const idle = {def:{id:'idle'},pumps:[]};
const seconds = [.5,1.5];

// This host supplies the three meter gates used by the recorded builds. Missing
// gates deliberately fail if content changes to require a different resource.
class TrainingActor {
  constructor(course) {
    this.course=course;
    const skill={def:{id:course.id},pumps:course.specs};
    this.skills=[skill,idle,idle,idle,idle,idle,idle,idle];
    this.casting={mode:'guard',held:true,inst:skill,shield:49,maxShield:90};
    this.activeAuras=emptyMembership; this.summonToggles=emptyMembership; this.sheet=sheet;
  }
  availableMaxMana(){return 80;}
  maxPoise(){return 100;}
  gainPoise(n){this.poise=Math.min(125,this.poise+n);}
  damagePoise(n){this.poise=Math.max(0,this.poise-n);}
  reset(){
    const initial=this.course.frames[0];
    this.mana=initial.mana; this.poise=initial.poise; this.casting.shield=initial.shield;
  }
}

export function createDeviceCourse(courses,count) {
  if(!Number.isSafeInteger(count)||count<1||count>480)throw new RangeError('Invalid actor count');
  for(const c of courses)for(const spec of c.specs)validateConduitSpec(spec);
  const actors=Array.from({length:count},(_,i)=>new TrainingActor(courses[i%courses.length]));
  let cycles=0;
  // Each cycle uses the two original clock intervals and checks every meter at
  // both boundaries. Reset and comparison are included in the timed workload.
  return {block(){
    for(let cycle=0;cycle<8;cycle++){
      for(const a of actors)a.reset();
      for(let step=0;step<2;step++)for(const a of actors){
        advanceConduits(a,seconds[step],readers);
        const expected=a.course.frames[step+1];
        if(a.mana!==expected.mana||a.poise!==expected.poise||a.casting.shield!==expected.shield)
          throw new Error('Meter mismatch in '+a.course.id+' at step '+(step+1));
      }
      cycles++;
    }
  }, count:()=>cycles*2*count};
}
