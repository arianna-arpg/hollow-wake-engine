import path from 'node:path';
import assert from 'node:assert/strict';

// Test-only scheduling adaptation. Each original course runs intact, in order.
// Keep its observer, retained rows, RNG restoration and authored-data capture.
export function nativeStatusDeliveryEntry(helper, sourceRoot) {
  const imports = [];
  let body = helper.replace(/^import .*?;\r?\n/gm, line => {
    if (!line.includes("'node:")) imports.push(line);
    return '';
  });
  assert(!body.includes("from 'node:"));
  assert.equal(body.split('function course(').length, 2);
  body = body.replace('function course(', 'function runCourse(');
  const authored = body.indexOf('const authored=');
  assert(authored >= 0);
  const definitions = body.slice(0, authored), tail = body.slice(authored);
  const output = tail.indexOf('fs.writeFileSync(');
  assert(output >= 0);
  assert.equal(tail.split('fs.writeFileSync(').length, 2);
  return imports.join('').replace(/(['"])\.\.\/src\/([^'"]+)\1/g,
    (_all, _quote, file) => JSON.stringify(path.join(sourceRoot, 'src', file + '.ts').replaceAll('\\', '/'))) + `
const assert=(value,message)=>{if(!value)throw new Error(message);};
function* replay(){
  const schedule=[];
  function course(name,run){schedule.push([name,run]);}
  ${definitions}
  if(schedule.length!==88)throw new Error('Unexpected registered course count');
  for(const [name,run] of schedule){runCourse(name,run);yield rows.at(-1);}
  ${tail.slice(0, output)}
  return {schemaVersion:1,courses:rows.length,authored:pack(authored)};
}
export function create(){return replay();}
export function dispatch(controller,request){
  if(request.op==='services')return globalThis.courseServiceReport();
  if(request.op!=='next')throw new Error('Unsupported course request');
  try{return controller.next();}catch(error){throw new Error(String(error)+'\\n'+error.stack);}
}
`;
}
