# Applying a build to a current character

`@hollow-wake/engine/character/rebuild` exports `CharacterRebuild`. It composes
the existing `BuildContributions` and `EquipmentSkills` services into the live
rebuild sequence. This is the first part of milestone 2; the complete admitted
character command interface and three composed build courses remain required.

The host supplies the character's current body, owned learned skills, equipment,
containers and an authorized relic projection. It supplies the same content
services used by private previews. The SDK then:

1. Folds attributes, passives, worn items and active containers into current stat
   sources, preserving unrelated temporary combat sources.
2. Derives companions, ordinary grants, bonuses and grafts using current skill
   identities. A replaced or lost grant retires its own aura/summon effects through
   explicit synchronous host callbacks.
3. Updates level sources, clamps current life then mana to their current maxima,
   synchronizes guard state and refreshes bonded companions, in that order.

The rebuild does not restore a combat snapshot or install a private preview.
Valid casts, cooldowns, clocks and random streams remain current. Ordinary build
changes do not refill resources. XP level-up behavior may explicitly refill them
after rebuilding through the separate progression policy.

```ts
const rebuild = new CharacterRebuild({
  contributions, // BuildContributions with this content revision
  equipment,     // EquipmentSkills with this content revision
  levelModifiers,
});
rebuild.rebuild(currentCharacterFrame);
```

The service stores only its rules ports; a frame and its actor/item/skill graph
are borrowed for the call. Rebuild work runs when inputs change, not on each hit.
No account, quest, ledger, database, save acknowledgement, renderer or world
generation service is required. Host entitlement decisions and body selection
remain outside the rule engine.

This low-level live entry accepts already admitted state. It does not authorize
spending, validate arbitrary imported characters or make live callbacks atomic.
Use one writer and synchronous completion callbacks. If a callback throws,
earlier live changes remain applied, matching the original rebuild; do not retry
the whole call as though it rolled back. The upcoming character owner must
reject invalid commands before invoking live application.

The isolated Hollow Wake adapter replaces only the exact reviewed rebuild
sequence after the existing passive, equipment and contribution integrations.
It preserves the original host's body selection, relic authority and status relay.
It changes no production game checkout. The installed-package course reuses
the frozen original contribution and paid-cast observations, with independent
resource/identity/order checks and deliberately broken implementations.

Run `npm run test:character-rebuild-package` after building. No physical-device
performance or complete Unity/Godot/Unreal package qualification is implied.
