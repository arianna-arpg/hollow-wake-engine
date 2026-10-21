# Focus and timing casts

The optional `casting/interactive` entry supplies concentration progress and
break decisions, focus-duration and fizzle-clock quotes, and repeated-input
timing attempts. These are synchronous operations over caller-owned state.
They retain no actor registry, random stream, callbacks or event queue.

## Host phase contract

The host authorizes and pays for a cast, resolves its target, quotes its duration
once, and attaches the active record. Actor clocks and stun interruption run
before the focus update. The original game also owns quarry lookup, visibility,
AI aim tracking, target identity and its coordinate system. `focusWithinReach`
compares a supplied nonnegative distance with radius plus slack; the default
slack of 30 is in the host's units, not an assumed meter scale.

`advanceFocusCast` advances only while the button remains held and the host says
the quarry is focused. On focus loss it applies the live cancel, partial-release
or drain policy. A partial release includes the configured minimum fraction
(default 0.25), uses already-earned progress, and ignores the release frame's
duration. Drain defaults to the same speed as filling. Releasing the button
abandons a draining cast immediately. Reacquiring focus resumes the same bar.
Completion retains elapsed overshoot but delivers a multiplier of exactly one.

Ongoing updates return `undefined`. Full completion and fizzle return immutable
shared values; a partial release returns one small value. There is no temporary
completion closure on every focus frame. These structural properties are not
an allocation or device-performance budget.

On a terminal result the host must clear the active record and set 0.15-second
recovery before delivery or fizzle handling. A fizzle clears AI completed-cast
recovery credit, emits its cue, and stamps both the cooldown and its UI total
when the base cooldown is positive. `focusFizzleCooldown` quotes the original
skill-to-global recovery ratio with a 0.1 floor. A successful delivery retains
its native cooldown policy. Stun interruption follows the separate host cleanup
path and does not become a fizzle.

The functions do not remember whether a result was delivered. Calling the focus
update again on an ended record can return another outcome: clearing/removing
that record is the host's responsibility. Persistence includes active state and
the host's skill, aim, quarry, paid-cost and cooldown data; these helpers alone
are not a complete save format or delivery ledger.

## Timing input

The host records input authority before `pressCastTiming`. Perfect timing accepts
a fraction of at least 0.72; timed casts accept distance at most 0.08 from the
stored marker. Each consumes its single attempt even when it misses. The bonus
is supplied live, so changing a support can affect the bonus without changing
the cast mode already stored on the bar. Successful presses return `perfect`
or `flawless`; the host emits that cue and then the `flawless` trigger event.
Multitude casts increase their repeat count from a default one, capped at 15.
Other modes and already-used timing attempts make no state change.

Timing input does not complete the cast. The existing ordinary bar progress and
host delivery path consume its stored multiplier or repeat count when the bar
ends. No randomness is consumed by this entry; marker creation and AI input
decisions retain their existing host authority.

## Strict inputs and preserved observations

Public arithmetic rejects nonfinite numbers, negative time/progress terms,
unknown break policies and nonpositive focus totals or speed. Host-supplied
global cooldown recovery must be positive, as it is in the original stat schema.
The helpers borrow live state and do not promise transactional rollback if a
later invalid input is discovered after an earlier field has changed.

The original concentration phase can deliver after caster death if the host
calls it with a still-focused active record. Death cleanup remains host-owned;
this extraction does not silently add a different death rule. The original
admission path refuses a missing quarry before payment when a targeting spec
exists, but an incorrectly authored concentration skill without targeting can
pay before its later refusal. The adapter preserves that observation; content
validation and admission policy remain separate work.

## Verification scope

Original-game observations include both authored focus skills, all seven authored
timing skills, both timing support grafts, target eligibility changes, partial
release thresholds, live policies/bonuses, fizzle clocks, early/repeated input,
multitude limits and real interruption. Tame Beast actually creates a companion;
Transfixing Gaze actually damages and marks its target. Standalone phase checks
are supplemented by continuous game courses with original native payments,
triggers, cues and deliveries.

The source adapter guards the original focus case, timing-input method and
duration expression before applying changes. Shared admission, other cast modes,
cleanup, target acquisition, native payloads and native-engine packages remain
outside this capability. Desktop measurements and package/renderer acceptance
are recorded separately; no Steam Deck or older-mobile result is implied.

## Measured desktop workload

Two fresh installed-package comparisons use 64 real actors, split between focus
and perfect timing, over 128 updates of 0.025 seconds each. Actual admission is
outside timing. Target availability breaks and restores focus; explicit timing
presses, native payments, triggers, cues and projectile delivery execute. Five
warmups precede 25 rotating samples. Complete derived outputs agree; setup and
equality checking are excluded, while result projection and a progress checksum
are included equally.

The candidate's cast-phase medians were 4.5920 and 4.4514 ms, versus 5.9728 and
5.9955 ms for v0.20: an improvement of about 23–26%. The original game measured
5.9703 and 5.7690 ms. Including actor timers gives 46.0704 and 46.0616 ms, versus
47.7724 and 47.9626 ms for v0.20, an improvement of about 4%. The original measured
43.3679 and 43.2040 ms in that combined workload; the candidate still trails it
by about 6–7%. Earlier extraction overhead outside this phase remains a target.
These are desktop Node measurements, not allocation/GC, renderer, whole-frame,
native-engine or Steam Deck/mobile budgets.
