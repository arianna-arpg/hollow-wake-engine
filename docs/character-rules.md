# Character creation, mastery kits, and class unlocks

Version 0.41 adds three optional imports. A host can use any one of them independently. Each module operates on the supplied character, class definition, or account. The host owns its roster, save backend, deed counters, and display.

| Import under `@hollow-wake/engine/character/` | Behavior |
| --- | --- |
| `identity` | Create the two independent attribute records and opening for a new character. Restore names, openings, mode, stage and durable identity from current or older saves. Distinguish discovered, pending and selectable classes. |
| `kits` | Present owned mastery choices, apply an explicit or remembered opening, seat grant skills in free slots, and discard obsolete selections. |
| `claims` | Settle earned class entries in catalogue order until no new door opens. Grant skills and supports, retain pending discoveries, and activate a class on acknowledgment. |

A minimal game can keep mastery and character state in ordinary JavaScript records.

```js
import {createClassIdentity} from '@hollow-wake/engine/character/identity';
import {resolveClassKit} from '@hollow-wake/engine/character/kits';

const fighter = {
  id: 'fighter', name: 'Fighter', attributes: {might: 4},
  bar: ['swing', null],
  kit: [{tier: 'novice', replaces: 'swing', skill: 'arc'}]
};
const account = {
  unlockedClassTiers: new Set(['tier_fighter_novice']),
  kitPicks: {fighter: {swing: 'arc'}}
};
const hero = createClassIdentity(fighter, resolveClassKit(account, fighter));
// hero.opening is ['arc', null]. Editing the hero leaves fighter.bar intact.
```

### Creation and restoration

Use `findSavedClass` against the current registry before rebuilding a save. A missing class returns `undefined`. The original game refuses that resume. A missing saved opening falls back to the class bar. An explicit empty opening stays empty. Empty IDs mint a new one through the host callback. Existing IDs survive. Attribute records contain scalar attributes and are shallow copied. Skill handles remain host-defined, including numeric zero.

### Choice and ownership

Use `kitChoicesFor` when drawing a card and `kitHasOptions` when only a yes/no answer is needed. Both read the current tier set. Only valid non-base choices are remembered. Kit maps use own string keys, including custom IDs that coincide with JavaScript object properties.

`settleClassClaims(catalogue, account, view, ports)` passes the host's optional merged deed view to its visibility check. A successful grant clears the prior investment, applies the reward, and marks a class pending. The grant port must synchronously establish lasting ownership. The SDK reports a broken grant contract before it can award the same class again in a sweep. Saving the resulting account and presenting any notices remain host operations. The Vault uses `activateClassClaim` for acknowledgment.

### Hollow Wake verification

The player-facing course enters Mu, swaps Cleave for Carve, names and wakes the Warrior, unlocks Ranger in the Vault, reloads from disk, and clicks Continue. It verifies the returned character ID, bar, opening, and account ownership. It supplies the qualifying deeds and mastery tiers. The headless suite also exercises all 39 classes and both orders of settlement for the 36 earned classes. [Original observations and reproduction commands](../baseline/character-rules/README.md)

The Hollow Wake installer previews all five source edits before writing. On interruption it restores its own changes in reverse order. If an external edit or lock prevents restoration it retains the originals and identifies their directory. The installer is for a disposable checkout of the pinned game. Other hosts use the three public imports.

The package has no engine dependency. Secret vocation sites, class-specific combat, mercenary scaling, legacy gem-investment reconciliation, and complete save-format migrations have separate boundaries. Timing on physical Steam Deck and older mobile devices remains open.
