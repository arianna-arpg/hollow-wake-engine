# Fresh hosted checkout prerequisites

The first broad hosted run after the Unity milestone exposed three missing
setup steps that the existing developer workspace had masked:

- [Owned crafting sessions](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/42407771872)
  failed on both Windows and Linux before creating a consumer because
  `.artifacts` did not exist. The package test now creates its parent directory.
  The [unlock workflow](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/42407772059)
  had the same independent prerequisite omission and receives the same fix.
- [The main package suite](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/42407771870)
  reached unlock adapter checks without a prepared `.reference` tree. Each
  package matrix job now prepares the pinned reference before verification.
- The same workflow's reference-adapter job reached a compiled equipment
  import before `dist` existed. It now builds before running adapter checks.

These changes prepare inputs required by the existing checks. Assertions,
accepted gameplay fixtures and the Unity package remain unchanged. Initial
hosted failures are not accepted results; successful reruns must be recorded
separately before publishing the preview.

The [embedded-host workflow](https://github.com/arianna-arpg/hollow-wake-engine/actions/runs/42407771805)
also stopped at the isolated item-index experiment's source guard. Its pins
predated crafting, item inspection, immutable table sharing and vestige
delegation. Review of the complete source diff from `ef55ece^` found changes
to helper exports, optional pre-folded own stats, epitaph delegation and
immutable content copying; the affix-pool algorithm and replacement sites
were unchanged. The experiment now pins the exact current item core/rules
bytes. Its replacement assertions, accepted outcomes and native/cost controls
remain required. This rebases an isolated experiment; it does not adopt its
index in the production runtime or establish a new performance result.

Pool and bitmap-boundary probes now call the actual compiled
`affixPoolsFor` export. Crafting had already exposed this operation, making
the old private-export source injection obsolete. Each import first checks
its compiled-byte hash. Ordered membership, pool isolation, identity/RNG
and bitmap boundary assertions are retained.

[Local reruns](hosted-setup-local.json) pass all 1,579 unit contracts for
each candidate, 430 ordered-pool queries per candidate, 197 bitmap boundary
queries, owner checks, native replay and 20 cost-control cases per variant.
The native cost fixture was rebuilt after stale receipt checks correctly
refused older tooling/runtime hashes. These are untimed verification runs;
production runtime files and the Unity tarball are unchanged.
