# Milestone four: generated items through equipment

Version 0.4 extracts item rolling, forging, local/global modifier derivation,
unique choice migration, sockets and epitaphs, using all captured item definitions.
An optional runtime entry and separately packaged data avoid eager loading into a
combat-only consumer. `Character.equipInstance` connects generated values to the
existing attribute/stat/skill path and includes equipped instances in save/restore.

Verification includes 26,404 original item calculations, 1,658 complete captured
drops and random counts, 1,230 mint/forge option cases, a continuous 1,500-operation
mixed stream and a real World equip/replace/remove path. Independent tests cover
continuation, aliasing, invalid input, content/version ownership, custom zero-sided
caps and rejected unsupported equipment mechanics. A clean offline package consumer
mints an item, carries/saves it, equips it and resolves a hit with ambient RNG,
browser globals and network calls disabled.

All 79 bases and 59 uniques are represented. Of 3,929 affixes, two have no currently
eligible carrier (`block`, `crit_pct_local`); their definitions are preserved but
are not described as reference-exercised. Other affix cases cover first/last tiers
and minimum/midpoint/maximum rolls. The complete original item pipeline remains
the source of expected outputs; ordinary test commands cannot regenerate fixtures.

The weighted-pool refactor improves the measured drop-plus-compilation batch from
6.15 ms in the original to 1.93 ms in the SDK on the desktop. The initial extracted
implementation was slower; both before/after reports are retained. Full content
loading remains around 183 ms and is recorded as an optimization opportunity,
not hidden by hot-path timings. See [item-contract.md](item-contract.md).

The combined package now has separate budgets: 96 KiB unminified JS for the core,
64 KiB for optional item modules, 160 KiB combined. The original small executable
content budget remains 64 KiB. The large item definitions are a separate package.
An import-graph check prevents the core entry from eagerly importing item modules.

Reproduce:

```sh
npm ci
npm run verify
npm run reference:prepare
npm run reference:install
npm run reference:verify
npm run reference:items
npm run items:build
npm run benchmark:items
```

The existing actual-game adapter still delegates casting and timed-effect arithmetic.
The full item roller/compiler has not yet replaced the original game's live item
system. Its mutable authoring registries need an explicit refresh/ownership boundary
before retaining compiled content. Item-related trade/equipment/account policies,
advanced effect execution, native packages and target-device validation remain work
under the full SDK goal; they are not implied by passing item arithmetic tests.
