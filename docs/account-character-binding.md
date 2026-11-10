# Active character and canonical relic builds

`AccountWorkshopSession` can coordinate one explicitly selected character per
account. Configure `relicBuilds: true` together with `relicItems`, `character`
and `preparation`. This optional contract extends the existing account owner;
it does not add another saved copy of account property.

The host sends `{op:'activate-workshop', account, profile}` after authorizing
character selection. Use `profile: null` to deactivate and
`{op:'active-workshop', account}` to read committed selection. Selection is
ephemeral: account and character restoration never grants write authority.
An active workshop must be explicitly deactivated before it can close. Accounts
select independently, and a profile cannot be selected for another account.

## Projection and writeback

Private build input has `relics: {role:'inactive'}` for unselected characters.
The selected character receives `{role:'active', state}`, where `state` is a
detached, admitted canonical `RelicState<ItemInstance>`. Canonical array order,
stable keys, enabled state, rank, custody and complete bodies are preserved.
Use the existing `RelicCustody.board` when selecting seated bodies: the seated
key list is membership, not a replacement ordering. The complete detached
account context remains available to all build services for compatibility;
reading it does not authorize writes.

`WorkshopBuildPreparation.derive` still accepts its previous local-write array.
It may instead return `{items, relics}`. Local rows retain `{uid, grantState}`;
canonical rows require `{relicKey, uid, grantState}`. Null removes investment.
Only the active character may return nonempty canonical writes. The account
owner validates each key/address pair, rejects duplicate keys and unknown fields,
and admits the complete resulting item bodies. Command inputs are detached even
for custom ports, so a callback cannot redirect selection or sibling phases.
No name, identity, custody,
wallet, bar or arbitrary account mutation travels through this writeback port.
The owner enforces these checks even when a custom port bypasses the helper.

The selected character derives first. Its canonical investment changes become
the input to every affected sibling. This also applies when an inactive
character initiates a salvage action that changes shared account knowledge.
All candidates, saves and replies must pass before any account or continuation
is published. A late failure discards the whole change, including private graph
advancement. Services must still fork complete private graphs without editing
their committed source or performing live World effects.

## Identity and transactions

Activation checks every canonical address against the selected character's bag,
equipment, overflow and personal containers, including inactive or misplaced
container items. A collision refuses with `relic-address-collision`, leaving
both bodies intact. Successful activation raises the character's next item ID
above every canonical UID. Canonical addresses remain positive uint32 values;
local addresses retain their existing safe-integer range. Account updates repeat
these checks, and normalized build output cannot introduce a collision.

This is strict admission, deliberately separate from original legacy migration.
The original can readdress relics on character adoption, and its same-scope echo
repair can discard a forced ordinary-item collision. This boundary neither
discards items nor silently assigns new canonical addresses. Hosts must resolve
an ambiguous imported save through a separately qualified migration before
activation. Stable relic keys remain the authority across such a migration.

`activate-workshop` participates in the existing prepared command batch. While
pending, queries read committed selection and saves. Commit promotes selection,
canonical bodies and every derived continuation together; abort discards them.
Even selection with unchanged save bytes has a nonzero commit token. Durable
version counters describe save changes, not ephemeral selection. Hosts must
acknowledge the complete prepared write group, then perform live reconciliation.
After restart they must authorize selection again.

## Verification and limits

The immutable [original course](../baseline/account-character-binding/README.md)
records 12 character adoption, authority, possession and release checkpoints,
including a different-scope address collision. It is original behavior evidence;
strict activation is an intentional owner contract, not a claim that a new
session recreates every original World effect.

Run `npm run test:account-character-binding-package` after `npm run build`, and
`npm run reference:account-character-binding`. Qualification exercises 17
contracts through an installed archive and hostile-global browser bundle,
public types and deliberate faults with clean restored controls. The investment
counter is diagnostic: the authored relics used here grant companions, so it
does not establish an authored ordinary relic skill grant.

The owner has an explicit 40 KiB unminified ceiling (previously 30 KiB); the
private helper retains its 4 KiB ceiling. Core and independent consumer budgets
remain unchanged. Unchanged account bodies are admitted once and reused for
ordinary inventory edits; detached build views still have a copy cost. This is
command-time work, not frame-loop work or a measured device speedup.

Full authored private build construction, qualified address migration,
acknowledgement-time reconciliation with active casts/companions, native
admission and Steam Deck/mobile measurements remain open. Existing Unity,
Godot and Unreal wrappers do not gain this capability automatically.
