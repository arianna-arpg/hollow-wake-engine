# Hollow Wake support compatibility

This optional package supplies the original skill, rolled-cut, component and
summon-crew admission rules. Pass the current learned skill payloads in seat
order, including empty seats, and the loose support payload. The result gives
each occupied seat's compatibility, socket count and occupied count. The first
vacant socket receives an admitted support. The host still checks its
discipline hold and the observed save revision before committing.

`createSupportReader(index, readPage)` retains up to four parsed pages. The host
reads the given byte range from `pages.txt` and returns its UTF-8 `text` and
the SHA-256 it computed over those bytes. A missing or changed page refuses the
query. Hosts that already own the full definitions may call `fitSupport` with
their own synchronous record lookup. Both APIs expect admitted inventory
payloads and act on current socket rolls and selected skill-tree nodes.

~~~js
import {createSupportReader} from '@hollow-wake/workshop-support-fit';
const fit=createSupportReader(index,readPage);
const seats=fit(saved.state.rack.map(row=>row?.gem??null),looseItem.gem);
~~~
