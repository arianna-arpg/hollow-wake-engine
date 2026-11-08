import test from 'node:test';
import {AccountWorkshopSession} from '../dist/account-workshop-session.js';
import {baseline,definitions} from './shared-account/fixtures.mjs';
import {preparedContracts} from './shared-account/prepared-contracts.mjs';
preparedContracts(test,{AccountWorkshopSession,definitions,baseline});
