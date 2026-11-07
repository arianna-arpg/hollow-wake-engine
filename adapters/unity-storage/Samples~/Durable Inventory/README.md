# Durable inventory sample

Install both the gameplay 0.2 preview and storage package. Import **Durable
Inventory** from Package Manager, then choose **Hollow Wake → Create durable
inventory sample** and press Play. Open the workshop, forge a helmet and inlay
Morren. Wait for the saved confirmation, then leave Play mode and return.

Inventory appears only after its save succeeds. A locked save leaves the previous
inventory visible; a competing session asks you to reload before retrying.
The sample grants one Morren only when creating its first saved profile.

Saves use Application.persistentDataPath/HollowWakeWorkshop/inventory.db.
The sample never deletes or resets an existing save. The game owns this path and
station permissions. This minimal immediate-mode UI demonstrates the adapter;
use your game's interface and input system for a production inventory.

The stored gameplay snapshot and stash remain complete opaque strings. The
sample reads a few display fields without serializing those partial fields back
into the saved documents. Disabling the component closes its native resources.
Normal scene transitions should wait for the current save's observed completion.
