// Package builders place the selected capability's installed SDK factory here.
import {create,dispatch as command} from './session.mjs';
import {godotDispatch} from './number-wire.mjs';
export {create};
export const dispatch=godotDispatch(command);
