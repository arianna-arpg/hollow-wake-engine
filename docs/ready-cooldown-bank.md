# Refund credit earned while ready

`@hollow-wake/engine/combat/ready-cooldown-bank` extracts the credit lifecycle
used by Command: Assault's Patient Signal. The original controller provides the
raw material: 35 independently repeated observations include actual command
preparation, numeric HUD state, nested refunds and six intentional failures.
The current predecessor adapter reproduces the same bytes before extraction.
Accepted observations live in `baseline/ready-cooldown-bank`; normal verification
never regenerates them.

## Contract

- `refundReadyCooldown` reduces a running clock. Only a clock already ready at
  entry can earn bank credit. Finishing a clock, including an oversized refund,
  never also banks the excess. Credit is capped using the current price and
  extra-use limit. The stamped HUD denominator is retained.
- `consumeReadyCooldownBank` returns the extra uses for an ordinary command,
  spending whole current-price units while retaining fractional and excess
  credit. A recall reads price but preserves the bank and skips eligibility.
- `publishReadyCooldownBank` publishes hits and progress through synchronous
  host callbacks. A disabled policy clears the display. Publication occurs at
  the host's original phase, after any gameplay commits.

The command and display use the original 0.1-second minimum unit. Refund banking
uses the uncapped resolved price instead. A price change can lower the refund
cap and reduce an existing bank. These operations are deliberately distinct.

The bank is a borrowed `{bank: number}` record containing seconds. Publication
also borrows its owner and host skill. Eligibility, current price and the maximum
extra uses are supplied through reusable policy ports. No scene, Actor class,
registry, time source, random source or mutable module cache is required.
See [the complete package example](../examples/ready-cooldown-bank.mjs).

Ports and getters must finish synchronously. Earlier commits remain visible if
a later write, price lookup or publication throws. Reads remain live through
nested operations; the module does not add rollback or snapshot all credit.
Typed publication callbacks return `undefined`, rejecting asynchronous handlers.
The host supplies validated finite prices and policy limits. Signed diagnostic
inputs record legacy arithmetic; they are not new authored-content permissions.

The game still owns court lifetime, recipient selection, formations, wards,
prepared-hit delivery, policy retirement and actual painting. Its guarded
adapter delegates three selected regions in `Assaults`, retaining those surrounding
operations. This capability does not establish complete Assault extraction.

## Clock ownership inventory

The [pinned inventory](../baseline/cooldown-lifecycle/ownership-v1.json) records
77 explicit ledger references in the original and 53 at the `7f7179b` adapter.
At that checkpoint, 31 direct writes belong to 18 functions:

| Owner | Direct writes | Treatment |
| --- | ---: | --- |
| Director, showcase, ultimate lab and scene director | 7 | Host tools and authored scene occurrence |
| Encounter combat | 1 | Separate absolute encounter-clock ledger |
| Channel and resource-event adapters | 2 | Already delegated SDK commands writing borrowed host stores |
| Assault refund bank | 2 | This extraction |
| Attack-sequence recovery locks | 6 | Pending sequence lifecycle |
| Challenge resets and companion-grant retirement | 3 | Pending specialized gameplay |
| Possession ejection and Hivecall return/meta | 8 | Pending possession/swarm lifecycle |
| Construct pulses and mine detonations | 2 | Pending timed-delivery lifecycle |

This is a source ownership inventory of the two named fields, not a claim about
dynamic aliases or all encounter timers. Run `npm run inspect:cooldown-ownership`
for the pinned original, or add `-- --game <isolated-game>` for another graph.
Removing a direct write does not by itself prove extraction of its owning feature.

## Verification

The runtime has 24 focused tests and 16 deliberate runtime fault controls.
Source guards reject nine altered or repeated integrations, preserve unrelated
text and newline styles, and preflight before writing. An independently installed
Node/TypeScript package completes a refund, command, expiry and publication cycle.
The module adds 1,896 bytes of JavaScript inside its separate 3 KiB allowance.
This is a package-size observation, not a throughput or allocation measurement.

```sh
npm run reference:ready-bank
npm run test:ready-bank-package
npm run test:ready-bank-mutations
npm run adapter:ready-bank -- --location <adapter-location.json>
npm run adapter:ready-bank-faults -- --location <adapter-location.json>
```

Dedicated display acceptance now covers 23 native-matching stages: empty and
fractional credit, extra hits, capacity, recall, spending, repricing, pause/resume,
policy retirement and host removal. Five deliberate SDK/paint faults are detected.
The full renderer can be rebuilt from the public test capsules; see
[renderer reproduction](renderer-reproduction.md) and
[display evidence](../evidence/ready-cooldown-bank/renderer.json).

Native-host exposure, complete Assault delivery and device performance remain
separate gates. Do not infer Unity, Godot or Unreal support from these checks.
