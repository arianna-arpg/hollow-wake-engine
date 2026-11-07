# Durable gear crafting stations

The Godot inventory's **Crafting & salvage** dialog completes the path from
authored quotes through payment, item mutation, expertise and durable recovery.
It supports pack and worn gear for affix crafting, socket addition and natural
affix rerolls; breaking down gear requires pack custody. Existing protection,
capacity and station rules remain authoritative.

The host supplies the currently observed station access and displayed inventory
revision. Changing either after a quote can refuse confirmation. A successful
reroll protects its result from further rerolls, as in the original game. The
sample uses the original unassisted score of zero; crafting challenge input is
still an embedding-game responsibility.

Quotes use the optional `crafting-station/v1` capability and are requested only
when the dialog opens, changes mode or changes its 32-option page. They consume
no randomness and never authorize payment. The dialog reuses its controls.
There are no new frame-time content/database scans. The native bundle still uses
the existing 32 MiB heap cap and shared immutable content tables.

The coordinator saves complete SDK continuation and stash in one revisioned
SQLite slot through the existing bounded worker. It retains the last durable
view while pending. A failed write reloads the exact authoritative item, wallet,
account and random state. An unpaid Oracle reroll advances randomness before
payment under the original rules: the coordinator saves this continuation and
then reports the refusal. Retrying after a transport failure is never automatic.

The query costs 406 bytes in the measured minified base bundle (103,658 bytes).
Its explicit ceiling rises from 101 to 102 KiB. The session module is 22,641
unminified bytes; its ceiling rises from 22 to 23 KiB. This is a feature-size
tradeoff, not a speed improvement or proof of a Steam Deck/mobile frame budget.

Verification uses original-game price and salvage fixtures, real Godot controls,
the installed native SDK, competing SQLite writers, restart and relocated
release players. The station course covers paid crafting/socket/reroll, salvage
expertise, shared capacity, protected choices, revoked access, stale selection,
duplicate confirmation, failed-write recovery and unpaid RNG continuation.
Five deliberate adapter/UI faults must be rejected. Eighteen independent SDK
session contracts and fourteen SDK faults cover the underlying command boundary.

Reproduction uses `scripts/prepare-station-course.mjs <fixture.json>`,
`scripts/build-profile-view-overlay.mjs <overlay> --stations`, then
`scripts/verify-background-workshop.py` with `--crafting-addon <overlay>` and
`--station-course <fixture.json>`. Run `scripts/check-station-faults.py` against
the resulting verified delivery; `--render` adds a 960×600 visual capture on
Windows. These scripts clean their isolated projects on success and failure.

The legacy project builders also include the new preloaded scripts. Their
historical receipts do not qualify a new build: run their native/editor checks
again when using those paths. Current desktop evidence is separate from hosted
Godot import, physical-device performance, power-loss durability and other engine
packages. The full SDK completion inventory remains partial.
