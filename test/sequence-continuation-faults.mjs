// Deliberate semantic faults; each must reach an independent assertion.
export const packageFaults=[
  {
    "name": "lost-retired-state",
    "from": "retired:source.retired",
    "to": "retired:false"
  },
  {
    "name": "cast-alias-duplicated",
    "from": "const found=casts.get(source);if(found)return found;",
    "to": "const found=casts.get(source);if(false && found)return found;"
  },
  {
    "name": "rain-clock-reset",
    "from": "rainAt.set(target,owned.rainAt.get(source)!)",
    "to": "rainAt.set(target,0)"
  },
  {
    "name": "catch-count-reset",
    "from": "caught:source.caught,retired:",
    "to": "caught:0,retired:"
  },
  {
    "name": "recovery-clock-reset",
    "from": "({...r,cast:cast(r.cast),projectile:projectile(r.projectile),",
    "to": "({...r,elapsed:0,cast:cast(r.cast),projectile:projectile(r.projectile),"
  },
  {
    "name": "receipt-keeps-live-target",
    "from": "{...source.receipt,target:actor(source.receipt.target)}",
    "to": "{...source.receipt,target:source.receipt.target}"
  },
  {
    "name": "source-key-reminted",
    "from": "policy:source.policy,key:source.key",
    "to": "policy:source.policy,key:\"reminted\""
  },
  {
    "name": "owned-buffs-lost",
    "from": "retired:source.retired,buffs:ownedBuffs",
    "to": "retired:source.retired,buffs:new Map()"
  },
  {
    "name": "publish-before-fallible-mapping",
    "from": "const recoveries=owned.recoveries.map",
    "to": "destination[sequenceContinuationState]({...runtime,states:ownedStates}); const recoveries=owned.recoveries.map"
  },
  {
    "name": "active-casts-lost",
    "from": "casts:ownedCasts,active,recoveries,scheduled,",
    "to": "casts:ownedCasts,active:new Set(),recoveries,scheduled,"
  }
];
export const gameFaults=[
  {
    "course": "private-cast",
    "name": "retired-cast-revived",
    "from": "retired:source.retired",
    "to": "retired:false"
  },
  {
    "course": "private-cast",
    "name": "variant-cast-alias-lost",
    "from": "const found=casts.get(source);if(found)return found;",
    "to": "const found=casts.get(source);if(false&&found)return found;"
  },
  {
    "course": "private-cast",
    "name": "live-controller-owner-retained",
    "from": "owner:actor(source.owner),host:skill(source.host)",
    "to": "owner:source.owner,host:skill(source.host)"
  },
  {
    "course": "private-cast",
    "name": "live-receipt-target-retained",
    "from": "{...source.receipt,target:actor(source.receipt.target)}",
    "to": "{...source.receipt,target:source.receipt.target}"
  },
  {
    "course": "private-cast",
    "name": "source-counter-restarted",
    "from": "serial:owned.serial,continuationImported:true",
    "to": "serial:0,continuationImported:true"
  },
  {
    "course": "private-flight",
    "name": "flight-clock-bank-discarded",
    "from": "rainAt,deferredContacts,serial:",
    "to": "rainAt:new WeakMap(),deferredContacts,serial:"
  },
  {
    "course": "private-flight",
    "name": "flight-clock-retains-live-projectile-key",
    "from": "rainAt.set(target,owned.rainAt.get(source)!)",
    "to": "rainAt.set(source,owned.rainAt.get(source)!)"
  },
  {
    "course": "private-flight",
    "name": "absent-receipt-slot-materialized",
    "from": "casts.set(source,target);return target;",
    "to": "target.receipt ??= undefined; casts.set(source,target);return target;"
  },
  {
    "course": "private-flight",
    "name": "active-flight-cast-lost",
    "from": "casts:ownedCasts,active,recoveries,scheduled,",
    "to": "casts:ownedCasts,active:new Set(),recoveries,scheduled,"
  },
  {
    "course": "private-flight",
    "name": "flight-controller-keeps-live-owner",
    "from": "owner:actor(source.owner),host:skill(source.host)",
    "to": "owner:source.owner,host:skill(source.host)"
  },
  {
    "course": "private-recovery",
    "name": "recovery-retains-live-target",
    "from": "target:r.target?actor(r.target):undefined",
    "to": "target:r.target"
  },
  {
    "course": "private-recovery",
    "name": "recovery-retains-live-marker",
    "from": "marker:r.marker?actor(r.marker):undefined",
    "to": "marker:r.marker"
  },
  {
    "course": "private-recovery",
    "name": "recovery-retains-live-projectile",
    "from": "projectile:projectile(r.projectile)",
    "to": "projectile:r.projectile"
  },
  {
    "course": "private-recovery",
    "name": "recovery-breaks-cast-alias",
    "from": "cast:cast(r.cast)",
    "to": "cast:{...cast(r.cast)}"
  },
  {
    "course": "private-recovery",
    "name": "scheduled-repeats-dropped",
    "from": "active,recoveries,scheduled,",
    "to": "active,recoveries,scheduled:[],"
  },
  {
    "course": "private-recovery",
    "name": "scheduled-aim-retains-live-object",
    "from": "inst:skill(j.inst),aim:aim(j.aim)",
    "to": "inst:skill(j.inst),aim:j.aim"
  },
  {
    "course": "private-recovery",
    "name": "recovery-elapsed-clock-reset",
    "from": "...r,cast:cast(r.cast)",
    "to": "...r,elapsed:0,cast:cast(r.cast)"
  },
  {
    "course": "private-deferred",
    "name": "deferred-target-retains-live-actor",
    "from": "projectile:projectile(c.projectile),target:actor(c.target)",
    "to": "projectile:projectile(c.projectile),target:c.target"
  },
  {
    "course": "private-deferred",
    "name": "deferred-projectile-retains-live-carrier",
    "from": "projectile:projectile(c.projectile),target:actor(c.target)",
    "to": "projectile:c.projectile,target:actor(c.target)"
  },
  {
    "course": "private-deferred",
    "name": "deferred-contacts-discarded",
    "from": "rainAt,deferredContacts,serial:",
    "to": "rainAt,deferredContacts:[],serial:"
  },
  {
    "course": "private-deferred",
    "name": "deferred-cast-associations-discarded",
    "from": "states:ownedStates,casts:ownedCasts,active,",
    "to": "states:ownedStates,casts:new WeakMap(),active,"
  },
  {
    "course": "private-deferred",
    "name": "delayed-opening-retains-live-state",
    "from": "state:state(j.state),inst:skill(j.inst)",
    "to": "state:j.state,inst:skill(j.inst)"
  }
];
