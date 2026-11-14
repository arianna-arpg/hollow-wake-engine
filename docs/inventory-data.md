# Account-free Inventory admission

`@hollow-wake/engine/inventory/data` exports `InventoryData`,
`InventoryDataState`, and `InventoryDataDefinitions`. It validates the same
authored item, grant, gem, support, placement, identity and currency rules used
by the existing crafting format, without requiring an account or save envelope.
Definitions are compiled item/crafting and skill rules, shared across characters.

`admit(input, validateRack?, validateBook?)` first bounds and copies portable JSON,
rejecting accessors, hidden fields, sparse arrays and non-JSON values. It returns
a detached validated Inventory. Callbacks are trusted validation policy.

`inventory(input, validateRack?, validateBook?)` validates already inert JSON and
returns that input by
identity. It does not copy, repair or own the caller's state. Inventory operations
and a character owner must perform their own detached preparation before
publishing a change. Optional rack/book callbacks supply the consuming character's
binding policy; supplying a book without its validator is an error. Admission
checks strict fields, bounds and unique item identities across bag, equipment and
overflow. It does not establish equipment-slot eligibility or host authorization.

`item`, `skillPayload`, `retainedItem`, `retainedSkillPayload`, and `grantState`
retain their existing distinction between cold investment budgets and retained
investment. A character import must choose that policy explicitly. The
legacy `CraftingSessionData` facade continues to require and validate its account fields;
this change does not loosen any published save format. Both facades share the
internal validator; the legacy bundle does not load the public import facade.

The entry has no runtime or declaration dependency on quest, account, save,
database or world-event extensions. Item metadata can still contain authored
quest/relic identifiers; admission neither executes quests nor grants relic
authority. Full character creation and accepted Inventory changes reaching live
combat remain milestone-two composition work.

Verification: `node --test test/inventory-data.test.mjs` runs six account-free
contracts against authored content. The existing Inventory/crafting contracts
and deliberate fault courses exercise the shared implementation. The installed
crafting package course also runs these six contracts with optional modules
and the legacy crafting session physically absent.
