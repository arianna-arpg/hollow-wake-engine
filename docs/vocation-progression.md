# Vocation progression

The original game creates 92 quest steps from 31 vocation definitions. The
quartermaster checks each offer against the current character, the run ledger
and the local account. A completed chain can open the vocation’s passive root.
The [acceptance record](../baseline/vocation-progression/acceptance.json)
identifies the captured engine files, observations and faults by hash.

## Who owns each decision

- The host supplies authored definitions in registry order, current progression
  policy and live ledgers. Generated steps share their original zone reference.
  A secret vocation’s offer and turn-in share the same list of givers.
- Odyssey progression, available vocation slots, class, prior run steps, secret
  discovery and account unlocks all affect the offer. Account step credit
  alone cannot satisfy a previous step. Expanding the live character cap
  can open another choice while a repeated grant remains closed.
- The recipient’s character gains the vocation and passive root. Run unlock
  credit increases by one. When the local mode permits account progression,
  durable unlock credit is set to one. A sealed Undying local character still
  receives run credit. For a second seat, the recipient controls character
  changes while the local mode controls account writes.
- Recalculation, dirty notifications and the two announcements happen in
  source order. Synchronous reentry sees the first grant. If a callback throws,
  the earlier character and ledger writes remain visible.

## Reproduce the boundary

After installing the SDK development tools, prepare the source capsule and
reference tooling. Run the following commands in the SDK checkout.

```text
npm run reference:prepare
npm run reference:install
npm run build
node scripts/test-reference-vocations.mjs
node scripts/test-vocation-source-faults.mjs
```

Use `node scripts/test-reference-vocations.mjs --location .artifacts/adapter-location.json`
to run the same observers against an isolated installation. Each result must
match the pre-extraction bytes. The survey evaluates 256 labelled states for
each of the 92 steps and observes 14 grant scenarios. A second fixture follows
the real three-step Warbringer chain in mortal and sealed runs. It exercises
a stale menu choice, quest acceptance, turn-in, repeat refusal and the final
unlock. The fixture supplies the completed field objective. Physical discovery
sites, field combat and the general quest reward engine have separate boundaries.

The sixteen source fault controls change individual gates, identity, durable
credit, root selection or callback order. They must change the expected
observation for the intended reason. The stored game fixtures are the
authority for both the standalone package and the game adapter.
