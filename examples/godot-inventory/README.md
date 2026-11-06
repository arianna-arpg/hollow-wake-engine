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
