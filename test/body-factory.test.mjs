import test from 'node:test';
import * as api from '../dist/body-factory.js';
import {bodyFactoryContracts} from './body-factory-contracts.mjs';
bodyFactoryContracts(api,test);
