import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {root,sha256} from '../../scripts/reference-utils.mjs';
import {installCharacterSources} from './install-character-sources.mjs';

const file='src/engine/world.ts';
function locate(source){
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  const worlds=ast.statements.filter(n=>ts.isClassDeclaration(n)&&n.name?.text==='World');
  assert.equal(worlds.length,1);
  return Object.fromEntries(['grantVestige','socketVestige'].map(name=>{
    const nodes=worlds[0].members.filter(n=>ts.isMethodDeclaration(n)&&n.name.getText(ast)===name);
    assert.equal(nodes.length,1,name);return [name,nodes[0].body];
  }));
}
export function renderVestiges(source,original){
  const input=source.replaceAll('\r\n','\n'),clean=original.replaceAll('\r\n','\n');
  assert(!input.includes('sdkVestigeInlays'),'Vestige adapter already installed');
  const live=locate(input),base=locate(clean);
  const bodies={
    grantVestige:`{
    sdkVestigeInlays.grant(seat.meta,id,count,{
      granted:(def,n)=>{
        this.text(seat.actor.pos,def.glyph+' '+def.name+(n>1?' ×'+n:''),def.color,13,'pickup');
        notePickup(this.pickupFeed,seat.id,def.glyph+' '+def.name,def.color,this.time,n);
      },
      dirty:()=>this.markMetaDirty(seat),
    });
  }`,
    socketVestige:`{
    sdkVestigeInlays.inlay(seat.meta,uid,socketIdx,vestigeId,{
      crumbled:(id,old)=>this.text(seat.actor.pos,(old?.glyph??'')+' '+(old?.name??id)+' crumbles away','#8a8678',12),
      inlaid:def=>this.text(seat.actor.pos,def.glyph+' inlaid',def.color,13),
      awakened:(word,item)=>this.text(vec(seat.actor.pos.x,seat.actor.pos.y-26),'✦ the '+word.name+' awakens on '+item.name,'#ffd700',15),
      recalculate:()=>this.recalcSeat(seat), dirty:()=>this.markMetaDirty(seat),
    });
  }`,
  };
  let out=input;
  for(const name of Object.keys(bodies).sort((a,b)=>live[b].pos-live[a].pos)){
    const n=live[name];assert.equal(n.getText(),base[name].getText(),'Unreviewed World.'+name);
    out=out.slice(0,n.getStart())+bodies[name]+out.slice(n.end);
  }
  out="import {VestigeInlays as SdkVestigeInlays} from '@hollow-wake/engine/items/vestiges';\n"+out+`
const sdkVestigeInlays = new SdkVestigeInlays({
  vestige:(id:string)=>Object.hasOwn(VESTIGES,id)?VESTIGES[id]:undefined,
  word:(item:ItemInstance,sockets:readonly (string|null)[])=>{
    const base=ITEM_BASES[item.baseId];
    return base?epitaphFor(item.rarity,base.category,sockets):null;
  },
});
`;
  return source.includes('\r\n')?out.replaceAll('\n','\r\n'):out;
}
export function integrateVestiges(game,install=true){
  const pinned=fs.readFileSync(path.join(root,'.reference',file));
  assert.equal(sha256(pinned),JSON.parse(fs.readFileSync(path.join(root,'baseline/source-lock.json'))).files[file]);
  const before=fs.readFileSync(path.join(game,file)),after=Buffer.from(renderVestiges(before.toString(),pinned.toString()));
  if(install)installCharacterSources(game,[{file,before,after}]);
  return {files:[file],decision:'World pickup and socket actions use SDK vestige transactions and the live game cues and recalculation.'};
}
