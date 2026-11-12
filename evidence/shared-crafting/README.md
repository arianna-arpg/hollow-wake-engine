# Shared crafting implementation

Crafting command execution now has one maintained internal implementation behind the existing public API. Public constructor parameters and v1–v4 save formats stay unchanged. Internal formats are not selected by save input. See [the contract](../../docs/crafting-session.md) and [verification summary](summary.json).

The frozen candidate passed the full local SDK and reference suites. Its package has 22 installed and browser checks, public type checks, and 16 deliberate faults followed by restored controls. Four frozen pre-refactor saves reproduce in fresh processes. Verification installations are removed after use; their hashes and compressed logs remain.

This change consolidates command code. It does not publish the separate complete-character/account/world-delivery candidates or establish new native engine or physical-device performance support. Steam Deck and older mobile qualification remain unfinished.
