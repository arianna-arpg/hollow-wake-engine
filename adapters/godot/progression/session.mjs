import {ProgressionSession} from '@hollow-wake/engine/progression/session';
export const create = content => new ProgressionSession(content);
export const dispatch = (session, request) => session.command(request);
