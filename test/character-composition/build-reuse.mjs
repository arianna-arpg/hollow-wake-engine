// Appended checks leave the accepted 343-group course and original fixtures intact.
function checkAccountBuildReuse(){
 const trace=[],kernel=new CompleteAccountKernel(completeBase,{reuseAccountBuilds:true,trace:row=>trace.push(row),conditions:()=>progressConditions});
 const owner=new CompleteOwner({...completeDefs,completeKernel:kernel,relicBuilds:true});
 accountComplete(owner,81);for(const profile of [81,82,83])startComplete(owner,profile,81,poorReroll());
 cs(owner,{op:'activate-workshop',account:81,profile:81});
 const activation=cs(owner,{op:'prepare',commands:[{op:'activate-workshop',account:81,profile:82}]});
 assert.deepEqual(owner.preparedJournal(activation.token)[0].transitions.map(row=>row.profile),[82,81,83],'Opted-in reuse skipped activation publication');
 cs(owner,{op:'abort-prepared',token:activation.token});
 const observation=()=>{const a=as(owner,81).save.progression.account;return{op:'account',account:81,command:{op:'observe',level:a.level,credits:a.credits+1,roster:copy(a.roster),ledger:{...a.ledger,reuse_probe:(a.ledger.reuse_probe??0)+1}}};};
 const snapshot=()=>copy([as(owner,81),ws(owner,81),ws(owner,82),ws(owner,83)]);
 const subsequent=()=>{trace.length=0;cs(owner,wcmd(81,{...rerollOriginal.original[0].request,access:invAccess}));assert.equal(trace.length,1,'Account association caused redundant sibling normalization');};
 for(const outcome of ['commit','abort','failure']){
  const before=snapshot(),command=observation();
  if(outcome==='failure'){
   assert.equal(owner.command({op:'prepare',commands:[command,barcmd(999,{op:'bind',slot:1,skillId:'firebolt'})]}).ok,false);
   assert.deepEqual(snapshot(),before,'Failed account association escaped preparation');
  }else{
   const pending=cs(owner,{op:'prepare',commands:[command]});assert(pending.token);
   assert.deepEqual(pending.writes,[{kind:'account',handle:81}],'Account reassociation invented character writes');
   assert.equal(owner.preparedJournal(pending.token)[0].transitions.length,0,'Account reassociation invented build transitions');
   assert.deepEqual(snapshot(),before,'Account association escaped preparation');
   cs(owner,{op:outcome+'-prepared',token:pending.token});
   if(outcome==='abort')assert.deepEqual(snapshot(),before,'Aborted account association changed committed records');
  }
  subsequent();
 }
}
