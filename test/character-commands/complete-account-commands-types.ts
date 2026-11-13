import {CompleteAccountKernel} from '../../src/complete-account-commands.js';
import type {CharacterWorkshopDefinitions,CharacterWorkshopHandle} from '../../src/character-workshop-commands.js';
import type {CompleteWorkshopKernel,WorkshopRuleScope} from '../../src/complete-character-contracts.js';
declare const definitions:CharacterWorkshopDefinitions,scope:WorkshopRuleScope,handle:CharacterWorkshopHandle;
const kernel=new CompleteAccountKernel(definitions,{conditions:()=>({}),trace:packet=>{packet.accountKey.toLowerCase();}});
const port:CompleteWorkshopKernel=kernel;
port.execute(undefined,{op:'open',seed:1},undefined,scope);kernel.lineages(handle);
// @ts-expect-error account composition requires a trusted conditions supplier
new CompleteAccountKernel(definitions,{});
// @ts-expect-error serialized saves cannot supply live functions
kernel.execute(handle,{op:'restore',save:()=>({})},undefined,scope);
// @ts-expect-error a player request cannot select an arbitrary delivery permission
kernel.execute(handle,{},undefined,{...scope,delivery:'pickup'});
// @ts-expect-error kernel results remain synchronous
const asynchronous:Promise<unknown>=kernel.execute(handle,{},undefined,scope);
// @ts-expect-error account and profile identity are explicit
kernel.execute(handle,{},undefined,{...scope,profile:'1'});
// @ts-expect-error a character read requires an owned continuation
kernel.read({});
void asynchronous;
