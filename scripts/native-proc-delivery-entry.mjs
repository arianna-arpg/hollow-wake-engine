import path from 'node:path';
import assert from 'node:assert/strict';

/** Adapt only test scheduling and output. Each original course runs intact.
 * Release the observer's emitted row between requests so the test log does
 * not accumulate inside the embedded game heap. */
export function nativeProcDeliveryEntry(helper, sourceRoot) {
  const imports=[];
  let body=helper.replace(/^import .*?;\r?\n/gm,line=>{
    if(!line.includes("'node:"))imports.push(line);
    return '';
  });
  assert(!body.includes("from 'node:"));
  const guard="if(process.argv[3]&&process.argv[3]!==name)return;";
  assert.equal(body.split(guard).length,2);body=body.replace(guard,'');
  assert.equal(body.split('function course(').length,2);body=body.replace('function course(','function runCourse(');
  const marker='const authored=pack({procs:PROC_LIST,riders:PROC_RIDER_LIST});';
  assert.equal(body.split(marker).length,2);
  const definitions=body.slice(0,body.indexOf(marker)), output=body.slice(body.indexOf(marker));
  assert.equal(output.trim(),marker+"assert(rows.length>0,'No matching course');\nfs.writeFileSync(process.argv[2],JSON.stringify({schemaVersion:1,courses:rows.length,authored,rows},null,2)+'\\n');");
  const prefix=imports.join('').replace(/(['"])\.\.\/src\/([^'"]+)\1/g,(_all,_quote,file)=>JSON.stringify(path.join(sourceRoot,'src',file+'.ts').replaceAll('\\','/')));
  return prefix+`
function assert(value,message){if(!value)throw new Error(message);}
assert.equal=(actual,expected,label)=>{if(!Object.is(actual,expected))throw new Error(String(label??'Equality')+' '+String(actual)+' != '+String(expected));};
function* replay(){
  const schedule=[];
  function course(name,run,seed){schedule.push([name,run,seed]);}
  ${definitions}
  assert.equal(schedule.length,328,'Registered proc courses');
  let completed=0;
  for(const [name,run,seed] of schedule){
    runCourse(name,run,seed);assert.equal(rows.length,1,'One emitted course');completed++;
    yield rows.pop();
  }
  ${marker}
  return {schemaVersion:1,courses:completed,authored};
}
export function create(){return replay();}
export function dispatch(controller,request){
  if(request.op==='services')return globalThis.courseServiceReport();
  if(request.op!=='next')throw new Error('Unsupported proc replay request');
  try{return controller.next();}catch(error){throw new Error(String(error)+'\\n'+error.stack);}
}
`;
}
