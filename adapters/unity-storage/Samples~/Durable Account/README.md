# Durable account and inventory

Install Hollow Wake Gameplay 0.4.0-preview.1 or later alongside this storage
package, then import **Durable Account** from Package Manager's Samples section.
Choose **Hollow Wake → Create durable account sample**, press Play, and open the
account. Discover a memory or forge a helmet. Wait for the saved confirmation,
leave Play mode, then reopen to continue.

The example grants 1,000 credits only when both reserved records are empty.
Forging is explicitly free in this example. These are example permissions,
not a new game economy. A memory discovery and a forge are separate actions.
The component keeps full account/inventory JSON and random continuation intact;
its partial display models never become save data.

The default save lives in Unity's application data directory under
HollowWakeAccountWorkshop/account-inventory.db. Slots 10 and 20 belong to this
example. Existing or incomplete records are never overwritten by initialization.
Close normally after pending completion; forced lifecycle cleanup may cancel
an unadmitted write or wait for an admitted commit.

This sample does not combine the progression account and workshop expertise
into one domain model. Account-derived workshop permissions, shared ledger
ownership and cross-system purchase rules remain explicit host integration work.
See the package README for the coordinator's precise boundary.
