# Adopting the combat and Inventory SDK

The current prototype targets [combat-inventory-v0.2.0-preview.1](https://github.com/arianna-arpg/hollow-wake-engine/releases/tag/combat-inventory-v0.2.0-preview.1).
Its qualification is tracked in [prototype parity](prototype-parity.md); use it
after its verified release is published. Extract
`hollow-wake-combat-inventory-0.2.0-preview.1.zip` into a new project folder and
follow the included README. No source-game folder or npm registry publication
is involved. The release's five archives are a matched set; copy their
`package.json` dependencies and `packages/` directory when starting another
Node project. Install with `npm install --offline --ignore-scripts --no-audit --no-fund`.

The downloadable bundle is a verified integration starting point. Its Node
process owns simulation; its Godot client draws detached state. Existing Unity
and Unreal previews are preserved, but this release does not qualify the full
SDK inside those engines. See [compatibility](sdk-compatibility.md).

## Character-to-combat ownership

`quickstart.mjs` in the release is executable documentation. It loads the
immutable character kit once, creates a character, connects it to
`createNodeCombatHost`, mints a trusted item, previews/applies equipment, casts,
and admits exported character investment. No storage acknowledgement is needed.

For a direct simulation without the sample network host, construct
`createCombatSession(combatContent, {space: yourSpace}, {seed})` and call
`addCharacter(kit, character, placement)`. A character has one live owner.
After attachment, publish accepted proposals with
`combat.commitCharacter(hero, proposal)`, rather than committing through a
second live owner. The Node adapter's `build` and `grant` do this for you.

| Intent | Public entry | Game responsibility |
| --- | --- | --- |
| Create/admit a build | `createCharacterKit`, `kit.create`, `kit.admit` | Supply the matching content and authorized external projection |
| Inspect Inventory/build | `character.inspect`, `character.item`, `character.export` | Render detached views; retain stable authored IDs |
| Edit or preview | `character.prepare` / `preview`, or `host.build(command, {preview:true})` | Authorize station/refund conditions and publish at a simulation boundary |
| Award XP, points, items, Vocation or external projections | `character.authorize`, or `host.grant` | Decide entitlement in trusted code; never accept a client reward claim |
| Cast/move/time | `press`, `release`, `move`, `advance`, or host `input` / `step` | Validate input, own the clock and provide physical facts |
| Summon commands and timing | `meta`, `dismissFrame`, `timingPress`, or host input `meta` / `dismiss` / `timing` | Bind authored action IDs; present action/refusal state |
| Authored summon tactics | `summonTactic` followed by host navigation and `move` | Supply perception/target decisions and resolve movement intents |
| Inspect live summon/effect state | `details`, `visuals`, or `host.inspect` | Request on demand; render detached data without mutating the simulation |
| Render consequences | `snapshot`, `poses`, `drainSignals`, or detached host frames | Map authoritative IDs to graphics, audio and UI |
| Close | `host.close` / `combat.close` | Release the session and its host listener/resources |

The included comparisons cover items, supports, skill investment/awakening,
passives/Vocations and Reliquary contributions together with live casts. The
small sample UI demonstrates only equipment/support/passive controls; an adopted
game builds its own Inventory presentation over the same APIs.

## Replace the training room incrementally

1. Keep the included reference running while introducing the game's input and
   rendering adapter. Preserve message ordering and authoritative IDs.
2. Replace `createReferenceSpace` with the existing collision, layer, reach and
   projectile facts described in [host services](sdk-host-services.md). Replay
   the game's wall, ramp, floor-crossing and contact cases before widening use.
3. Supply trusted encounter bodies and optional environmental/world-effect ports.
   Missing services are explicit refusals; do not silently skip those effects.
4. Bind the game's Inventory to preview/publication and trusted grants. Keep
   current casts, resources and cooldowns owned by the session during build edits.
5. Choose a storage port only if needed. Pair detached data with its content ID
   and current external entitlement/relic projection. Live fight recovery and
   cross-account transactions are separate contracts.

For `D:/Games/Hollow-Wake`, retain the existing Node/Godot split and the existing
Ground/delivery providers. SDK story layers are not raw terrain column indices.
This release does not install itself into that evolving project or modify its
generation, campaign, account or save architecture.

## Optional extensions and upgrades

Quests, persistence and account orchestration are separate explicit exports in
the engine package. Presence in the archive is not a dependency: release
verification physically removes 66 optional runtime/declaration files and runs
the required courses. No database query belongs in a combat step.

Keep the release manifest with adopted content. Take upgrades as a matched set,
rerun `npm run verify`, then replay the consuming game's spatial and input cases.
Treat public declarations and documented entry points as the supported boundary;
diagnostic continuation records and private embedded implementation details are
not newly stabilized by packaging them. Do not automatically absorb changes to
the original game's content capture.

Use the portable measurement kit on the actual target device before assigning
frame-time or memory budgets to the complete game. Its desktop results exclude
rendering, socket encoding/transport, battery use and sustained thermals.
