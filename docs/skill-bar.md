# Skill bar ownership

`@hollow-wake/engine/skills/bar` exports `SkillBarActions`,
`restoreSkillSlotMemory`, `rememberSkillSlot` and `planSkillSlots`. It handles
binding, swapping, the ordered rebuild handoff and remembered slot preferences.
The optional module has no runtime dependency or content registry.

The bar holds references to learned or equipment-granted skill instances.
Binding preserves the learned book and item investment. Resolution is an
explicit port; Hollow Wake uses its learned-first equipment lookup. Bind a
known ID to another slot to move it, or bind it to its current slot to clear
that binding. Duplicate IDs are cleared before the selected instance is
assigned. Swapping exchanges exact references; two empty slots succeed without
callbacks. These policies expect validated slot inputs from one writer.

## Bodies and callback order

The hero owns the build even while the player controls another body. `hero`
and `actor` are separate ports. Binding and swapping use the hero's bar. After
remembering touched skills and rebuilding the seat, the handoff deduplicates
exact skill identities, clears departed flask fields on the controlled body
and resynchronizes supports. This preserves the original possession behavior,
including its controlled-body check for flask field retirement.

World entry points remain in the adapter, so existing host observers still see
the original calls. A bind remembers the previous occupant before writing the
bar; its rebuild handoff remembers touched instances again. A callback failure
retains earlier writes. Use a private candidate for an operation that must be
published atomically with a durable save.

## Preferences

Preference recording accepts the local account owner and excludes automatic
flask provisioning. Empty or departed skills do not erase prior preferences.
Missing-only capture preserves an existing value. Eligibility is a live port
and is consulted only after a slot passes the integer/nonnegative check.
The original adapter supplies the current configured tag policy.

`planSkillSlots` keeps existing occupants, reserves usable preferences in gift
order, then assigns first-empty fallbacks. Duplicated gift IDs are handled once;
a full bar produces `-1`. Input arrays and preference records are unchanged.
The legacy restorer filters malformed preference values. It does not replace
strict admission for a new public save or command format.

## Verification and integration

The frozen original course has 31 bar checkpoints and eight preference cases.
It includes off-bar learned ownership, duplicate IDs, exact instance swaps,
guest isolation, automatic provisioning, possession, cold equipment grants,
actual character save/resume and callback failures at four different phases.
Two fresh original processes produced identical bytes before runtime extraction;
the observer is type-checked before replay. Normal verification cannot recapture.

Eleven independent tests cover ownership, lazy queries, live body replacement,
default-argument ordering, callback failures and preference reservation.
The guarded source adapter checks four complete World methods and three
preference helpers, preserves unrelated source and line endings, and refuses
missing, edited or repeated installation targets.

The shared equipment qualification now checks the bar through both the
original-game adapter and the full prepared-game pipeline. Eight additional
installed faults target the controlled-body mistake, lost toggle behavior,
copied instances, repeated touched identities, guest/provisioning preference
writes, omitted field retirement and overwritten preferences. Restored controls
must recover the frozen bytes. The older 954-skill learning/removal course and
legacy resume course also remain required, alongside equipment and passive
qualification.

Run `npm run build`, `node --test test/skill-bar.test.mjs`,
`npm run test:skill-bar-overlay` and `npm run reference:skill-bar`.
`npm run test:equipment-skills-original` and
`npm run test:equipment-skills-composed` exercise the installed integration.

The module is 3,777 bytes of unminified JavaScript inside a separate 4 KiB
budget. This records package size, not a timing or allocation improvement.
No per-frame phase, database access or eager core import is introduced.

Native workshop saves still require a distinct learned-book/bar/grant owner
and private candidate composition before equipment-granted skills can be
admitted there. This extraction does not expand the selected native equipment
preview or establish physical Steam Deck/mobile performance.
