# Vestige inlays

The SDK owns material grants and the inventory transaction that spends one vestige on one socket. A whole-item drop fills the first empty socket; an aimed drop can overwrite a filled socket. Overwriting destroys the previous stone, including when both IDs match. An epitaph awakens on common gear with the exact full sequence and an eligible category.

Install the candidate archive and run `node node_modules/@hollow-wake/engine/examples/vestiges.mjs` for a complete Held Breath inscription. The standalone catalogue provides all 14 vestiges, their glyphs and category effects, and all 10 epitaphs in original registry order.

```js
import {VestigeCatalogue} from '@hollow-wake/engine/items/vestiges/catalogue';
import {VestigeInlays} from '@hollow-wake/engine/items/vestiges';
import pack from '@hollow-wake/engine/content/vestiges.json' with {type:'json'};

const book = new VestigeCatalogue(pack);
const actions = new VestigeInlays({
  vestige: id => book.vestige(id),
  word: (item, sockets) => book.word(item.rarity, categoryOf(item.baseId), sockets),
});
const preview = actions.preview(character, itemUid, undefined, 'sylph');
if (preview.changed) actions.inlay(character, itemUid, preview.index, 'sylph', hooks);
```

The host supplies `categoryOf`, its bag, equipped items and satchel. A grant announces a pickup, updates its feed through the host, and marks the character dirty. An inlay debits the satchel and mutates the original item before emitting crumble and inlay cues. It then reads the live word, recalculates worn gear and marks the character dirty. Callback interruption leaves preceding writes visible. A pure preview returns the targeted socket, replacement and projected word without invoking callbacks.

For an owned, rollback-safe working copy, construct `CraftingSession` with `new WorkshopVestiges(itemContent)` from `@hollow-wake/engine/items/vestiges/workshop`. Its `grant-vestige` and `inlay-vestige` commands validate safe integer counts and numeric item IDs, preserve RNG and UID continuation, and return events only after validating the new state. Use `result.needsSave` to decide whether to persist. Omitting `socket` requests the first empty slot. A caller supplying `socket` must first verify the displayed save revision before committing. Direct inlay calls also reject fractional indices. The original game's network decoder admits integer indices.

The first successful grant adds a satchel to the save and selects crafting-session/v3. A failed action leaves a legacy save in its existing format. The Godot workshop writes the satchel, socketed item and character revision in the same SQLite transaction. Its ordinary and support samples use separate save slots from the **Vestige sample**. Open that sample, select the helmet, and choose **Inlay a vestige**. Morren followed by Sylph awakens Held Breath. A filled item requires choosing a socket explicitly before spending.

Run `npm run reference:vestiges` in a prepared SDK checkout to verify the immutable source observations, public package, game adapter and content. The game remains responsible for physical pickup, network authority, UI, and persistence. Physical-device frame times remain open.
