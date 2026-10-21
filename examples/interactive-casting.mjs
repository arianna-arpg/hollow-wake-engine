import {payCast, advanceCastProgress} from '@hollow-wake/engine';
import {pressCastTiming, advanceFocusCast, focusCastDuration, focusFizzleCooldown} from '@hollow-wake/engine/casting/interactive';

/** Minimal explicit host. Input authority, target focus and completion delivery
 * are host decisions; the SDK owns the quoted clocks and progress/timing laws. */
export function interactiveCastingCycle() {
  const actor = () => ({mana:20, life:10, recovery:0, cooldown:0, cast:null});
  const focus = actor(), timed = actor(), deliveries = [], cues = [];
  const spec = {time:2, onBreak:'drain', drainRate:1};
  let fizzles = 0;
  const startFocus = () => {
    payCast(focus, {mana:6,life:2});
    focus.cast = {elapsed:0,total:focusCastDuration(spec.time,1),held:true};
  };
  const stepFocus = (dt, quarryFocused) => {
    if (!focus.cast) return;
    const result = advanceFocusCast(focus.cast,spec,dt,quarryFocused);
    if (!result) return;
    focus.cast = null; focus.recovery = .15;
    if (result.kind === 'release') {
      deliveries.push({kind:'focus',power:result.multiplier,active:focus.cast!==null});
      focus.cooldown = 2;
    } else {
      fizzles++;
      focus.cooldown = focusFizzleCooldown(2,2,1);
    }
  };
  startFocus(); payCast(timed,{mana:6,life:2});
  timed.cast = {mode:'perfect',elapsed:0,total:1};
  stepFocus(1,true); advanceCastProgress(timed.cast,.72);
  for(let attempt=0;attempt<2;attempt++){
    const cue = pressCastTiming(timed.cast);
    if(cue)cues.push(cue); // One successful input event, even after two attempts.
  }
  stepFocus(.25,false); // Broken focus drains but remains active.
  if(advanceCastProgress(timed.cast,.28)){
    const power=timed.cast.empowered??1;timed.cast=null;timed.recovery=.1;timed.cooldown=2;
    deliveries.push({kind:'timing',power,active:timed.cast!==null});
  }
  stepFocus(1.25,true); stepFocus(1,true); // Clearing prevents duplicate delivery.
  // A new authorized use after the host's cooldown/recovery gate has cleared.
  focus.cooldown=0;focus.recovery=0;startFocus();stepFocus(.5,true);
  focus.cast.held=false;stepFocus(0,true); // Abandoning retains payment and stamps a fizzle clock.
  return {deliveries,cues,fizzles,resources:{focus:[focus.mana,focus.life],timed:[timed.mana,timed.life]},cooldowns:[focus.cooldown,timed.cooldown]};
}
