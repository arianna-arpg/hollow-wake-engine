# Hollow Wake inventory workshop

Open project.godot in Godot 4.7.2 and play the main scene, or start the
exported game. The pack starts with four rings and a fifth in overflow.
Select a pack ring and choose **Equip item**. Select another ring and turn on
**Compare with equipped** to see the differences. A second equip fills the
empty hand. The **Equipped** tab returns a piece to the pack when space allows.
The workshop character is level ten.
Select an overflow item and choose **Move to stash**. To return it to the pack,
first sell a pack item to free a cell. **Forge ring** uses the SDK's item and
placement rules. Each completed action saves automatically.

The example includes the verified crafting and progression addon and a separate
SQLite save extension. Both crafting state and stash state belong to one versioned
slot in user://inventory.sqlite3. Tabs select the current inventory location.
Reload reads the latest committed slot, including changes saved by another window.

The example's small pack, stash capacity, starter items and access to a selling
counter are host choices. The crafting SDK owns item generation, placement,
protected sales, RNG and UID continuation. A game can supply its own save backend
through the profile coordinator. Keep both item owners in the same transaction.
# Gem and memory sample

Launch the exported player with `-- --cargo-sample` to open an independent
sample save. It starts with an empowered Firebolt, a rolled Multistrike support
and two memory pouches. Select each item to inspect it. Selling the stacked
Preformed Memory opens a confirmation that names the whole-stack price.
The standard workshop and the sample each use their own SQLite file.

Select Firebolt, choose an automatic or numbered seat, and press **Learn skill**.
Open **Skills** to inspect it. **Return skill to pack** creates a fresh gem item
with its empowerment, locked supports and individual rolls. Reload reopens the
same seats, bag and stash. The sample hero has 12 Intelligence and zero in the
other attributes. A game supplies its own hero attributes and current holds on
unlearning. The workshop runs in a sanctuary with no active holds.

Choose **Support sample** in the inventory header, or launch with
`-- --support-sample`, for a separate save containing a
locked, rolled Teeming Vein. Learn Firebolt, select the loose support, and
choose **Socket support**. Select Firebolt on the Skills tab to remove a
particular support. You can also return Firebolt to the pack and remove a
support directly from its gem. A full pack keeps the support in its socket.

To measure support checks on Linux, run
`./Inventory.x86_64 --headless -- --measure-supports > support-result.txt`.
The same arguments work with `Inventory.exe` on Windows. The measurement
uses two original-game reference cases and opens no inventory save.
