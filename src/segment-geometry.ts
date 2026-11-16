/** Original finite point-to-segment distance, shared by bands and constructs. */
export function pointSegDist(px:number,py:number,ax:number,ay:number,bx:number,by:number):number{
  const dx=bx-ax,dy=by-ay,len2=dx*dx+dy*dy,value=len2<=0?0:((px-ax)*dx+(py-ay)*dy)/len2,t=value<0?0:value>1?1:value;
  return Math.hypot(px-(ax+dx*t),py-(ay+dy*t));
}
