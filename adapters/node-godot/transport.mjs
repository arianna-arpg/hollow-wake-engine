import {createServer} from 'node:net';
import {TextDecoder} from 'node:util';

/** Bounded UTF-8 newline framing matching the existing Node/Godot seam.
 * The caller owns ticking and connection lifetime. No HTTP/world framework. */
export function lineDecoder(receive,{maximumBytes=65536}={}) {
 let pending=Buffer.alloc(0),failed=false;
 const decoder=new TextDecoder('utf-8',{fatal:true});
 return chunk=>{
  if(failed)throw Error('Decoder is closed');
  try {
   let start=0;
   while(start<chunk.length){
    const end=chunk.indexOf(10,start),stop=end<0?chunk.length:end;
    if(pending.length+stop-start>maximumBytes)throw Error('Message exceeds limit');
    const part=chunk.subarray(start,stop);
    pending=pending.length?Buffer.concat([pending,part]):Buffer.from(part);
    if(end<0)break;
    const message=JSON.parse(decoder.decode(pending));pending=Buffer.alloc(0);receive(message);start=end+1;
   }
  }catch(error){failed=true;pending=Buffer.alloc(0);throw error;}
 };
}

export async function listenCombatHost(host,{port=47120,save,stepSeconds=1/60}={}) {
 if(!Number.isInteger(port)||port<0||port>65535||!Number.isFinite(stepSeconds)||stepSeconds<=0||stepSeconds>.25)throw Error('Invalid listener options');
 let client=null,closed=false,timer=null,budget=8,elapsed=0,last=performance.now(),accumulator=0,sentRevision=-1;
 const send=(value,target=client)=>{
  if(!target||target!==client||target.destroyed)return;
  const frame=JSON.stringify(value)+'\n';
  if(target.writableLength+Buffer.byteLength(frame)>1024*1024){target.destroy();return;}
  target.write(frame);
 };
 const server=createServer(socket=>{
  if(client){socket.destroy();return;}client=socket;socket.setNoDelay(true);last=performance.now();accumulator=0;
  const decode=lineDecoder(message=>{
   if(!message||typeof message!=='object'||Array.isArray(message))throw Error('Invalid message');
   if(message.t==='input'){const result=host.input(message);if(!result.accepted)send({t:'refused',...result});}
   else if(message.t==='build'){
    if(--budget<0)throw Error('Build command rate exceeded');
    try{send({t:'build',...host.build(message.command,{preview:message.preview===true})});}
    catch{send({t:'build',accepted:false,reason:'invalid-build-command'});}
   }else if(message.t==='inspect'){
    if(--budget<0)throw Error('Inspection rate exceeded');
    if(Object.keys(message).length!==1)throw Error('Invalid inspection request');
    send({t:'inspect',...host.inspect()});
   }else if(message.t==='save'){
    if(--budget<0)throw Error('Save command rate exceeded');
    if(!save||!host.character)send({t:'saved',accepted:false,reason:'storage-unavailable'});
    else {
     const data=host.character.export();
     Promise.resolve().then(()=>save(data)).then(()=>send({t:'saved',accepted:true},socket),()=>send({t:'saved',accepted:false,reason:'storage-failed'},socket));
    }
   }else if(message.t==='quit')socket.end();else throw Error('Unknown message');
  });
  socket.on('data',chunk=>{try{decode(chunk);}catch{socket.destroy();}});
  socket.on('error',()=>{});
  socket.on('close',()=>{if(client===socket){client=null;if(!closed)host.disconnect();}});
  const hello=host.hello();send(hello);sentRevision=hello.inventory.revision;
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
 timer=setInterval(()=>{
  if(closed||!client)return;
  const now=performance.now(),delta=Math.min(.25,(now-last)/1000);last=now;accumulator+=delta;elapsed+=delta;
  if(elapsed>=1){budget=8;elapsed%=1;}
  try{let state;const events=[];while(accumulator>=stepSeconds){state=host.step(stepSeconds);events.push(...state.events);accumulator-=stepSeconds;}if(state){
   state.events=events;send(state);
   if(state.inventoryRevision!==sentRevision){send({t:'inventory',inventory:host.inventory()});sentRevision=state.inventoryRevision;}
  }}
  catch(error){send({t:'fatal',message:'Combat host stopped'});clearInterval(timer);client?.destroy();server.close();host.close();closed=true;}
 },4);
 return Object.freeze({port:server.address().port,
  async close(){if(closed)return;closed=true;clearInterval(timer);client?.destroy();await new Promise(resolve=>server.close(resolve));host.close();},
 });
}
