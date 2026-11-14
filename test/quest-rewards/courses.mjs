// Maintained qualification declarations; faults are applied in memory only.
export const questRewardCourses = {
  "mint": {
    "fixture": "mint-contracts.mjs",
    "expected": {
      "contracts": 13
    },
    "faults": [
      {
        "name": "retain-stream",
        "edits": [
          [
            "quest-memory-mint.ts",
            "finally{active=false;}",
            "finally{active=true;}"
          ]
        ],
        "message": "Missing expected exception",
        "kind": "refusal"
      },
      {
        "name": "global-random",
        "edits": [
          [
            "quest-memory-mint.ts",
            "return random.next();",
            "return Math.random();"
          ]
        ],
        "message": "ambient-random-disallowed",
        "kind": "refusal"
      },
      {
        "name": "skip-presentation",
        "edits": [
          [
            "quest-memory-mint.ts",
            "presentations.push(copy(p.presentation(point(origin),kind)))",
            "presentations.push(null)"
          ]
        ],
        "message": "Mint stream omitted original roll or presentation draws",
        "kind": "refusal"
      }
    ]
  },
  "rolls": {
    "fixture": "roll-contracts.mjs",
    "expected": {
      "cases": 45
    },
    "faults": [
      {
        "name": "missing-rarity",
        "edits": [
          [
            "memory-roll-policy.ts",
            "if(skillDraws===2)draw(random);draw(random);return discarded;",
            "if(skillDraws===2)draw(random);return discarded;"
          ]
        ],
        "message": "AssertionError",
        "kind": "refusal"
      },
      {
        "name": "missing-minimum",
        "edits": [
          [
            "memory-roll-policy.ts",
            "||row.min>context.level",
            ""
          ]
        ],
        "message": "minimum applies to floor",
        "kind": "refusal"
      },
      {
        "name": "reversed-tag-order",
        "edits": [
          [
            "memory-roll-policy.ts",
            "for(const tag of row.tags)n*=",
            "for(const tag of row.tags.toReversed())n*="
          ]
        ],
        "message": "tag multiplication preserves order",
        "kind": "refusal"
      },
      {
        "name": "missing-bias",
        "edits": [
          [
            "memory-roll-policy.ts",
            "if(context.bias&&row.tags.some(tag=>context.bias!.includes(tag)))n*=rules.biasMult;",
            ""
          ]
        ],
        "message": "bias reaches zero",
        "kind": "refusal"
      },
      {
        "name": "missing-no-drop",
        "edits": [
          [
            "memory-roll-policy.ts",
            "if(skill&&row.noDrop)continue;",
            ""
          ]
        ],
        "message": "noDrop before fallback",
        "kind": "refusal"
      },
      {
        "name": "empty-pool",
        "edits": [
          [
            "memory-roll-policy.ts",
            "if(!supportAvailable)return null;",
            "if(!supportAvailable)return discarded;"
          ]
        ],
        "message": "AssertionError",
        "kind": "refusal"
      },
      {
        "name": "global-random",
        "edits": [
          [
            "memory-roll-policy.ts",
            "const n=random();",
            "const n=Math.random();"
          ]
        ],
        "message": "0 !== 2",
        "kind": "refusal"
      }
    ]
  },
  "catalogue": {
    "fixture": "roll-catalogue.mjs",
    "expected": {
      "cases": 21,
      "skills": 948,
      "supports": 457
    },
    "rows": true,
    "faults": [
      {
        "name": "borrowed-content",
        "edits": [
          [
            "memory-roll-catalogue.ts",
            "const pack=copySessionJSON(input);",
            "const pack=input as any;"
          ]
        ],
        "message": "Caller changed retained content",
        "kind": "refusal"
      },
      {
        "name": "duplicate-row",
        "edits": [
          [
            "memory-roll-catalogue.ts",
            "need(!ids.has(value.id),'duplicate-memory-roll-id');",
            ""
          ]
        ],
        "message": "Missing expected exception",
        "kind": "refusal"
      },
      {
        "name": "missing-fallback",
        "edits": [
          [
            "memory-roll-catalogue.ts",
            "need(skills.some(row=>!row.noDrop&&starters.has(row.id)),'missing-memory-roll-starter');",
            ""
          ]
        ],
        "message": "Missing expected exception",
        "kind": "refusal"
      }
    ]
  },
  "publication": {
    "fixture": "publication-contracts.mjs",
    "expected": {
      "contracts": 12
    },
    "faults": [
      {
        "name": "aliased-plan",
        "edits": [
          [
            "quest-memory-publication.ts",
            "const held=copy(plan);",
            "const held=plan;"
          ]
        ],
        "message": "Prepared Memory effects or order changed",
        "kind": "refusal"
      },
      {
        "name": "replay-lease",
        "edits": [
          [
            "quest-memory-publication.ts",
            "this.#state='consumed';",
            "this.#state='ready';"
          ]
        ],
        "message": "ERR_ASSERTION",
        "kind": "refusal"
      },
      {
        "name": "wrong-placement",
        "edits": [
          [
            "quest-memory-publication.ts",
            "copy(this.#plan.placements[i])",
            "copy(this.#plan.placements[0])"
          ]
        ],
        "message": "Prepared Memory effects or order changed",
        "kind": "refusal"
      },
      {
        "name": "lost-presentation",
        "edits": [
          [
            "quest-memory-publication.ts",
            "this.#ports.presentation(copy(this.#plan.presentations[i]))",
            "undefined"
          ]
        ],
        "message": "Prepared Memory effects or order changed",
        "kind": "refusal"
      }
    ]
  },
  "owner": {
    "fixture": "owner-cases.mjs",
    "owner": true,
    "expected": {
      "questOwnerScenarios": 35,
      "authoredVocations": 31
    },
    "faults": [
      {
        "name": "wrong-ack-placement",
        "edits": [
          [
            "quest-memory-publication.ts",
            "copy(this.#plan.placements[i])",
            "copy(this.#plan.placements[0])"
          ]
        ],
        "message": "Ack publication changed prepared Memory effects",
        "kind": "refusal"
      },
      {
        "name": "omit-ack-label",
        "edits": [
          [
            "quest-memory-publication.ts",
            "this.#ports.presentation(copy(this.#plan.presentations[i]))",
            "undefined"
          ]
        ],
        "message": "Ack publication changed prepared Memory effects",
        "kind": "refusal"
      },
      {
        "name": "omit-completion",
        "edits": [
          [
            "minted-vocation-quest-owner.ts",
            "book.completed.push(questId);",
            ""
          ]
        ],
        "message": "Quest preparation omitted completion stamp",
        "kind": "refusal"
      },
      {
        "name": "retain-active-quest",
        "edits": [
          [
            "minted-vocation-quest-owner.ts",
            "book.active.splice(book.active.findIndex(row=>row.questId===questId),1);",
            ""
          ]
        ],
        "message": "Quest preparation retained active entry",
        "kind": "refusal"
      },
      {
        "name": "lose-mint-continuation",
        "edits": [
          [
            "minted-vocation-quest-owner.ts",
            "owner.#pending?.mint.random??owner.#mint",
            "owner.#mint"
          ]
        ],
        "message": "Quest split mint continuation from rewards",
        "kind": "refusal"
      },
      {
        "name": "wrong-memory-placement",
        "edits": [
          [
            "minted-vocation-quest-owner.ts",
            "copy(mint.placements[index])",
            "copy(mint.placements[0])"
          ]
        ],
        "message": "Ack publication changed prepared Memory effects",
        "kind": "refusal"
      },
      {
        "name": "split-mint-publication",
        "edits": [
          [
            "minted-vocation-quest-owner.ts",
            "owner.#mint=owner.#pending.mint.random;",
            ""
          ]
        ],
        "message": "Queued observer saw split quest and reward state",
        "kind": "refusal"
      },
      {
        "name": "lose-memory-labels",
        "edits": [
          [
            "minted-vocation-quest-owner.ts",
            "presentations:copy(this.#pending?.mint.presentations??[])",
            "presentations:[]"
          ]
        ],
        "message": "Quest preparation lost Memory label plans",
        "kind": "refusal"
      },
      {
        "name": "inconsistent-restored-book",
        "edits": [
          [
            "minted-vocation-quest-owner.ts",
            "owner.#checkBook();",
            ""
          ]
        ],
        "message": "Restored quest book disagrees with run stamp",
        "kind": "refusal"
      }
    ]
  },
  "capacity": {
    "fixture": "capacity-cases.mjs",
    "owner": true,
    "expected": {
      "questOwnerScenarios": 2
    },
    "faults": [
      {
        "name": "early-mint-continuation",
        "edits": [
          [
            "minted-vocation-quest-owner.ts",
            "this.#pending={questId,book,mint};",
            "this.#pending={questId,book,mint};this.#mint=mint.random;"
          ]
        ],
        "message": "Rejected quest advanced mint checkpoint",
        "kind": "refusal"
      },
      {
        "name": "unbounded-quest-xp",
        "edits": [
          [
            "run-character-session.ts",
            "  if(plan.ledgerAfter!==before.ledger)need(Object.keys(plan.ledgerAfter).length<=4096,'run-ledger-limit');\n",
            ""
          ]
        ],
        "message": "Rejected quest reached storage",
        "kind": "refusal"
      }
    ]
  },
  "sqlite": {
    "fixture": "checkpoint-processes.mjs",
    "owner": true,
    "stages": [
      "write-lost",
      "resume-pickup",
      "next-quest",
      "final-read"
    ],
    "faults": []
  },
  "world": {
    "fixture": "world-cases.mjs",
    "owner": true,
    "rows": true,
    "reference": true,
    "expected": {
      "scenarios": 37,
      "authoredVocations": 31
    },
    "faults": [
      {
        "name": "wrong-live-bob",
        "edits": [
          [
            "quest-memory-publication.ts",
            "copy(this.#plan.placements[i])",
            "{...copy(this.#plan.placements[i]),bob:0}"
          ]
        ],
        "kind": "mismatch"
      },
      {
        "name": "wrong-live-label",
        "edits": [
          [
            "quest-memory-publication.ts",
            "copy(this.#plan.presentations[i])",
            "{...copy(this.#plan.presentations[i]),text:'Wrong Memory label'}"
          ]
        ],
        "kind": "mismatch"
      },
      {
        "name": "wrong-live-memory",
        "edits": [
          [
            "quest-memory-publication.ts",
            "copy(this.#plan.drops[i])",
            "{...copy(this.#plan.drops[i]),memoryKind:'preformed'}"
          ]
        ],
        "kind": "mismatch"
      },
      {
        "name": "omit-book",
        "edits": [
          [
            "minted-vocation-quest-owner.ts",
            "book.completed.push(questId);",
            ""
          ]
        ],
        "message": "Saved and live quest books differ",
        "kind": "refusal"
      },
      {
        "name": "wrong-roll",
        "edits": [
          [
            "memory-roll-policy.ts",
            "if(skillDraws===2)draw(random);draw(random);return discarded;",
            "if(skillDraws===2)draw(random);return discarded;"
          ]
        ],
        "kind": "mismatch"
      }
    ]
  },
  "roll-world": {
    "fixture": "roll-world.ts",
    "reference": true,
    "singleArgument": true,
    "expected": {
      "scenarios": 45
    },
    "faults": [
      {
        "name": "skip-skill-rarity",
        "edits": [
          [
            "memory-roll-policy.ts",
            "if(skillDraws===2)draw(random);draw(random);return discarded;",
            "if(skillDraws===2)draw(random);return discarded;"
          ]
        ],
        "kind": "mismatch"
      },
      {
        "name": "empty-support-accepted",
        "edits": [
          [
            "memory-roll-policy.ts",
            "if(!supportAvailable)return null;",
            "if(!supportAvailable)return discarded;"
          ]
        ],
        "kind": "mismatch"
      },
      {
        "name": "zero-weight-draw",
        "edits": [
          [
            "memory-roll-policy.ts",
            "const skillDraws=skills.sum>0?2:1",
            "const skillDraws=2"
          ]
        ],
        "kind": "mismatch"
      },
      {
        "name": "floor-weight-ignored",
        "edits": [
          [
            "memory-roll-policy.ts",
            "row.weight*(floor?.has(row.id)?rules.floorMult:1)",
            "row.weight"
          ]
        ],
        "kind": "mismatch"
      },
      {
        "name": "carried-weight-ignored",
        "edits": [
          [
            "memory-roll-policy.ts",
            "if(carried.has(row.id))n*=rules.carriedMult;",
            ""
          ]
        ],
        "kind": "mismatch"
      }
    ]
  }
};

