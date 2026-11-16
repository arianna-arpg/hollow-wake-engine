import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const args=process.argv.slice(2);if(args.length&&!((args.length===2||args.length===4)&&args[0]==='--host'&&(args.length===2||args[2]==='--port')))throw Error('Use node serve.mjs [--host ADDRESS [--port PORT]]');
const host=args[1]??'127.0.0.1',port=Number(args[3]??8787);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');
const root=path.dirname(fileURLToPath(import.meta.url)),allowed=new Set(['index.html','browser-worker.mjs','workload.mjs','manifest.json']);
const server=http.createServer((request,response)=>{
 const name=request.url==='/'?'index.html':request.url?.slice(1);
 if(request.method!=='GET'||!allowed.has(name)){response.writeHead(404);response.end();return;}
 response.setHeader('Content-Type',name.endsWith('.mjs')?'text/javascript':name.endsWith('.json')?'application/json':'text/html');
 response.setHeader('Cache-Control','no-store');const input=fs.createReadStream(path.join(root,name));input.on('error',()=>response.destroy());input.pipe(response);
});
server.listen(port,host,()=>console.log('Performance runner: http://'+host+':'+port+'/ (Ctrl+C to stop)'));
