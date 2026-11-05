// Behavioral fault definitions; mutate only a disposable installed package.
export const faults = {
  "memory": [
    [
      "catalog-no-drop",
      "buildMemoryCatalog",
      "!skill.noDrop && weight > 0",
      "weight > 0"
    ],
    [
      "catalog-support-positive",
      "buildMemoryCatalog",
      "support.weight > 0",
      "support.weight >= 0"
    ],
    [
      "catalog-skill-exclusions",
      "buildMemoryCatalog",
      "!excluded?.includes(memoryKey('skill', skill.id))",
      "true"
    ],
    [
      "catalog-support-exclusions",
      "buildMemoryCatalog",
      "!excluded?.includes(memoryKey('support', support.id))",
      "true"
    ],
    [
      "debug-discovery",
      "memoryDiscovered",
      "account.features.has(context.unlockAllFeature)",
      "false"
    ],
    [
      "secondary-debug-bypass",
      "memorySecondaryOwned",
      "context.config.debugCodexBypassesSecondary && ",
      ""
    ],
    [
      "progression-milestone",
      "memoryProgressionOpen",
      "context.progressionOpen(account.ledger)",
      "false"
    ],
    [
      "secondary-kind",
      "memorySecondaryOpen",
      "!secondary.kinds.includes(kind)",
      "secondary.kinds.includes(kind)"
    ],
    [
      "commission-boundary",
      "memoryCommissionReady",
      ">= need",
      "> need"
    ],
    [
      "pool-secondary-vault",
      "memoryUnlockCandidates",
      "!config.secondary.vault || ",
      ""
    ],
    [
      "pool-drop-weighting",
      "memoryUnlockCandidates",
      "config.weighting === 'drop'",
      "config.weighting !== 'drop'"
    ],
    [
      "pool-finite",
      "memoryUnlockCandidates",
      "Number.isFinite(weight) && ",
      ""
    ],
    [
      "pool-positive",
      "memoryUnlockCandidates",
      "weight > 0",
      "weight >= 0"
    ],
    [
      "receipt-own-read",
      "nextReceiptSequence",
      "Object.hasOwn(account.memoryReceipts, id)",
      "true"
    ],
    [
      "receipt-capacity",
      "nextReceiptSequence",
      "previous < Number.MAX_SAFE_INTEGER",
      "previous <= Number.MAX_SAFE_INTEGER"
    ],
    [
      "receipt-preflight",
      "grantMemoryUnlock",
      "if (nextReceiptSequence(account, definition.id) === null)",
      "if (false)"
    ],
    [
      "receipt-post-random",
      "grantMemoryUnlock",
      "if (sequence === null)",
      "if (false)"
    ],
    [
      "weight-total-finite",
      "grantMemoryUnlock",
      "!Number.isFinite(total) || ",
      ""
    ],
    [
      "random-finite",
      "grantMemoryUnlock",
      "!Number.isFinite(roll) || ",
      ""
    ],
    [
      "random-upper-bound",
      "grantMemoryUnlock",
      "roll >= 1",
      "roll > 1"
    ],
    [
      "selection-boundary",
      "grantMemoryUnlock",
      "cursor < 0",
      "cursor <= 0"
    ],
    [
      "explicit-skill-grant",
      "grantMemoryUnlock",
      "account.explicitSkillUnlocks.add(picked.id);",
      "void 0;"
    ],
    [
      "receipt-own-storage",
      "grantMemoryUnlock",
      null,
      "account.memoryReceipts[definition.id] = receipt;"
    ],
    [
      "legendary-membership",
      "awakenMemoryFromDrop",
      "!context.canAwakenSkill(id)",
      "false"
    ],
    [
      "legendary-deduplication",
      "awakenMemoryFromDrop",
      "if (account.memorySecondary.has(key))",
      "if (false)"
    ],
    [
      "access-kind",
      "memoryAccessView",
      "key.startsWith('skill:')",
      "key.startsWith('support:')"
    ]
  ],
  "unlocks": [
    [
      "account-milestone-prefix-ignored",
      "catalogLevelMilestones",
      "k.startsWith(prefix)",
      "true"
    ],
    [
      "account-milestone-suffix-truncated",
      "catalogLevelMilestones",
      "/^\\d+$/.test(suffix)",
      "/^\\d+/.test(suffix)"
    ],
    [
      "objective-inherited-read",
      "classObjectiveNeeds",
      "Object.hasOwn(needs, key) ? needs[key] : 0",
      "needs[key] ?? 0"
    ],
    [
      "class-milestone-prefix-ignored",
      "catalogClassLevelMilestones",
      "k.startsWith(prefix)",
      "true"
    ],
    [
      "class-milestone-suffix-truncated",
      "catalogClassLevelMilestones",
      "/^\\d+$/.test(suffix)",
      "/^\\d+/.test(suffix)"
    ],
    [
      "investment-inherited-read",
      "ownInvestment",
      "Object.hasOwn(a.invested, id)",
      "true"
    ],
    [
      "investment-unsafe-write",
      "writeInvestment",
      "Object.defineProperty(a.invested, id, { value, writable: true, enumerable: true, configurable: true });",
      "a.invested[id] = value;"
    ],
    [
      "currency-finite",
      "validPurchase",
      "Number.isFinite(a.credits)",
      "true"
    ],
    [
      "investment-finite",
      "validPurchase",
      "Number.isFinite(held)",
      "true"
    ],
    [
      "price-finite",
      "validPurchase",
      "Number.isFinite(u.cost)",
      "true"
    ],
    [
      "price-nonnegative",
      "validPurchase",
      "u.cost >= 0",
      "true"
    ],
    [
      "memory-receipt-identity",
      "memorySequence",
      "a.memoryReceipts[definition.id]",
      "a.memoryReceipts[u.id]"
    ],
    [
      "investment-request-nan",
      "investUnlock",
      "Number.isNaN(amount)",
      "false"
    ],
    [
      "earned-purchase",
      "investUnlock",
      "u.earned || ",
      ""
    ],
    [
      "request-floor",
      "investUnlock",
      "Math.floor(amount)",
      "Math.ceil(amount)"
    ],
    [
      "ordinary-currency-debit",
      "investUnlock",
      "a.credits -= put;",
      "void 0;"
    ],
    [
      "investment-completion-boundary",
      "investUnlock",
      "now >= u.cost",
      "now > u.cost"
    ],
    [
      "memory-overpayment",
      "investUnlock",
      "total - u.cost",
      "0"
    ],
    [
      "purchase-success-receipt",
      "applyUnlock",
      "this.unlockCompleted(a, u, sequence)",
      "true"
    ],
    [
      "package-prior-tier",
      "isUnlockVisible",
      "i < idx",
      "i < 0"
    ],
    [
      "package-base",
      "isUnlockVisible",
      "if (!a.packageUnlocks.has(pkg.id))",
      "if (false)"
    ],
    [
      "account-level-gate",
      "staticGateMet",
      "(u.reqLevel ?? 0) > a.level",
      "false"
    ],
    [
      "owned-feature",
      "isUnlockOwned",
      "a.features.has(u.payload.flag)",
      "true"
    ],
    [
      "resurrection-live-state",
      "isUnlockVisible",
      "return !!a.roster.find(r => r.charId === u.payload.charId)?.fallen;",
      "return true;"
    ]
  ],
  "content": [
    [
      "content-dependencies",
      "unlock-content",
      "constructor",
      "data.dependencies?.gates !== dependencies.gates.pack.contentId",
      "false"
    ],
    [
      "content-memory-dependency",
      "unlock-content",
      "constructor",
      "data.dependencies?.memories !== dependencies.memories.pack.contentId",
      "false"
    ],
    [
      "content-cycle",
      "unlock-content",
      "constructor",
      "throw new Error('Cyclic unlock prerequisite ' + id);",
      "return;"
    ],
    [
      "content-classes",
      "unlock-content",
      "constructor",
      "JSON.stringify(data.classes) !== JSON.stringify(dependencies.gates.pack.classes)",
      "false"
    ],
    [
      "content-slot-consistency",
      "unlock-content",
      "constructor",
      "definition.cost !== row.cost",
      "false"
    ],
    [
      "content-shelf-threshold",
      "unlock-content",
      "constructor",
      "integer(data.shelfConfig[key], 0, 'Shelf threshold');",
      "void 0;"
    ],
    [
      "content-memory-reference",
      "unlock-content",
      "constructor",
      "!dependencies.memories.definition(row.payload.memoryUnlockId)",
      "false"
    ],
    [
      "content-tier-identity",
      "unlock-content",
      "constructor",
      "tierIds.has(tier.id) || packageIds.has(tier.id)",
      "false"
    ],
    [
      "content-frozen-data",
      "unlock-content",
      "constructor",
      "this.#data = freeze(data);",
      "this.#data = data;"
    ],
    [
      "predicate-comparison",
      "unlock-predicates",
      "testUnlockPredicate",
      "value > predicate.threshold",
      "value >= predicate.threshold"
    ],
    [
      "predicate-read-order",
      "unlock-predicates",
      "testUnlockPredicate",
      null,
      null
    ],
    [
      "predicate-group-validation",
      "unlock-predicates",
      "validateUnlockPredicate",
      "value.terms.length < 2 || ",
      ""
    ],
    [
      "rune-digraphs",
      "rune-script",
      "constructor",
      "alphabet.filter(row => row.letter.length > 1)",
      "[]"
    ],
    [
      "rune-complete-case",
      "rune-script",
      "reveal",
      "fraction >= 1",
      "fraction > 1"
    ],
    [
      "rune-fnv-seed",
      "rune-script",
      "reveal",
      "0x811c9dc5",
      "0x811c9dc4"
    ],
    [
      "rune-reveal-floor",
      "rune-script",
      "reveal",
      "Math.floor(count * fraction)",
      "Math.ceil(count * fraction)"
    ],
    [
      "rune-reveal-shuffle",
      "rune-script",
      "reveal",
      "Math.floor(random.next() * (i + 1))",
      "0"
    ],
    [
      "rune-source-case",
      "rune-script",
      "encipher",
      "text.toLowerCase()",
      "text"
    ]
  ]
};
