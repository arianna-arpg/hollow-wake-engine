# Character continuity reference

These observations extend the character creation and mastery baseline through account saves, class-specific rewards and hired companions. Each fixture calls the pinned game's production entry points. The accompanying fault suite reproduces 25 separately identified wrong outcomes.

| Fixture | Covered behavior |
| --- | --- |
| Rewards | 216 scenarios across the 36 earned class bundles. Drop eligibility and deliberate Oracle reward selection read discovered, pending, active, independently granted and shared skills. Eight old gem-investment cases retain the original credit-transfer and repeated-load behavior. Four controlled cases lend one real skill to another authored class, exercise both owners, and restore the original definitions. |
| Mercenaries | All 39 classes reconstructed from a level-28 company snapshot and rescaled for a level-12 patron. The probe records passive-root trimming, skill and support levels, separate attributes, retained names, life fraction, serialization and character resume. Four company layouts cover old single-contract saves, explicit empty companies, multiple companions and removed classes. |
| Account | 164 discovery/pending combinations covering every registered class and two unknown IDs. Eight old, rejected and malformed save shapes cover starter seeds, known pending membership, string-only kit picks, saved tiers, explicit grants, unknown discoveries, ownership of arrays and unrelated account values. |
| Oracle | A fresh account earns Ranger, observes its pending skill pool, rejects an unavailable reward, activates the class, and receives one actual magic skill gem through the host's quest-claim method. A distant caller, a guest seat and a duplicate award are rejected. The earned gem survives character serialization. |

The rewards, mercenary and account fixtures were sealed before their private prototype implementations. The Oracle observation was added afterward as an extra independent control against the unchanged original. Its metadata records that chronology. The supplied state includes qualifying deeds, snapshot contents, field completion and giver proximity.

## Reproduce

After installing the pinned reference tools, run:

```sh
node scripts/test-reference-character-continuity.mjs
node scripts/test-character-continuity-source-faults.mjs
```

Pass `--game GAME_DIRECTORY` to the reference command to compare an installed game with all four frozen observations. Each fault runs in a disposable source copy. Both the untouched control and the restored source must return the original bytes.

The complete account format, hire economy, acquisition of qualifying deeds and world quest progression remain separate host responsibilities. The companion snapshot cases specifically establish character reconstruction and rescaling.
