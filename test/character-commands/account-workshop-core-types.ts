import {AccountWorkshopSession,type AccountWorkshopDefinitions} from '../../src/account-workshop-session.js';
import {CompleteAccountWorkshopSession,type CompleteAccountWorkshopDefinitions} from '../../src/account-workshop-complete.js';
import type {CompleteWorkshopKernel} from '../../src/complete-character-contracts.js';
declare const ordinary:AccountWorkshopDefinitions;
declare const complete:CompleteAccountWorkshopDefinitions;
declare const kernel:CompleteWorkshopKernel;
const legacy=new AccountWorkshopSession(ordinary);
new CompleteAccountWorkshopSession(complete).preparedJournal(1);
// @ts-expect-error Public constructor cannot select the diagnostic complete path.
new AccountWorkshopSession({...ordinary,completeKernel:kernel});
// @ts-expect-error The complete entry requires the complete kernel.
new CompleteAccountWorkshopSession(ordinary);
// @ts-expect-error There is no public journal accessor on the legacy facade.
legacy.preparedJournal(1);
// @ts-expect-error The core's protected journal is not a public escape hatch.
legacy.readPreparedJournal(1);
// @ts-expect-error A third argument cannot enable a different save policy.
new AccountWorkshopSession(ordinary,{}, {completeKernel:kernel});
