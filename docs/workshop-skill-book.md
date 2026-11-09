# Optional workshop skill book

`@hollow-wake/engine/skills/workshop-book` exports `WorkshopSkillBook`.
Supply `new WorkshopSkillBook(items)` as the optional rack provider to
`CraftingSession`, or as `rack` in `AccountWorkshopSession` definitions.
The provider composes the existing learned-skill, support and vestige policies.
It adds no runtime dependency, eager core import, database query or frame loop.

This is an owned **build-data** capability. The opt-in embedded entry at
`adapters/embedded/skill-book-session.mjs` exposes `workshop-skill-book/v1` through
the existing shared-account text transport. The default embedded entry and
published Unity/Godot equipment packages keep their existing provider.

## Ownership and saves

The new `crafting-session/v4` state contains:

```ts
skillBook: {
  known: Array<{ gem: SkillGemPayload; locked?: true }>;
  bar: Array<string | null>;
}
```

`known` owns up to eight unique learned payloads in insertion order. `bar` has
exactly eight positions; each non-null ID refers to one known skill and occurs
at most once. Payloads retain sockets, rolls, investment and locks under the
existing gem admission rules. A bar edit never transfers custody of a gem.
`rack` and `skillBook` cannot coexist. Unresolved IDs, duplicate bindings,
unknown fields and malformed payloads refuse admission before opening a profile.

Existing v1/v2/v3 states retain their format until an explicit
`{op:'promote-skill-book', profile}` command. Promotion is idempotent and moves
the existing rack payloads into the learned book, preserving their binding
positions, wallet, inventory, random continuation and next item ID. Saves that
already contain a valid book open directly as v4. Old providers refuse v4 with
`skill-book-unavailable`; there is no implicit downgrade that could lose skills.

**Intentional new-format behavior:** v4 restore preserves empty bar positions
exactly. The original game's legacy character resume fills vacancies in learned
insertion order. That original helper and the legacy rack remain unchanged.
Explicit promotion makes this difference visible and reversible at the host's
save-selection boundary; it is not a claim of byte-for-byte legacy save parity.

## Commands and events

| Command | Fields besides `op` and `profile` | Behavior |
| --- | --- | --- |
| `promote-skill-book` | none | Move legacy rack ownership into v4. |
| `bind-skill` | `slot: 0..7`, `skillId: string \| null` | Bind a known skill, clear a position, or toggle off the same skill already there. |
| `swap-skill-slots` | `a: 0..7`, `b: 0..7` | Use the extracted action-bar swap policy. |

Binding an unknown ID returns `accepted:false` without changing state. A swap
between two empty positions is accepted but unchanged, with no events.
Binding an already empty position can still emit the extracted handoff even
when `changed` and `needsSave` are false. Hosts must inspect events independently
of the save flag. `changed` describes an actual binding change.

Existing learn/unlearn commands use the same extracted custody policy for both
formats, including replacement of a same-ID off-bar copy, capacity, holds,
bag-space refusal, returned wrapper order and item-ID consumption on a failed
unlearn. Existing support commands can address learned skills off the bar.
Vestige commands remain available. These commands still require the host's
authoritative requirements and support-fit observations.

`remember-skill-slot` contains a touched skill ID and its resulting slot, or
`-1` when it is off the bar. `bar-rebound` contains distinct touched skill IDs.
These are observations for the host, not authorized shared-account preference
writes or executed combat effects. The host must apply ownership and eligibility
policy before changing preferences. It must also consume the handoff when it
implements live actor publication. Calling unused live-effect ports from this
build-data provider throws instead of silently skipping effects.

Every command works on a private candidate. State and reply must both validate
before publication. Shared-account prepare/save/abort/commit retains two
independent workshop books, rejects stale tokens, and leaves account state
unchanged for these binding commands. A retained provider draft or a thrown
provider callback cannot alter committed rows.

## Verification and scope

Run `npm run test:workshop-skill-book-package` after building. It installs the
packed archive offline, runs eleven ownership contracts, repeats them through
a browser bundle with ambient host access disabled, checks public TypeScript
types, injects eight deliberate faults, and reruns the restored control.
Temporary consumers and caches are removed even on failure.

`test/workshop-skill-book-entry.test.mjs` exercises the opt-in embedded entry
through a 32-step text course. The native reproduction command is:

```text
node scripts/verify-workshop-skill-book-native.mjs --runtime QUALIFIED_RUNTIME --python PYTHON --output NEW_OUTPUT_DIRECTORY
```

It verifies the qualified Windows x64 runtime receipt, rebuilds the entry from
source, compares all 579 frozen predecessor replies, then compares the new
32-step course through the native ABI. It records heap/allocation observations
and complete inputs; it does not regenerate the frozen predecessor answers.
The new course uses independent assertions for its newly introduced behavior.

The module has a separate 6 KiB unminified JavaScript cap. The browser workshop
composition has a 192 KiB minified code cap. These bound delivered code; they
do not establish frame time, process memory or a physical-device result.

Equipment-granted bindings, shared preference mutation and live combat actor
publication remain separate integration work. In particular, pending durable
writes must not rewind casts, clocks, resources or random draws in a live actor.
This capability does not yet expand Unity/Godot/Unreal package admission or
qualify Steam Deck, Android or iOS hardware.
