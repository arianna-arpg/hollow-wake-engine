# Skill admission: original baseline and extraction boundary

Status: original observations accepted. The admission candidate and its live-host
contract are described in [skill-admission.md](skill-admission.md). Public v0.25
remains the resource-payment milestone until the admission release gates pass.

## Evidence authority

The raw authority is the pinned game's `Actor.canUse`, `unmetGate`,
`primedPourOpen`, `tagsForbidden`, `canAct`, `isReflex`, `reflexOpen` and
`gatherReleasable`, together with their real `World` callers. Commit
`88e135e6c85d301ee7c0c3641f9fc2f92be0e140` and the captured unfinished-file
overlay remain unchanged. The SDK v0.25 control is commit
`b625fa80bb563a7e54e3daf5529f3beab4bba4f0`.

`baseline/milestone-thirty/acceptance.json` records 126 actor courses with 129
observations and 11 native World courses with 114 transitions. Each was exported
twice from the original, then matched byte-for-byte by the installed v0.25 game.
Both exporters type-check in both implementations. No admission candidate supplied
an expected result. The helpers retain their historical investigation labels;
the acceptance record supersedes those labels without rewriting raw observations.

The actor courses inject explicitly recorded native and synthetic definitions and
state. They observe ordered method calls, resource/bank changes and the identity
of the first authored gate returned. The World courses use real query, press and
update paths for reloads, reflex flasks, guard combinations, triggers, summons,
reserves and status-qualified targets. Their corpse course proves that polling
leaves the minion alive while an actual press can sacrifice it. They are not a
mounted Inventory/input test, a complete save test, or hardware measurements.

Reproduce after `reference:prepare` and `reference:install`:

```sh
npm run reference:admission
```

This command verifies pinned source and helper/fixture hashes, independently runs
the original, and compares complete output bytes. It never rewrites expectations.

## Three distinct questions

| Operation | Meaning and ownership |
| --- | --- |
| `Actor.canUse` | Ordered actor eligibility, including a possible lazy ammunition-bank creation. This is the primary extraction target. |
| `World.skillUsable` | Supplementary HUD readiness: triggers, seals, pools, gates, charges and qualified targeting. It does not include every actor refusal. |
| `World.pressUsable` | Judges the skill a press becomes, including reload, mimic and queued combo redirects. Host-owned redirect/identity authority remains explicit. |

`World.useSkill` performs additional authority and dispatch: cast seals, held-body
restrictions, trigger toggles, attribute requirements, conversions, target selection,
interruptions, resource spending and actual delivery. Its prerequisite note can
precede `Actor.canUse`. Returning true from an actor query is not permission to
skip that pipeline. Corpse targeting must not be resolved by a render poll.

## Required behavior

Actor admission is an ordered short-circuit decision:

1. Refuse replenishing deliveries and status-forbidden tags.
2. Resolve body readiness, held combinations and the reflex exception. Held
   combinations require instant use and guard/channel/charge/overcharge; a normal
   cast bar is not a hold. A reflex may pierce it under the live reflex policy.
3. Apply recovery locks, cooldown/gather-release rules and required guard stance.
4. Handle active aura, persistent-summon and strobe off-switches before later
   costs/gates. Aura debt and a life-lock can still refuse. Earlier body/cooldown
   restrictions still apply.
5. Check ammunition, reserve fuel/venting and invocation runes.
6. Resolve cost and affordability, prerequisites, charge costs and pool minimums.
7. Price persistent-summon reservations using resolved delivery, actual slots and
   the reservation freed by rival exclusive contracts. Retain the legacy
   `manaReserved` exception.

An absent ammunition bank stays absent after early body/cooldown refusal. A later
price refusal can leave a newly created bank. Positive fractional banks admit;
empty banks refuse unless empowerment/vent rules exempt them. The previously
extracted ammunition validator remains authoritative for malformed specifications.
Queries must not become blanket atomic transactions or universally pure previews.

First-prerequisite selection preserves authored order and object identity. Gauge
refusals instead create the original note object. A gauge's feed lock does not
itself forbid a press when the existing bank meets the firing floor. Within an
authored gate, charge, buff, holding, resource, missing-resource, guard, active-skill
and recent-damage checks retain their original order and inclusive thresholds.

Missing life uses raw maximum life; missing mana uses available maximum mana;
missing shield uses maximum shield. The `any` thirst rule checks life or mana,
not shield. A primed pour needs a restore-over-time effect, instant use, floored
free capacity and a relevant pool less than one point short of full. An `any`
prime needs both life and mana full. A real dent below a percentage floor remains
a refusal. Thirstless is a separate exemption.

Context construction is also behavior. Status refusal uses
`skillContextTags(inst)`, which does not implicitly append all socket-granted tags.
Reflex-stat evaluation uses the original raw-definition context. Do not merge
these into one eagerly computed tag set. Read current definitions, sockets,
reflex policy, reservations and stat sources at their original decision points.

## Runtime boundary

Use an instance-owned or immutable stateless policy with explicit host ports and
borrowed actor records. Share immutable authored definitions; keep mutable actors,
banks, cooldowns and casts separate. Never retain host engine objects globally or
copy a whole actor/build into a new eligibility packet for every query.

The SDK owns the decision ordering and numeric comparisons. Existing resource
policies supply charge-cost and ammunition validation at their original points.
The host supplies
skill resolution, coherent live stat/context reads, status metadata, ammunition
bank access, payment affordability, gauge terms and summon capacity/reservation
observations. Existing extracted policies should provide those observations when
available. Lazy bank creation is a named mutation, not a hidden generic read.

Host ports execute synchronously. Authoritative state/content must remain coherent
during a query except for explicitly allowed lazy bank creation and internal read
caches. Do not assume rollback if a later port throws. Preserve reference identity
and collection insertion order where observed. Avoid shared mutable scratch and
unbounded caches. A database is not required for these live decisions; validated
authored rows and pre-resolved runtime data remain separate from player state.

Internal method-entry traces are diagnostic, not a promise to keep the original
call graph. A refactor may eliminate forwarding calls or temporary closures, but
must document how comparisons project those traces and retain state/results,
first-refusal identity, lazy mutations and effectful host-port ordering. Never
drop trace fields merely to hide a discrepancy.

## Completion gates for this extraction

These gates define full extraction acceptance. Completed and pending checks for
the current implementation are recorded in the
[candidate checkpoint](../evidence/milestone-thirty/candidate-verification.json):

- Implement the reusable policy and independent arithmetic/order/error tests.
- Guard overlays against both pinned original code and inherited ammunition
  delegation, retaining prior validation and unrelated game changes.
- Compare the installed candidate against these observations, with deliberate
  faults for early-return order, lazy creation, gate identity and native wiring.
- Exercise a clean packed consumer and mounted game input/HUD paths.
- Benchmark complete actor-query and native-use workloads against original and
  retained v0.25. Report regressions; measure allocation before claiming its removal.
- Preserve original files/index and validate the managed adapter before publication.

No engine plugin, target-device suitability, speedup, full combat completion or
stable public admission API follows from accepting this baseline.
