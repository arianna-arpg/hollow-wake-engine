import {CharacterRebuild,type CharacterRebuildPorts,type CharacterRebuildFrame} from '@hollow-wake/engine/character/rebuild';
import type {Modifier} from '@hollow-wake/engine';
type D={id:string;name:string};
type U={id:string};
type S={def:D;level:number;sockets:({def:U;level:number}|null)[]};
type I={uid:number};
declare const ports:CharacterRebuildPorts<D,U,S,I>;
declare const frame:CharacterRebuildFrame<D,U,S,I>;
const runtime=new CharacterRebuild(ports);
runtime.rebuild(frame);
const rows:Modifier[]=ports.levelModifiers(4);void rows;
// @ts-expect-error A preview is not a live actor frame.
runtime.rebuild({bar:[],sources:[]});
// @ts-expect-error Life is current numeric state.
frame.actor.life='100';
// @ts-expect-error A stat sheet is required; a scalar preview is insufficient.
frame.actor.sheet=42;
// @ts-expect-error Equipment grant handling is not optional.
new CharacterRebuild({contributions:ports.contributions,levelModifiers:ports.levelModifiers});
// @ts-expect-error Guard synchronization is a completion callback.
frame.syncGuard=undefined;
// @ts-expect-error The host explicitly resolves relic suppression.
frame.relicEffectsSuppressed='yes';
