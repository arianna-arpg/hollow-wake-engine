using System;
using System.Globalization;
using UnityEngine;

namespace HollowWake.Gameplay
{
    /// <summary>Shared immutable workshop content and up to two independent profiles.
    /// Hosts authorize actions and persist the complete snapshot before publishing changes.</summary>
    public sealed class CraftingWorkshop : IDisposable
    {
        readonly GameplayHost host;
        bool closed;
        [Serializable] class Reply { public bool ok; public string reason, text; }
        [Serializable] class TextRequest { public string op, text; public uint profile; }
        [Serializable] class OpenRequest : TextRequest { public uint seed; public long nextUid; }
        [Serializable] class Configure { public string op, text; }
        static Reply Require(string json)
        {
            var reply=JsonUtility.FromJson<Reply>(json);
            if(reply==null||!reply.ok)throw new InvalidOperationException("Hollow Wake workshop refused: "+reply?.reason);
            return reply;
        }
        public CraftingWorkshop()
        {
            host=GameplayHost.OpenWorkshop();
            try
            {
                Require(host.Execute(JsonUtility.ToJson(new Configure {op="configure-inspection",text=GameplayHost.WorkshopInspection()})));
                Require(host.Execute(JsonUtility.ToJson(new Configure {op="configure-equipment",text=GameplayHost.WorkshopEquipment()})));
            }
            catch{host.Dispose();throw;}
        }
        /// <summary>Zero selects the first unused ID above all supplied items.</summary>
        public Profile OpenProfile(uint id,uint seed,string stateJson,long nextUid=0)
        {
            if(nextUid<0||nextUid>9007199254740991L)throw new ArgumentOutOfRangeException(nameof(nextUid));
            Require(host.Execute(JsonUtility.ToJson(new OpenRequest {op="open-text",profile=id,seed=seed,nextUid=nextUid,text=stateJson})));
            return new Profile(this,id);
        }
        public Profile RestoreProfile(uint id,string snapshotJson)
        {
            Require(host.Execute(JsonUtility.ToJson(new TextRequest {op="restore-text",profile=id,text=snapshotJson})));
            return new Profile(this,id);
        }
        public GameplayHost.Metrics ReadMetrics()=>host.ReadMetrics();
        public GameplayHost.Traffic ReadTraffic()=>host.ReadTraffic();
        /// <summary>Read item cards, loadout comparisons or inlay previews without
        /// changing a profile. Full item values remain opaque JSON.</summary>
        public string Query(string queryJson)
        {
            if(queryJson==null)throw new ArgumentNullException(nameof(queryJson));
            return host.Execute(JsonUtility.ToJson(new Configure {op="workshop-query",text=queryJson}));
        }
        public void Dispose(){host.Dispose();closed=true;}

        public sealed class Profile : IDisposable
        {
            readonly CraftingWorkshop owner;
            readonly uint id;
            bool closed;
            internal Profile(CraftingWorkshop owner,uint id){this.owner=owner;this.id=id;}
            void Check()
            {
                if(closed||owner.closed||owner.host.IsClosed)throw new ObjectDisposedException(nameof(Profile));
            }
            /// <summary>Execute one SDK command without a profile field. Returns
            /// the complete reply, including refusals, item bodies and ordered events.
            /// Read operations do not authorize a later mutation.</summary>
            public string Execute(string commandJson)
            {
                Check();
                if(commandJson==null)throw new ArgumentNullException(nameof(commandJson));
                return owner.host.Execute(JsonUtility.ToJson(new TextRequest {op="profile-command",profile=id,text=commandJson}));
            }
            /// <summary>Complete versioned JSON; preserve it verbatim in the host save.</summary>
            public string Save()
            {
                Check();
                return Require(owner.host.Execute("{\"op\":\"snapshot-text\",\"profile\":"+id.ToString(CultureInfo.InvariantCulture)+"}")).text;
            }
            public void Dispose()
            {
                if(closed)return;
                if(!owner.closed&&!owner.host.IsClosed)
                    Require(owner.host.Execute("{\"op\":\"close\",\"profile\":"+id.ToString(CultureInfo.InvariantCulture)+"}"));
                closed=true;
            }
        }
    }
}
