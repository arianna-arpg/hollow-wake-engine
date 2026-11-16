import {listenCombatHost,createMemoryCharacterStore} from '@hollow-wake/node-godot';
import {createReferenceScene} from './scene.mjs';
const args=process.argv.slice(2),option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const filename=option('--save-file',null),port=Number(option('--port',47120));
// File storage is loaded only when explicitly selected by the host operator.
const store=filename?(await import('./file-store.mjs')).createFileCharacterStore(filename):createMemoryCharacterStore();
const host=createReferenceScene({saved:await store.load(),skill:option('--skill',null)}),server=await listenCombatHost(host,{port,save:data=>store.save(data)});
console.log(JSON.stringify({listening:server.port,memoryOnly:!filename}));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void server.close();});
