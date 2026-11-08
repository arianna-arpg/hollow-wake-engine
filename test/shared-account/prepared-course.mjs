import assert from 'node:assert/strict';
const copy=value=>JSON.parse(JSON.stringify(value));

// The serial control is the unchanged, frozen pre-transaction implementation.
// Its ordinary results and complete saves decide the candidate's expected
// behavior. This generator never updates a captured original fixture.
export function preparedCourse(candidate,original,opening,text=false,firstToken=1){
 const rows=[],control=[],name='prepared-'+(text?'text':'direct');
 function envelope(request){
  const {op,account,profile}=request;
  if(op==='account'||op==='workshop')return {op:op+'-command-text',...(op==='account'?{account}:{profile}),text:JSON.stringify(request.command)};
  if(op==='prepare')return {op:'prepare-text',text:JSON.stringify(request.commands.map(envelope))};
  if(op==='prepared-save'||op==='account-save'||op==='workshop-save')return {...request,op:op+'-text'};
  return request;
 }
 const send=request=>{
  const encoded=text?envelope(request):request,reply=copy(candidate(copy(encoded)));rows.push({request:copy(encoded),reply});
  if(!reply.ok||!Object.hasOwn(reply,'text'))return reply;
  const {text:body,...rest}=reply;return {...rest,[request.op==='prepare'?'replies':'save']:JSON.parse(body)};
 };
 const serial=request=>{const reply=copy(original(copy(request)));control.push({request:copy(request),reply});assert(reply.ok);return reply;};
 const ok=request=>{const reply=send(request);assert.equal(reply.ok,true,JSON.stringify(reply));return reply;};
 assert.deepEqual(opening.map(row=>row.request.op),['open-account','open-workshop']);
 for(const row of opening){assert.deepEqual(ok(row.request),row.reply);assert.deepEqual(serial(row.request),row.reply);}
 const second={...opening[1].request,profile:2,seed:71};assert.deepEqual(ok(second),serial(second));
 const saveRequests=[{op:'account-save',account:1},{op:'workshop-save',profile:1},{op:'workshop-save',profile:2}];
 const before=saveRequests.map(serial);assert.deepEqual(saveRequests.map(ok),before);
 const memory={op:'account',account:1,command:{op:'buy',id:'memory_discovery'}};
 const salvage=profile=>({op:'workshop',profile,command:{op:'salvage',uid:1002,lane:'break',access:{salvage:true,oracle:true,bench:true,counter:true}}});
 const commands=[memory,salvage(1),salvage(2)],expected=commands.map(serial),after=saveRequests.map(serial);
 const writes=[{kind:'account',handle:1},{kind:'workshop',handle:1},{kind:'workshop',handle:2}];
 const first=ok({op:'prepare',commands});assert.deepEqual(first,{ok:true,token:firstToken,writes,replies:expected});
 assert.deepEqual(saveRequests.map(ok),before);
 assert.equal(send(memory).reason,'prepared-change-pending');
 const prepared=(token,write)=>({op:'prepared-save',token,...write});
 assert.deepEqual(writes.map(write=>ok(prepared(first.token,write))),after);
 ok({op:'abort-prepared',token:first.token});assert.deepEqual(saveRequests.map(ok),before);
 const invalid={op:'prepare',commands:[memory,{...salvage(1),command:{...salvage(1).command,lane:'invalid'}}]};
 assert.equal(send(invalid).ok,false);assert.deepEqual(saveRequests.map(ok),before);
 const next=ok({op:'prepare',commands});assert.deepEqual(next,{...first,token:firstToken+1});
 for(const op of ['commit-prepared','abort-prepared'])assert.equal(send({op,token:firstToken}).reason,'stale-prepared-change');
 assert.equal(send(prepared(firstToken,writes[0])).reason,'stale-prepared-change');
 assert.deepEqual(writes.map(write=>ok(prepared(next.token,write))),after);
 ok({op:'commit-prepared',token:next.token});assert.deepEqual(saveRequests.map(ok),after);
 assert.equal(send({op:'commit-prepared',token:next.token}).reason,'no-prepared-change');
 assert.deepEqual(ok(memory),serial(memory));assert.deepEqual(saveRequests.map(ok),saveRequests.map(serial));
 const query={op:'account',account:1,command:{op:'catalogue',offset:0,limit:1}};
 assert.deepEqual(ok({op:'prepare',commands:[query]}),{ok:true,token:0,writes:[],replies:[serial(query)]});
 for(const request of [{op:'close-workshop',profile:1},{op:'close-workshop',profile:2},{op:'close-account',account:1}])assert.deepEqual(ok(request),serial(request));
 return {name,rows,control};
}
