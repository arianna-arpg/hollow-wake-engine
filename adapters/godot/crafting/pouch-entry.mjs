import {create,dispatch as command} from './pouch-session.mjs';
import {godotDispatch} from './number-wire.mjs';

export {create};
export const dispatch=godotDispatch(command);
