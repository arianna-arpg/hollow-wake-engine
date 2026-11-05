export interface ClassClaimRow {
    readonly id: string;
    readonly kind: string;
    readonly earned?: boolean;
}
export interface ClassClaimPorts<Account, Row, View> {
    owned(account: Account, row: Row): boolean;
    visible(account: Account, row: Row, view?: View): boolean;
    clearInvestment(account: Account, id: string): void;
    grant(account: Account, row: Row): void;
    markPending(account: Account, row: Row): void;
    pending(account: Account, row: Row): boolean;
    activate(account: Account, row: Row): boolean;
}
export function claimEarnedEntry<Account, Row extends ClassClaimRow, View>(account: Account, row: Row, view: View | undefined, ports: ClassClaimPorts<Account, Row, View>): boolean {
    if (!row.earned || ports.owned(account, row))
        return false;
    return grantVisibleEntry(account, row, view, ports);
}
function grantVisibleEntry<Account, Row extends ClassClaimRow, View>(account: Account, row: Row, view: View | undefined, ports: ClassClaimPorts<Account, Row, View>): boolean {
    if (!ports.visible(account, row, view))
        return false;
    ports.clearInvestment(account, row.id);
    ports.grant(account, row);
    if (row.kind === 'class')
        ports.markPending(account, row);
    return true;
}
export function pendingClassClaims<Account, Row extends ClassClaimRow, View>(catalog: readonly Row[], account: Account, ports: ClassClaimPorts<Account, Row, View>): Row[] {
    return catalog.filter(row => row.kind === 'class' && ports.owned(account, row) && ports.pending(account, row));
}
export function activateClassClaim<Account, Row extends ClassClaimRow, View>(account: Account, row: Row, ports: ClassClaimPorts<Account, Row, View>): boolean {
    return row.kind === 'class' && ports.owned(account, row) && ports.activate(account, row);
}
export function settleClassClaims<Account, Row extends ClassClaimRow, View>(catalog: readonly Row[], account: Account, view: View | undefined, ports: ClassClaimPorts<Account, Row, View>): Row[] {
    const claimed: Row[] = [];
    let grew = true;
    while (grew) {
        grew = false;
        for (const row of catalog) {
            if (row.kind !== 'class' || !row.earned || ports.owned(account, row))
                continue;
            if (claimed.includes(row))
                throw new Error('Class grant did not produce lasting ownership: ' + row.id);
            if (!grantVisibleEntry(account, row, view, ports))
                continue;
            if (!ports.owned(account, row)) {
                throw new Error('Class grant did not produce lasting ownership: ' + row.id);
            }
            claimed.push(row);
            grew = true;
        }
    }
    return claimed;
}
export interface ClassBundleAccount {
    readonly unlockedClasses: {
        add(id: string): unknown;
    };
    readonly unlockedSkills: {
        add(id: string): unknown;
    };
    readonly unlockedSupports: {
        add(id: string): unknown;
    };
}
export function grantClassBundle(account: ClassBundleAccount, payload: {
    readonly classId: string;
    readonly skillIds: readonly string[];
    readonly supportIds: readonly string[];
}): void {
    account.unlockedClasses.add(payload.classId);
    for (const id of payload.skillIds)
        account.unlockedSkills.add(id);
    for (const id of payload.supportIds)
        account.unlockedSupports.add(id);
}
