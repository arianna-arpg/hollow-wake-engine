import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {Readable,Transform} from 'node:stream';import {pipeline,finished} from 'node:stream/promises';
import {setTimeout as delay} from 'node:timers/promises';import {spawnSync} from 'node:child_process';

const transient=new Set([408,429,500,502,503,504]);
export class TransientHttpError extends Error {
 constructor(status,url,retryAfter){
  super(`HTTP ${status} downloading ${url}`);this.status=status;
  const seconds=Number(retryAfter),requested=Number.isFinite(seconds)?seconds*1000:Date.parse(retryAfter)-Date.now();
  this.retryDelayMs=Number.isFinite(requested)?Math.max(0,Math.min(requested,30000)):0;
 }
}
/** Retry explicit transient HTTP failures only. Corruption, transport and local
 * filesystem errors retain their original failure. Never retry an entire build. */
async function retryHttp(operation,{wait=delay,onRetry=info=>console.warn('Retrying tool download',info)}={}){
 for(let attempt=1;attempt<=3;attempt++){
  try{return await operation(attempt);}catch(error){
   if(!(error instanceof TransientHttpError)||!transient.has(error.status)||attempt===3)throw error;
   const delayMs=Math.max(attempt*1000,error.retryDelayMs);onRetry({status:error.status,attempt,nextAttempt:attempt+1,delayMs});await wait(delayMs);
  }
 }
}

/** Stream into a new caller-owned path. Only the exact pinned bytes may remain
 * after success; every partial file this operation creates is removed on error. */
export async function downloadPinned(item,output,{fetchImpl=globalThis.fetch,...retry}={}){
 const url=new URL(item.url);
 if(url.protocol!=='https:'||!Number.isSafeInteger(item.bytes)||item.bytes<0||!/^[a-f0-9]{64}$/.test(item.sha256))throw Error('Invalid pinned download');
 const parent=fs.realpathSync(path.dirname(output)),destination=path.join(parent,path.basename(output));
 try{fs.lstatSync(destination);throw Error('Download destination already exists');}catch(error){if(error.code!=='ENOENT')throw error;}
 const signal=AbortSignal.timeout(600000);
 return retryHttp(async attempt=>{
  const response=await fetchImpl(item.url,{signal});
  if(!response.ok){
   await response.body?.cancel().catch(()=>{});
   if(transient.has(response.status))throw new TransientHttpError(response.status,item.url,response.headers.get('retry-after'));
   throw Error(`HTTP ${response.status} downloading ${item.url}`);
  }
  if(!response.body)throw Error('Download response has no body');
  const digest=createHash('sha256');let bytes=0,owned=false,complete=false;
  const writer=fs.createWriteStream(destination,{flags:'wx'});writer.once('open',()=>{owned=true;});
  try{
   await pipeline(Readable.fromWeb(response.body),new Transform({transform(chunk,_,done){
    bytes+=chunk.length;if(bytes>item.bytes)return done(Error('Archive exceeds pinned size'));
    digest.update(chunk);done(null,chunk);
   }}),writer);
   if(bytes!==item.bytes)throw Error('Archive does not match pinned size');
   const sha256=digest.digest('hex');if(sha256!==item.sha256)throw Error('Archive does not match pinned checksum');
   complete=true;return{bytes,sha256,attempts:attempt};
  }finally{
   writer.destroy();await finished(writer).catch(()=>{});
   if(owned&&!complete){if(fs.realpathSync(path.dirname(destination))!==parent)throw Error('Download parent changed');fs.unlinkSync(destination);}
  }
 },retry);
}

/** Keep Electron's own version/checksum installer. Retry only its explicit HTTP
 * status failures, not checksum errors, crashes or arbitrary failed scripts. */
export async function installReferenceElectron(installer,{run,write=chunk=>process.stderr.write(chunk),...retry}={}){
 const file=fs.realpathSync(installer);
 run??=()=>spawnSync(process.execPath,[file],{encoding:'utf8',windowsHide:true,timeout:600000,maxBuffer:4*1024*1024});
 return retryHttp(async attempt=>{
  const result=run(file);for(const chunk of [result.stdout,result.stderr])if(chunk)write(chunk);
  if(result.error)throw result.error;if(result.signal)throw Error(`Electron installer terminated by ${result.signal}`);
  if(result.status===0)return{passed:true,attempts:attempt};
  const status=(result.stderr??'').match(/(?:^|\n)HTTPError: Response code (408|429|500|502|503|504)\b/);
  const error=status?new TransientHttpError(Number(status[1]),'Electron release'):Error('Electron installer failed');
  error.exitCode=Number.isInteger(result.status)&&result.status>0&&result.status<256?result.status:1;throw error;
 },retry);
}
