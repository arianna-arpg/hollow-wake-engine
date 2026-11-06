import assert from 'node:assert/strict';
// Observe the inventory's actual top-level divs, preserving order and nested
// compatibility rows. Fail on any new section that the portable card omits.
const plain=s=>s.replace(/<\/?(?:div|span)\b[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|#39|#\d+);/g,t=>{
  const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"'};
  return named[t]??String.fromCodePoint(Number(t.slice(2,-1)));
}).replace(/\s+/g,' ').trim();
function sections(html){
  const out=[];let depth=0,start=0;
  for(const match of html.matchAll(/<\/?div\b[^>]*>/g)){
    if(match[0][1]==='/'){assert(depth>0);if(--depth===0)out.push(html.slice(start,match.index+match[0].length));}
    else if(depth++===0)start=match.index;
  }
  assert.equal(depth,0);return out;
}
export function verifyFace(r,card,essences){
  const html=r.card,lines=[];let price=null,locked=false,gesture=null,showcase=null,fit=null,req=[];
  assert.equal(card.title,plain(html.title),r.label);assert.equal(card.meta,plain(html.meta),r.label);
  assert.equal(card.color,/color:([^";]+)/.exec(html.title)[1]);
  for(const block of sections(html.description)){
    const text=plain(block);
    if(text.startsWith('⚙')||text.startsWith('⚒')){assert.equal(price,null);price=block;continue;}
    if(text.startsWith('🔒')){locked=true;continue;}
    if(text.startsWith('drag onto a rack seat')){gesture='learn';continue;}
    if(text.startsWith('drag onto a skill')){gesture='socket';continue;}
    if(text.startsWith('right-click (or double-click) opens the Recall')){gesture='recall';continue;}
    if(block.includes('class="skill-showcase')){
      const attr=id=>new RegExp(id+'="([^"]+)"').exec(block)?.[1];
      showcase={skillId:attr('data-skill-showcase'),level:Number(attr('data-showcase-level')),
        supports:(attr('data-showcase-supports')??'').split(',').filter(Boolean).map(s=>{const [id,l]=s.split(':');return {id,level:Number(l)};})};
      continue;
    }
    if(block.includes('class="support-compatibility"')){
      fit=sections(block.slice(block.indexOf('>')+1,-6)).slice(1).filter(s=>s.includes('data-support-fit=')).map(s=>({
        fits:s.includes('data-support-fit="true"'),slot:Number(/data-skill-slot="(\d+)"/.exec(s)[1]),
        name:plain(/<span[^>]*>([^<]+)<\/span>/.exec(s)[0]),
        capacity:s.includes('>Sockets full<')?'full':s.includes('>No sockets<')?'none':null}));
      if(!fit.length)assert(block.includes('No equipped skills.'));
      continue;
    }
    if(text.startsWith('Requires:'))req=[...block.matchAll(/<span style="color:(#[0-9a-f]+)">([^<]+)<\/span>/g)].map(m=>({text:m[2],met:m[1]==='#6fc06f'}));
    lines.push(text);
  }
  assert.deepEqual(card.lines.map(s=>s.replace(/\s+/g,' ').trim()),lines,r.label);
  assert.equal(card.locked,locked,r.label);assert.equal(card.gesture,gesture,r.label);
  assert.deepEqual(card.showcase??null,showcase);
  assert.deepEqual(card.requirements?.map(q=>({text:q.label+' '+q.need,met:q.met}))??[],req);
  assert.deepEqual(card.compatibility?.map(({fits,slot,name,capacity})=>({fits,slot,name,capacity}))??null,fit);
  assert.equal(Boolean(card.quote),Boolean(price),r.label);
  if(price){
    const q=card.quote,text=plain(price);
    assert.equal(q.action,text.startsWith('⚙')?'sell':'break');assert.equal(q.confirm,text.includes('a prompt confirms first'));
    assert.deepEqual(q.amount,q.action==='sell'?r.values.sell:r.values.salvage??null);
    if(q.amount){
      if(essences){const e=essences.get(q.amount.essence);assert.deepEqual(q.material,{label:e.label,color:e.color,glyph:e.glyph});}
      assert(price.includes('style="color:'+q.material.color+'" title="'+q.material.label+'">'+q.amount.count+q.material.glyph+'</span>'),r.label);
    }
    else assert(q.reason==='granted'?text.includes('NOTHING'):q.reason==='memory'&&text.includes('no use for memories'),r.label);
  }
  if(card.pouch){
    const p=card.pouch,all=r.values.groups;
    assert.equal(p.kind,r.values.kind);assert.equal(p.count,r.item.mem.length);assert.equal(p.newest,r.values.newest);assert.equal(all.length,p.groups.length+p.hidden);
    assert.deepEqual(p.groups.map(g=>[g.key,g.count]),all.slice(0,p.groups.length).map(g=>[g.key,g.count]));
    for(const g of p.groups)if(g.pin)assert(html.description.includes('style="color:'+g.pin.color+'">— sealed to '),r.label);
  }
}
