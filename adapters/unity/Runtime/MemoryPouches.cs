using System;
using UnityEngine;

namespace HollowWake.Gameplay
{
    /// <summary>Local-player pouch transactions. Keep opaque JSON fields intact
    /// when persisting a move; commit only against the inventory revision seen by the UI.</summary>
    public sealed class MemoryPouches : IDisposable
    {
        readonly GameplayHost host = GameplayHost.OpenMemoryPouches();
        public string ContentId => PackHashes.PouchId;
        [Serializable] class Request
        {
            public string op, state, memory, group, facet;
            public long uid, nextUid;
            public int level;
            public bool @sealed;
        }
        [Serializable] public class Group { public string key, name, rung; public int count; }
        [Serializable] public class Facet { public string id, label; }
        [Serializable] public class Panel { public long uid; public int total; public string kind, refusal; public Group[] groups; }
        [Serializable] public class Preview { public bool ok; public string reason; public Panel view; public Facet[] facets; }
        [Serializable] public class Reveal { public string kind, id, name, rarity; public long itemUid; }
        [Serializable] public class Move
        {
            public bool ok;
            public string reason, itemsJson, ledgerJson, memoryJson;
            public long nextUid;
            public Reveal result;
        }
        public Preview Inspect(string stateJson, long uid, int level, string memoryJson = null, bool sealedSpoils = false)
        {
            CheckUid(uid);
            var request = new Request { op="inspectText", state=stateJson, memory=memoryJson, uid=uid, level=level, @sealed=sealedSpoils };
            return JsonUtility.FromJson<Preview>(host.Execute(JsonUtility.ToJson(request)));
        }
        public Move Recall(string stateJson, long uid, int level, string group, long nextUid,
            string facet = null, string memoryJson = null, bool sealedSpoils = false)
        {
            CheckUid(uid);
            if (nextUid < 1 || nextUid >= 9007199254740991L) throw new ArgumentOutOfRangeException(nameof(nextUid));
            var request = new Request { op="recallText", state=stateJson, memory=memoryJson, uid=uid, level=level, @sealed=sealedSpoils,
                group=group, nextUid=nextUid, facet=facet };
            return JsonUtility.FromJson<Move>(host.Execute(JsonUtility.ToJson(request)));
        }
        static void CheckUid(long uid)
        {
            if (uid < 1 || uid > 9007199254740991L) throw new ArgumentOutOfRangeException(nameof(uid));
        }
        public void Dispose() => host.Dispose();
    }
}
