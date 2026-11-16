import type {CombatContent,CombatSession,CombatActor,CombatActorView,CombatSpace,BodyInput,Point} from '@hollow-wake/combat';
import type {CharacterKit} from '@hollow-wake/characters';
import type {CharacterSession,CharacterCommand,CharacterGrant,CharacterData} from '@hollow-wake/engine/character/session';
export interface CombatInput {t:'input';seq:number;move:[number,number];aim:[number,number];press:string[];held?:string[];hold?:boolean}
export interface ReferenceSpace extends CombatSpace {
 heightAt(position:Point,tier:number):number;
 description():{width:number;height:number;wall:{x:number;y:number;w:number;h:number}|null;platform:boolean;unitsPerMetre:number;heightUnit:string};
}
export interface NodeCombatState {
 readonly t:'state';readonly tick:number;readonly time:number;readonly ack:number;readonly hero:number;readonly inventoryRevision:number;
 readonly bodies:{id:number;plan:string;x:number;y:number;h:number;floor:number;yaw:number;r:number;life:number;maxLife:number;
  mana:number;team:CombatActorView['team'];dead:boolean;anim:'cast'|'walk'|'idle';cast:CombatActorView['casting'];statuses:CombatActorView['statuses']}[];
 readonly shots:{id:number;skill:string;x:number;y:number;h:number;r:number}[];
 readonly zones:ReturnType<CombatSession['snapshot']>['zones'];
 readonly events:ReturnType<CombatSession['drainSignals']>;
 readonly hud:{life:number;mana:number;cooldowns:Record<string,number>;skills:(string|null)[]};
}
export interface NodeCombatHost {
 readonly session:CombatSession;readonly hero:CombatActor;readonly character:CharacterSession|undefined;
 input(message:unknown):{accepted:boolean;reason?:string};
 build(command:CharacterCommand,options?:{preview?:boolean}):Record<string,unknown>;
 /** Trusted host operation; never a client command or reward-entitlement decision. */
 grant(request:CharacterGrant):Record<string,unknown>;
 inventory():Record<string,unknown>;hello():Record<string,unknown>;step(seconds?:number):NodeCombatState;
 disconnect():void;close():void;
}
export declare function createNodeCombatHost(content:CombatContent,options:({kit:CharacterKit;character:CharacterSession;nativeHero?:never}|{nativeHero:BodyInput;kit?:never;character?:never})&{space:CombatSpace&{heightAt?(at:Point,tier:number):number;description?():unknown};seed?:number;position?:Point;conditionsFor?:(kind:string)=>unknown}):NodeCombatHost;
export declare function createReferenceSpace(content:CombatContent,options?:{width?:number;height?:number;wall?:boolean;platform?:boolean}):ReferenceSpace;
export declare function lineDecoder(receive:(message:unknown)=>void,options?:{maximumBytes?:number}):(chunk:Uint8Array)=>void;
export declare function listenCombatHost(host:NodeCombatHost,options?:{port?:number;save?:(data:CharacterData)=>unknown;stepSeconds?:number}):Promise<{readonly port:number;close():Promise<void>}>;
export declare function createMemoryCharacterStore():{load():CharacterData|null;save(value:CharacterData):void};
