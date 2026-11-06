// Only the Godot adapter speaks this private wire format. Public content,
// commands and saves remain ordinary JSON. Keep easy integers as numbers;
// exchange other doubles by their bits, avoiding the engine's decimal codec.
const scratch = new DataView(new ArrayBuffer(8));
const textByte = Array.from({length:256}, (_, i) => i.toString(16).padStart(2,'0'));
const invalidText=/[\u0000\uD800-\uDFFF]/u;
function numberTag(value) {
  if (!Number.isFinite(value)) throw new RangeError('non-finite');
  if (Number.isInteger(value) && Math.abs(value)<=0x7fffffff) return value;
  scratch.setFloat64(0,value,true);
  let tag='~f';
  for(let i=0;i<8;i++)tag+=textByte[scratch.getUint8(i)];
  return tag;
}
function scalar(value,encode) {
  if(typeof value==='number') {
    if(encode)return numberTag(value);
    if(!Number.isSafeInteger(value)||Math.abs(value)>0x7fffffff)throw new RangeError('invalid wire number');
  }
  if(typeof value!=='string')return value;
  if(invalidText.test(value))throw new TypeError('nonportable text');
  if(value[0]!=='~')return value;
  if(encode)return '~'+value;
  if(value[1]==='~')return value.slice(1);
  if(!/^~f[0-9a-f]{16}$/.test(value))throw new TypeError('invalid wire string');
  for(let i=0;i<8;i++)scratch.setUint8(i,parseInt(value.slice(2+2*i,4+2*i),16));
  const n=scratch.getFloat64(0,true);if(!Number.isFinite(n))throw new RangeError('non-finite');return n;
}
function convert(value,encode,budget,depth=0) {
  if(--budget.n<0||depth>64)throw new RangeError('value limit');
  if(value===null||typeof value!=='object')return scalar(value,encode);
  // SDK replies can contain shared immutable definitions. Copy only paths
  // whose wire representation differs; never modify an input or SDK reply.
  let out=value;
  for(const key of Object.keys(value)){
    if(invalidText.test(key))throw new TypeError('nonportable key');
    const before=value[key],after=convert(before,encode,budget,depth+1);
    if(before===after)continue;
    if(out===value)out=Array.isArray(value)?value.slice():{...value};
    out[key]=after;
  }
  return out;
}
const transform=(v,encode)=>convert(v,encode,{n:65536});
export function godotDispatch(command) {
  return (session,wire)=>{
    if(!Array.isArray(wire)||wire.length!==2)return {ok:false,reason:'invalid-json'};
    const [op,payload]=wire;
    let value;
    try{
      if(op==='parse'){
        if(typeof payload!=='string'||payload.length>524288)throw new RangeError('text limit');
        return {ok:true,value:transform(JSON.parse(payload),true)};
      }
      value=transform(payload,false);
      if(op==='format'){
        const text=JSON.stringify(value);if(text.length>524288)throw new RangeError('text limit');
        return {ok:true,text};
      }
      if(op!=='command')throw new TypeError('unknown operation');
    }catch{return {ok:false,reason:'invalid-json'};}
    // Execution happens exactly once. An unexpected delivery fault must not
    // be reported as an admission refusal or retried.
    return transform(command(session,value),true);
  };
}
