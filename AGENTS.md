# Hollow Wake Engine

Read `docs/boundary-contract.md`, `docs/milestone-one.md` and `docs/verification.md`
before changing runtime behavior. This is a separate repository from the game.

- Preserve authored content and observed behavior unless an explicit decision records a change.
- Keep production code host-independent and free of runtime dependencies. No browser shims,
  global random replacement, filesystem, engine objects or shared mutable registries.
- Run `npm run verify` before committing runtime changes. Run `npm run reference:verify`
  after source-equivalence or content-extraction changes. Performance claims require
  `npm run benchmark` with other CPU-heavy work stopped.
- Expected fixtures are produced by the pinned original implementation. Normal tests
  must never regenerate accepted results. Record intentional baseline revisions separately.
- `scripts/extract-stat-sheet.mjs` records the original mechanical extraction. The
  extracted source is now maintained directly; the script refuses to overwrite it.
- Never commit `node_modules`, `dist`, `.reference`, `.cache` or `.artifacts`.
  Reproduction overlays and accepted evidence under `baseline` are intentional source material.
- Keep runtime and schema changes reversible. No unrequested relicensing or package-registry publication.
- A clean Node consumer is not evidence of Unity, Godot, Steam Deck or mobile support.
- Coordinate ownership before working concurrently. Stage only owned paths and inspect
  the staged diff. The original game's index and checkout remain untouched.
