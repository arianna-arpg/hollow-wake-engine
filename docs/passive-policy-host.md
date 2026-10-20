# Passive policy in the game host

Version 0.8 delegates Hollow Wake's allocation, refund, realm-root grants, realm
point credit and graft binding to the optional `@hollow-wake/engine/passives`
entry. The Inventory tree's refund preview and the actual refund command use
the same compiled policy. The isolated game retains its UI, service proximity,
account ledger, character rebuilds, companion refresh and live summon updates.

## Ownership and content revisions

`PassivePolicy.create` and `restore` still copy and strictly validate SDK-owned
state. `PassivePolicy.attach` is an explicit alternative for a host that already
owns mutable character metadata:

```ts
const state = {
  classId: 'warrior', allocated: new Set(['str_start']), choices: {}, grafts: {},
  vocations: [], passivePoints: 5, vocationPoints: 0, realmPoints: {},
};
const host = policy.attach(state);
const preview = host.quoteRefund('some_owned_node');
// Accepted mutations write through to state. The host serializes its own save.
```

The host authorizes identity, earned vocations, ledger access and wallet changes.
It supplies valid container shapes and finite safe-integer point balances. This
attachment is not a network input validator or a legacy-save migration. Retired
allocations, choices and graft records remain intact until the host deliberately
repairs them. Refunds preserve the original refusal priority for unavailable nodes.
SDK-owned restoration remains strict even though the game host supports retired
selections. Detached snapshots do not expose mutable session storage.

Containers can be replaced on save/load without reattaching. The game bridge
forwards property access to current metadata instead of making a second character
state. A weakly keyed session owns one queue and one visitation array per metadata
owner. It shares the immutable graph with other sessions. Accessors must be
synchronous, nonthrowing and nonreentrant; callers must serialize mutations.
The runtime retains no host callbacks or asynchronous work.

Content validation defaults to strict references. Explicit `{ references: 'live' }`
supports temporary authoring states with deleted roots, dangling links and missing
choice groups. It still validates identities, field schemas and existing root
domains. A missing choice group grants no invented power. A dangling allocation
edge can refer to a deleted node still held in saved state, as in the original;
refunds refuse unavailable remaining allocations. This mode is for a live editor,
not an excuse to ship unresolved content references.

`refreshSdkPassivePolicy()` invalidates both policy and grant projections after
authoring changes. The mounted editor calls it for node edits, creation, deletion
and link changes. External editors must call it at their own mutation boundary.
Sessions rebuild lazily on the next access; old immutable policies can be collected
once their owners are no longer referenced.

## Preserved host sequence

- An open realm can grant free roots and rebuild the character before a later
  purchase succeeds or fails. `ensureRealmRoots` preserves that intermediate state.
- Purchases rebuild statistics and refresh passive companions after the debit.
- Refund previews run before Font/service refusal. Actual refunds capture live
  summon bodies before changing selections, then rebuild, resync support and
  inherited power, refresh companions and mark the metadata dirty.
- Graft rebinding retains the old host identity, skips redundant rebuilds and
  resynchronizes both affected hosts through the existing game code.

These are deliberate host responsibilities. The SDK owns policy, not rendering,
service placement or summon execution. The exact source-guarded overlay refuses
unreviewed method/editor changes and validates every input before writing files.

## Verification and performance

The original implementation independently supplies 9,699 recorded commands.
Both SDK-owned and attached sessions match them. An additional original trace
records 42 complete World transitions, including intermediate callback states,
real graft support binding, co-op, saved-container replacement, retired content,
deleted roots and live summon stat changes. Expected fixtures are immutable in
normal verification. The installed-package test deliberately breaks a point debit
and requires an observable game mismatch before restoring the package.

The offline consumer imports the packed public entry and performs 277 allocation/
refund paths through each ownership mode. Source-overlay tests check LF/CRLF,
unrelated-work retention, altered-input refusal and refusal before any write.
The actual renderer courses cover attribute choices, Font refunds, grant editing,
and policy link/unlink/relink/deletion through the mounted editor.

```sh
npm run verify
npm run reference:passives
npm run reference:policy-host
npm run adapter:policy-source
npm run adapter:prepare
npm run adapter:policy
npm run benchmark:policy-host
```

Run installed-package fault checks sequentially; never build or run another game
consumer against the same installed package while a deliberate fault is active.
Renderer reproduction uses the build and isolated Electron harness documented in
[passive-grants.md](passive-grants.md), adding `--policy` to its renderer command.

On the recorded i9-10900K / Node 24.9.0 desktop, 25 alternating warm samples of
3,112 refund queries over 39 authored builds had medians of 107.896 ms original
and 38.922 ms through the actual installed game adapter (about 2.77× faster).
The one cold first-preview sample took 62.335 ms, including content projection
and graph compilation. This is not a cold-start latency distribution. Graph-walk
scratch is 12,445 bytes per owner for 2,489 nodes; total heap, allocations per
query, rendering and whole-frame latency have not been measured here.

Raw receipts live under `evidence/milestone-ten`. Steam Deck and older mobile
measurements remain pending. The previous complete character-rebuild benchmark
still showed overhead versus the original; this faster refund query does not
erase that result. Unity/Godot/Unreal integration, conduit/proc execution, vocation
earning and full progression remain separate work.
