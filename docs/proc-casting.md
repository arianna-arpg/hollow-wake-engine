# Triggered skill casting

`@hollow-wake/engine/combat/proc-casting` provides `createProcCasting` and
`heldProcSkill`. This is the complete triggered-payload and held-copy policy
from the frozen proc boundary. The optional [effect dispatcher](proc-delivery.md)
uses this service for the cast effect.

The caller has already admitted the proc or rider. `cast` selects its definition,
captures its site, draws its count, resolves ownership and delivers each payload.
It returns false for a missing definition or a nonpositive count. It does not
charge resources, start cooldowns or recursively repeat ordinary casting.
The host still supplies actual skill execution and projectile creation.

## Identity, time and randomness

A held bar instance wins over a seated grant, which wins over a seated learned
copy. A missing seat cannot expose an unseated learned skill. Ownership lookup
is optional and lazy. A held instance is reused by identity, including its live
sockets, level and existing chain depth. For each synthetic occurrence, the host
factory receives the captured level and chain depth and returns a fresh instance.
The SDK passes that value unchanged,
so it can be a class instance with private state or a numeric handle into host
tables. Hollow Wake’s binding retains its original shallow-copy construction
and depth stamp. Effective level and cast multiplier are captured once for the
invocation. The optional held-copy helper reads instances through a host query;
the casting service itself imposes no bar array or instance-object layout.
Zero-valued handles and scalar positions are valid. Missing instances use `null`,
missing aims use `undefined`, and missing seats use `null` or `undefined`.

The count draw occurs even for a fixed range. A projectile cast consumes a ring
phase draw even when using a zero-width fan. The service uses only the supplied
random ports; the host owns stream state, seeding and continuation. There is no
wall clock, scheduler, global registry or pending-work queue in this module.

All calls are synchronous. Earlier deliveries remain committed when a callback
throws, and later deliveries stop. Reentry uses independent invocation locals.
The implementation removes the original per-invocation payload closure while
retaining the required fresh payload and option objects. This is a structural
allocation reduction, not a measured frame-time or device-performance claim.

## Geometry and delivery

Positions and directions are generic host types. `copyPosition` owns the copy;
`direction`, `rotate` and `ringDirection` map the policy into the host's projectile
plane. Rotation offsets are radians. A 3D host may use vectors and quaternions
without exposing those conventions to the content schema.
Geometry operations must preserve their input positions and bearings. A later
shot in the same fan uses the bearing captured before its first shot.

Target-anchored payloads capture the target site. Otherwise an aim supplies the
centered delivery site unless `at` is `self`. Unanchored projectiles leave the
caster's hand, even when an aim selected a distant centered site. A self origin
does not erase the target's role in selecting projectile bearing.

Projectile occurrences share the captured launch-position object. Centered
deliveries share their origin but receive separate `targetInfo.pos` copies.
These ownership details matter when synchronous host callbacks mutate data.
After each anchored spawn, `lockLastProjectile` locks the host's current last
projectile against the anchor indefinitely. This deliberately includes a nested
spawn's last projectile; changing it to lock a returned spawn handle would be a
separate gameplay decision.

The host's definition, geometry, factory and random ports must implement the
documented operation without inserting unrelated gameplay phases. The delivery
ports may execute gameplay, reenter the service or throw.

## Integration and verification

The Hollow Wake adapter replaces only `castProcPayload` and `heldSkillInst`,
preserving their observable World forwarding methods. Replacement checks the
complete frozen method hashes before writing. It refuses symbol collisions and
repeat installation. The two capabilities have separately guarded source methods.

The original behavior was frozen before this runtime existed: 328 courses cover
147 authored procs, all 22 effect shapes, actual projectile travel, live changes
and deliberate callback failures. Original replay and all 63 source faults passed
on both Windows and Linux at commit `87a3928` in
[the baseline workflow](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/41149897701).
That workflow validates the original baseline; it does not validate this runtime.

Use `test:proc-casting-package` for an independent installed package, public 3D
types and browser build; `test:proc-casting-mutations` for deliberate runtime
faults; and `adapter:proc-casting-source` for replacement guards. The installed
game comparison runs the entire frozen proc boundary, including dispatcher
branches which remain in the host. Frozen expected outputs are never regenerated
by these commands.

The installed SDK reproduced all 328 original courses byte for byte. Its 27
independent tests detected 32 runtime faults. Seven focused controls and eight
faults exercised the installed runtime and its game adapter. The existing native
full-attack replay also matched all 150,608 numeric observations between the
original and installed games through C, C++ and .NET. The separate browser
import measured 2,485 bytes. [Windows validation](../evidence/proc-casting/runtime-windows.json)

The casting installation and its fault checks also passed on Windows and Linux
at the published extraction commit. [Hosted casting verification](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/41859576909)

Dedicated native casting APIs, measured frame workloads and physical Steam Deck
and mobile measurements remain open.
