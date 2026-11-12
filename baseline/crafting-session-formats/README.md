# Published crafting save formats

`published-session.ts.gz` retains the crafting implementation from SDK commit
`b101c3ff13060976edc2c2f6ec981ce2243974f5` (`0.59.0-candidate.0`), before
its command implementation moved into the internal shared core. It has the
repository's existing license. Hashes and provenance are in `acceptance.json`.

The four frozen saves exercise the public v1–v4 envelopes. They are SDK
compatibility observations, not new original-game or native-engine fixtures.
`observe.mjs` runs the retained implementation with the current content and
unchanged supporting services. The reference command requires two fresh
processes to reproduce `saves.json` exactly; it never regenerates expected data:

```sh
npm run build
node scripts/test-crafting-session-formats-reference.mjs
```

The normal crafting tests restore each frozen save, compare all saved values,
and reject conflicting version/capability combinations. Package verification
repeats those assertions through installed and browser consumers.
