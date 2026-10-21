# Casting and timed-effect contract, v0.2

The portable runtime accepts resolved numbers and explicit commands. It does not
require a scene, entity component system, renderer, wall clock, storage provider,
global random source or a database. Each actor owns one `CastRuntime`; each
bearer/effect owns one `TimedDamage`. Immutable content can be shared.

## Ordinary casting

`engine.castProfile(character, skill)` quotes the validated build's mana/life
cost, cast-speed-adjusted use time and cooldown. The lower-level `CastProfile`
also accepts host-resolved values. It supports ordinary casts only. Reload,
concentration, channels, guard casts, charges and advanced payment schemes are
separate capabilities, not extra fields to silently ignore.

The optional [charged casting entry](charged-casting.md) now supplies the admitted
charge-up and overcharge phases over host-owned state. Its staged payments and
release rules do not expand the ordinary `CastRuntime`'s accepted profiles.

The optional [interactive casting entry](interactive-casting.md) adds focus
progress/break decisions and repeated-input timing over borrowed records. Its
terminal outcomes require explicit host cleanup and delivery; it retains no
cast registry or callback queue.

`press(profile, gates)` returns a rejection or a token-bearing started/completed
event. It checks host blocking/stun/death, actor life, an existing cast, recovery,
the skill clock and resources. A successful press pays once. A life payment must
leave positive life. It copies/freezes the accepted profile. Later build changes
do not move that bar. Use time at or below 0.001 s completes instantly; other
ordinary bars last at least 0.2 s.

`advance(dt, frame)` advances cooldowns first, recovery second, and casting last.
The host supplies nonnegative finite simulation time, current global or per-skill
cooldown rates, stun/death, and optionally a newly priced completion cooldown.
The cast's quoted cooldown is the fallback when no new quote is supplied. An
instant cast completes during `press`, so its quote is its completion price.
Blocking is a press gate; it does not cancel an existing cast. Use `cancel` for
host interruption, silence or other explicit aborts. Ordinary button release has
no cancellation effect. Cancellation retains payment and any press-stamped clock.

Completion clears active state before returning its event. The host launches the
payload once, identified by actor identity plus cast token. Replaying host-side
events across a save/load boundary requires the host's usual delivery ledger;
tokens alone are not distributed exactly-once delivery. The kernel never calls
host callbacks while changing state. The game adapter keeps native callbacks,
including `onLifeSpent`, at their original boundary.

Recovery is 0.12 s after instant execution and 0.1 s after a bar. Original timer
overshoot is retained: a positive recovery clock may become negative on its last
tick. Clocks at zero or below permit another action. Cooldowns disappear at zero.
No active clock or pending event history grows without a bound: cooldown storage
defaults to 128 entries; each admitted cast reserves one available slot even if
its initial completion price is zero. Capacity errors precede payment.

Resources belong to the casting instance. A host that also changes life/mana
must synchronize them with `setResources` before the next command. Character
maximums and casting current resources are deliberately distinct. Cast snapshots
store time, resources, recovery, active quote/progress, clocks and the next token.
They reject incompatible versions and invalid active state. They do not store
the host's aim, projectile, target, build, random state or effect instances.

## Burning

`content/burning.json` contains the authored four-second strongest-wins effect.
`apply(dps, durationScale, expiryRate, sourceId)` accepts an already authorized,
resolved application. Duration is base × scale / expiry. A strictly stronger
application replaces DPS and remaining duration; weaker/equal applications leave
both alone. First-applier credit remains, even after a stronger replacement.
Separate bearers, areas or source-key groups need separate effect instances.

`advance(dt)` returns raw damage and expires the effect. Its named timing policy,
`hollow-wake-frame/v1`, pays DPS × stacks × the **whole frame**, including expiry
overshoot. Four seconds advanced in one five-second step pays five seconds of
damage; four seconds followed by one second pays four. This reproduces the source
and is intentionally frame-partition dependent. Hosts should use a stable
simulation step. A future elapsed-time policy must have a different identity and
an explicitly reviewed balance change. Zero-duration applications remain until
the next tick, as in the original.

The tick path allocates no damage receipts or history. The host owns mitigation,
death, stacking of other statuses, leech, rupture, cleansing and presentation.
`Target.receiveDot` supplies the tested plain-defender law: damageTaken applies;
armor and elemental resistance do not. Shields, weak spots and other advanced
defenses remain native. Firebolt's full authored definition is preserved in the
baseline; its packaged arithmetic projection does not implement proc chance or
ailment scaling. The example labels its host-resolved Burning application.

## First game adapter

`adapters/hollow-wake/integrate.mjs` applies reviewed exact replacements only to
known source hashes. All guards run before source writes. It reuses original
Actor/CastState/ActiveStatus storage, avoiding per-frame JSON copies. The bridge
imports the installed `@hollow-wake/engine/hollow-wake` entry point for ordinary
payment, duration, bar advancement, cooldown ticking, strongest Burning refresh
and Burning ticks. Existing host gates, interrupts, callbacks, projectile launch,
cooldown stamping, status metadata and advanced cast modes stay with the game.
The adapter is a transitional integration, not a second portable World engine.

An installed-package mutation test disables bar completion and requires the
actual game's trace to change. This detects a bridge that merely imports the
package while continuing to calculate everything locally.

Unity/Godot/Unreal packaging is not implemented. The next native-host decision
must measure embedding versus a native/Wasm kernel, including installation,
batched call cost, memory, debugging and target-platform support. Keep the
numeric/content conformance suite authoritative whichever implementation wins.
Avoid copying per-entity JSON every frame across a future native boundary;
snapshots are for persistence/testing, while live adapters should share or batch
compact state and return bounded completion/effect results.
