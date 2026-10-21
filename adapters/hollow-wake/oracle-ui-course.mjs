import assert from 'node:assert/strict';

/** Test-only navigation revision for the frozen course. Source hash verification
 * remains in the runner. The original course's gameplay assertions are retained. */
export function reviseOracleCourse(source) {
 const replace=(before,after,count)=>{assert.equal(source.split(before).length,count+1,'Oracle course navigation anchor changed: '+before);source=source.replaceAll(before,after);};
 replace("document.querySelector('.dialogue-close').click();",
  "const close = document.querySelector('#npc-dialogue [data-panel-x]'); if (!close) throw Error('Dialogue close control missing'); close.click();\n      if (!document.getElementById('npc-dialogue').hidden || !__game.ui.oracleOpen) throw Error('Closing conversation must preserve Oracle storage');",2);
 // Inventory remembers the selected page across close/reopen. A navigation
 // request must show that page, rather than toggle the workspace closed.
 replace("__game.ui.containerPane.openFromMenu('reliquary');","__game.ui.containerPane.toggle('reliquary', w.localSeat.id, 'show');",1);
 replace("document.querySelector('[data-containerflap=\"reliquary\"]').click();",
  "document.querySelector('#oracle-menu [data-panel-x]').click(); if (__game.ui.oracleOpen || !__game.ui.inventoryOpen) throw Error('Oracle close must preserve player Inventory'); __game.ui.containerPane.toggle('reliquary', w.localSeat.id, 'show'); __game.ui.folioSync(); if (!__game.ui.containerPane.isOpen('reliquary')) throw Error('Reliquary must be visible for exchange');",1);
 // NPC services and player pages have separate books. A standalone Oracle
 // service has no tab strip; require the actual surface to be visible either way.
 replace("document.querySelector('[data-folio-tab=\"oracle\"]').click();",
  "(() => { if (!__game.ui.oracleOpen) __game.ui.showOracle(); __game.ui.folioSync(); const tab = document.querySelector('[data-folio-tab=\"oracle\"]'); if (tab) tab.click(); const menu = document.getElementById('oracle-menu'); if (!__game.ui.oracleOpen || !menu || !menu.getBoundingClientRect().width || getComputedStyle(menu).display === 'none') throw Error('Oracle storage must be visible'); })();",2);
 return source;
}
