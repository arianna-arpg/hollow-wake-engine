# Unlock lifecycle extraction boundary

## Original observations

The original source capsule supplies expected behavior. The acceptance fixtures
under `baseline/unlock-lifecycle` are captured before this extraction and retain
the original defects as observations. Ordinary verification reads those fixtures.
Changing an expected result requires a separate compatibility decision.

The scope covers ownership, visibility, structural prerequisites, discovery
reveals, partial investments, completion, repeated services, memory rewards,
legendary awakening, and remote access views. Existing class claims, gem-pool
serialization, mastery rewards, progression gates and relic investment modules
remain shared dependencies.

The policy fixture includes all 190 static entries, 107 package entries,
mixed ownership, pending discoveries, merged ledger views, reveal boundaries,
debug visibility and active-class-count boundaries. Transactions include all
32 mastery rungs, retry attempts, partial funding and explicit malformed input.
Memory observations include actual skill/support definitions, every eligible
reward at a weighted interval midpoint, interval boundaries, tunable access
policies, custom receipt IDs, and synchronous random-source callbacks.

## Ownership and execution

The SDK will own unlock decisions and state transitions over a caller-owned
account. The host supplies input events, presentation, persistence and authority
to execute a purchase. Account state and receipt dictionaries belong to that
account. Time and randomness enter explicitly where the operation needs them.

Content is separate from account state. A validated content package can own
immutable definitions, catalogue indexes and reusable eligibility metadata.
The compatibility adapter must honor the original game's late registrations
and mutable development settings. Reusing a cached table requires an explicit
immutable-content or revision boundary.

Reward selection retains catalogue order, multiplication order, summation order
and subtractive selection at interval boundaries. The eligible weighted pool is
observed before invoking the random source. A callback that changes account
state or configuration therefore cannot retroactively change that pool.
Exceptions from the random source propagate before the outer reward is granted.
Nested synchronous grants remain observable through receipt order.

Receipt data and account collections remain independent of any rendering engine.
The same serializable definitions can be imported by engine-specific package
tooling. Mutable runtime state is kept separate from shared content.

## Explicit compatibility repairs

These decisions govern the extracted implementation. The raw original fixtures
remain available alongside independent assertions for the repaired behavior.

- Purchase input that would introduce a nonfinite currency or investment value
  is refused before spending. Ordinary finite flooring, clamping, partial
  investment and mastery progression retain their observed rules. A positive
  infinity spending request requires an explicit decision per existing service,
  because ordinary and relic services currently treat it differently.
- Investment and receipt dictionaries use own-property reads and safe writes.
  A content ID such as `__proto__` is a literal key. It cannot inherit a balance,
  change the dictionary prototype or disappear during serialization.
- Memory service completion uses the reward definition's receipt ID.
  An offer may have a distinct display or catalogue ID.
- Legendary awakening requires an actual skill definition. Inherited object
  members such as `constructor` cannot grant phantom skills.
- A receipt sequence must be a nonnegative safe integer with room for the next
  increment. An invalid or exhausted sequence refuses a grant before random
  consumption or account writes. This prevents repeated indistinguishable
  receipts.
- Weighted selection requires a finite positive total. A zero or overflowing
  total refuses a grant before random consumption. Authored content validation
  also rejects nonfinite weights.

The implementation must enumerate resulting differences by named scenario
and prove each repair with independent assertions. A counted source-fault
detection must produce a complete changed observation. Controls must still
match after the original source has been restored.

## Data layout and engine packages

Authoring tables can provide relationships, validation and editing tools.
Shipping content should be compiled into immutable runtime tables with stable
identifiers and prebuilt indexes. The performance comparison will include
construction cost, repeated queries, grants and retained memory. Steam Deck
and older mobile device acceptance requires physical-device measurements.

This design draws on documented mechanisms. Unreal supports imported
Data Tables for related authored records and separates Gameplay Effect
definitions from application state. Unity's blob assets provide immutable,
shareable data in a memory-ready representation. Godot resources provide
reusable data containers with path-based loading and caching.
These mechanisms inform the content boundary and engine adapters.
[Unreal data tables](https://dev.epicgames.com/documentation/unreal-engine/data-driven-gameplay-elements-in-unreal-engine),
[Unreal Gameplay Effects](https://dev.epicgames.com/documentation/en-us/unreal-engine/gameplay-effects-for-the-gameplay-ability-system-in-unreal-engine),
[Unity blob assets](https://docs.unity.cn/Packages/com.unity.entities%401.3/manual/blob-assets-concept.html),
[Godot resources](https://docs.godotengine.org/en/stable/classes/class_resource.html).

## Acceptance checks

- Frozen original observations and reproducible source-fault controls.
- Standalone SDK purchase and reward paths through the packed package.
- Named, independently asserted differences for the compatibility repairs.
- Guarded game adapter installation, failed-install recovery and retry.
- Game types, smoke, account save/restore and relevant Vault interactions.
- Native-host replay and scoped performance measurements.
- Hosted Windows and Linux verification of the published artifacts.

## Reproduction

Run the commands from the SDK checkout after preparing and installing the
reference capsule.

```sh
node scripts/test-reference-unlock-lifecycle.mjs
node scripts/test-unlock-lifecycle-source-faults.mjs
```

The first command checks all three fixtures, observer types, original method
fingerprints and source preservation. The second checks 32 unlock faults and
40 memory faults, including positive controls before and after mutation.
The GitHub workflow repeats these checks on Windows and Linux.
