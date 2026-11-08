import test from 'node:test';
import {AccountWorkshopSession} from '../dist/account-workshop-session.js';
import {baseline,definitions} from './shared-account/fixtures.mjs';
import {contracts} from './shared-account/contracts.mjs';
contracts(test,{AccountWorkshopSession,baseline,definitions});
