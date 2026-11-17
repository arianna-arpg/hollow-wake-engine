# Hollow Wake combat reference player

Node owns combat and character investment. Godot 4.7.2 renders host state and
sends movement, aim, cast and build commands over localhost TCP. No Foundation
checkout, generated world, quest book, account or persistence coordinator is needed.

From the SDK checkout, build with `npm run build` and then
`node scripts/build-node-godot.mjs --out <new-directory>`. The output contains
five local package archives, this example host and a Godot project.

For the November prototype parity profile, use
`node scripts/build-node-godot.mjs --prototype --out <new-directory>`.
The release manifest selects this profile explicitly; omitting the switch in
the development builder retains the October regression profile.

Ordinary input also accepts optional `meta` and `dismiss` skill-ID arrays and a
boolean `timing` press edge. The host checks authored eligibility. An
`{"t":"inspect"}` request returns detached skill/buff sources, frame/pact/doctrine
state and semantic field/projectile cues. Request these when needed; they are
not copied into every movement frame. Inspection shares the eight-per-second
build/save request budget. Rendering these facts remains the client's job.

In that new directory:

1. Run `npm install --offline --ignore-scripts --no-audit --no-fund`.
2. Run `npm start` (Node 22 or 24).
3. Open `client/project.godot` in Godot 4.7.2 and run the scene, or run
   `godot --path client`. The default port is 47120.

Windows can instead run `./Play.ps1 -Godot <path-to-Godot.exe>` after installing.
Use WASD to walk, the mouse to aim, and 1–8 or left-click to cast. The Inventory
panel previews and applies equipment, support and passive changes. The marked
ramp connects the two example floors; the wall blocks walks and projectiles.

The default **Save character** button writes only to a host-owned memory store.
For the optional file example run
`node host/serve.mjs --save-file <host-selected-character-file>`.
This stores character investment, not a live combat/world/account snapshot.
The host selects the path; clients cannot supply paths or grant rewards.

To inspect a particular authored effect, run
`node host/serve.mjs --skill <skill-id>` (or `Play.ps1 -Skill <skill-id>`).
This creates a native training body with generous resources and attributes.
Inventory investment is disabled for that native body. Effects requiring an
unprovided world service fail explicitly at setup; the reference does not invent
portal travel, weather, geography or campaign systems to satisfy them.

The adapter's `createNodeCombatHost` accepts a replaceable `space` provider and
either a memory-only character or a trusted native encounter body. It never
accepts a client-supplied pose, timestep, item grant, quest reward or account.
Replace the reference floor with the existing game's Ground/delivery services;
keep SDK ownership of movement restrictions, resources, casts and effects.

Use the compatibility renderer for this small scene. Its successful export is
integration evidence, not a Steam Deck/mobile performance qualification.
The Node sidecar runs on desktop hosts; mobile requires a separately qualified
deployment arrangement. Unity and Unreal are not qualified by this example.
