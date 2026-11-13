// Account implementation and its declaration-only runtime marker form one
// optional capability. A thin facade must not hide shared implementation size.
// See docs/character-command-consolidation.md for the measured tradeoff.
export const accountWorkshopRuntimeModules=Object.freeze(['account-workshop-session','account-workshop-core','complete-character-contracts']);
export const accountWorkshopRawBudget=44*1024;
export const accountCharacterBrowserBudget=184*1024;
export const accountBuildBrowserBudget=179*1024;
