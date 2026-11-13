# Per-command account publication

The internal complete-character journal retains each command's admitted account
state before and after that command. A mixed batch can therefore publish account
updates at the original position among character rebuilds. The final account save
alone cannot describe those intermediate observations.

Each account transition carries owner-derived account identity, version, ephemeral
active-profile selection, and a recursively immutable save view. Selection remains
outside the save format and can change without changing the persisted version.
Unchanged owner records share one view within a prepared batch; the temporary view
cache is cleared when the journal is finished. Unchanged accounts add no transition.

Preparation does not mutate the live world. Definite storage refusal discards its
lease. A lost acknowledgement or failed publication requires recovery; effects
already applied by the host are not rolled back by this journal. Callbacks must
complete synchronously and preserve per-command ordering.

Permanent account progress is distinct from the current run ledger. Publishing an
account observation cannot rewrite run unlocks. The passive host supplies explicit
run observations; durable run and reward authority remain unfinished.

## Verification

- The normal journal test retains fifteen character-path cases and adds four
  account cases: intermediate observations, normalization, late failure and no-op.
- `test:character-account-journal` also detects a substituted before view, missing
  account transitions and duplicated shared views, then restores the control.
- `test:character-commands-types` includes five account-view rejection cases.
- `test:character-passive-composition` compares mixed publication against actual
  original actors for committed and refused storage. It also verifies canonical
  selection metadata without claiming complete canonical relic live publication.

The complete-character journal API remains excluded from the installable package.
These checks do not establish a stable complete-character API, full actor recovery
or native/device support.