export const questRewardRuntime = [
  "character-vocation-commands.ts",
  "account-prepared-step.ts",
  "character-workshop-boundary.ts",
  "memory-delivery.ts",
  "character-delivery-codec.ts",
  "memory-pickup.ts",
  "character-pickup-commands.ts",
  "character-workshop-commands.ts",
  "complete-account-commands.ts",
  "run-character-session.ts",
  "durable-run-owner.ts",
  "memory-item-publication.ts",
  "quest-rewards.ts",
  "vocation-quest-plan.ts",
  "gem-drop.ts",
  "quest-memory-mint.ts",
  "minted-vocation-quest-owner.ts",
  "quest-memory-publication.ts",
  "memory-roll-policy.ts",
  "memory-roll-catalogue.ts",
  "durable-character-located-owner.ts"
];

export const questRewardAliases = {
  "candidate/run-character-session": "src/run-character-session.ts",
  "candidate/durable-run-owner": "src/durable-run-owner.ts",
  "candidate/owned-vocation": "src/character-vocation-commands.ts",
  "candidate/delivery-codec": "src/character-delivery-codec.ts",
  "candidate/pickup-commands": "src/character-pickup-commands.ts",
  "candidate/gem-drop": "src/gem-drop.ts",
  "candidate/memory-delivery": "src/memory-delivery.ts",
  "candidate/memory-pickup": "src/memory-pickup.ts",
  "candidate/memory-item-publication": "src/memory-item-publication.ts",
  "candidate/minted-vocation-quest-owner": "src/minted-vocation-quest-owner.ts",
  "candidate/vocation-quest-plan": "src/vocation-quest-plan.ts",
  "candidate/quest-rewards": "src/quest-rewards.ts",
  "candidate/quest-memory-mint": "src/quest-memory-mint.ts",
  "candidate/quest-memory-publication": "src/quest-memory-publication.ts",
  "candidate/memory-roll-policy": "src/memory-roll-policy.ts",
  "candidate/memory-roll-catalogue": "src/memory-roll-catalogue.ts",
  "candidate/json": "src/session-json.ts",
  "candidate/random": "src/random.ts",
  "candidate/experience-plan": "src/character-experience-plan.ts",
  "candidate/passive-effects": "src/character-passive-effects.ts",
  "candidate/passive-policy-types": "src/passive-policy.ts",
  "candidate/live-run-world": "test/run-character/world.ts",
  "candidate/live-passive-world": "test/character-passive/live-world.ts",
  "candidate/durable-minted-vocation-world": "test/quest-rewards/world.ts",
  "candidate/memory-world-publication": "test/quest-rewards/world-publication.ts",
  "candidate/vocation-world": "test/quest-rewards/vocation-world.ts",
  "candidate/vocation-quest-adapter": "test/quest-rewards/vocation-adapter.ts",
  "candidate/memory-pickup-world": "test/quest-rewards/pickup-world.ts",
  "host/quest-content": "test/quest-rewards/host-content.mjs",
  "hollow-wake-source/skills": ".reference/src/engine/skills.ts",
  "hollow-wake-source/minion-families": ".reference/src/data/minionFamilies.ts"
};

export const questRewardGameFixtures = [
  "test/quest-rewards/world.ts",
  "test/quest-rewards/world-publication.ts",
  "test/quest-rewards/vocation-world.ts",
  "test/quest-rewards/vocation-adapter.ts",
  "test/quest-rewards/pickup-world.ts",
  "test/quest-rewards/roll-world.ts",
  "test/character-passive/live-world.ts",
  "test/run-character/world.ts"
];
