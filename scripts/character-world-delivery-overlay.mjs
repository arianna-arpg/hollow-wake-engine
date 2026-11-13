import assert from 'node:assert/strict';
/** Diagnostic guarded integration into the pinned World method. No original
 * source file is written. The marker owns only bare-gem delivery pickups. */
export function patchWorldDelivery(source){
 const from=`      const seat = this.pickupSeat(drop.pos, ITEM_CFG.pickupTouch.gem, exclude, drop.tier);
      if (!seat) continue;
      const item = drop.item;`;
 assert.equal(source.split(from).length,2,'Original gem pickup boundary changed');
 const to=`      const seat = this.pickupSeat(drop.pos, ITEM_CFG.pickupTouch.gem, exclude, drop.tier);
      if (!seat) continue;
      // Durable gems may only enter inventory through their account owner.
      // An unavailable bridge leaves them in the world for recovery.
      if ((drop as any).sdkDelivery !== undefined) {
        (this as any).sdkDeliveryPickup?.(drop, seat);
        continue;
      }
      const item = drop.item;`;
 return source.replace(from,()=>to);
}
