import type {CargoDisplayConfig,CargoReader} from '@hollow-wake/engine/inventory/cargo-cards';
export declare function openCargoCatalogue():Readonly<{config:CargoDisplayConfig;read:CargoReader;close():void}>;
