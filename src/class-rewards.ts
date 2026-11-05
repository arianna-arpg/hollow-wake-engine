export interface ClassRewardBundle {
    readonly classId: string;
    readonly skillIds: readonly string[];
    readonly supportIds?: readonly string[];
}
export interface RewardSkillAccess {
    readonly unlockedSkills: {
        has(id: string): boolean;
    };
    readonly explicitSkillUnlocks: {
        has(id: string): boolean;
    };
    readonly pendingClassUnlocks: {
        has(id: string): boolean;
    };
    readonly unlockedClasses: {
        has(id: string): boolean;
    };
}
/** Read the current definitions on every request. A pending discovery may
 * enable a skill drop before it can be selected deliberately. */
export function isSelectableClassSkill(account: RewardSkillAccess, id: string, starterSkills: readonly string[], bundles: readonly ClassRewardBundle[]): boolean {
    if (!account.unlockedSkills.has(id))
        return false;
    if (starterSkills.includes(id) || account.explicitSkillUnlocks.has(id))
        return true;
    let pendingOwner = false;
    for (const bundle of bundles) {
        if (!bundle.skillIds.includes(id))
            continue;
        if (account.unlockedClasses.has(bundle.classId) && !account.pendingClassUnlocks.has(bundle.classId))
            return true;
        if (account.pendingClassUnlocks.has(bundle.classId))
            pendingOwner = true;
    }
    return !pendingOwner;
}
export interface RewardReconciliationAccount {
    readonly invested: Record<string, number>;
    readonly unlockedClasses: {
        has(id: string): boolean;
    };
    readonly unlockedSkills: {
        add(id: string): unknown;
    };
    readonly unlockedSupports: {
        add(id: string): unknown;
    };
}
function savedGemInvestment(account: RewardReconciliationAccount, row: { readonly id: string }): number {
    return Math.max(0, Math.floor(account.invested[row.id] ?? 0));
}
export function reconcileClassRewards<Account extends RewardReconciliationAccount, Row extends {
    readonly kind: string;
    readonly id: string;
}>(account: Account, bundles: readonly ClassRewardBundle[], legacyMode: boolean, catalogue: readonly Row[], discoveryId: string | undefined, invested: (account: Account, row: Row) => number = savedGemInvestment): void {
    if (!legacyMode && discoveryId !== undefined) {
        for (const row of catalogue) {
            if (row.kind !== 'skill' && row.kind !== 'support')
                continue;
            const credit = invested(account, row);
            if (credit > 0) {
                const own = Object.hasOwn(account.invested, discoveryId);
                const total = (own ? account.invested[discoveryId] ?? 0 : 0) + credit;
                if (own)
                    account.invested[discoveryId] = total;
                else
                    Object.defineProperty(account.invested, discoveryId, { value: total, writable: true, enumerable: true, configurable: true });
            }
            delete account.invested[row.id];
        }
    }
    for (const bundle of bundles) {
        if (!account.unlockedClasses.has(bundle.classId))
            continue;
        for (const skill of bundle.skillIds)
            account.unlockedSkills.add(skill);
        if (bundle.supportIds)
            for (const support of bundle.supportIds)
                account.unlockedSupports.add(support);
    }
}
