using System;
using System.Globalization;
using UnityEngine;

namespace HollowWake.Gameplay
{
    /// <summary>Shared progression rules and up to eight independent accounts.
    /// The game supplies earned observations, starting grants and durable writes.</summary>
    public sealed class AccountProgression : IDisposable
    {
        readonly GameplayHost host;
        readonly object gate=new object();
        bool closed;
        const long MaxInteger=9007199254740991L;
        [Serializable] class Reply { public bool ok; public string reason,text; }
        [Serializable] class ProfileRequest { public string op; public uint profile; }
        [Serializable] class OpenRequest : ProfileRequest { public uint seed; }
        [Serializable] class TextRequest : ProfileRequest { public string text; }
        [Serializable] class OpenTextRequest : TextRequest { public uint seed; }
        [Serializable] class ObserveRequest : ProfileRequest { public long level,credits; public string ledger,roster; }
        [Serializable] class IdCommand { public string op,id; }
        [Serializable] class InvestCommand : IdCommand { public long amount; }
        [Serializable] class PageCommand { public string op; public uint offset; public int limit; }
        static Reply Require(string json)
        {
            var reply=JsonUtility.FromJson<Reply>(json);
            if(reply==null||!reply.ok)throw new InvalidOperationException("Hollow Wake progression refused: "+reply?.reason);
            return reply;
        }
        static void Integer(long value,string name)
        {
            if(value<0||value>MaxInteger)throw new ArgumentOutOfRangeException(name);
        }
        void Check()
        {
            if(closed||host.IsClosed)throw new ObjectDisposedException(nameof(AccountProgression));
        }
        public AccountProgression(){host=GameplayHost.OpenProgression();}
        /// <summary>Omit accountJson for a blank account. Starter grants remain a host decision.</summary>
        public Profile OpenProfile(uint id,uint seed,string accountJson=null)
        {
            lock(gate)
            {
                Check();
                var request=accountJson==null?
                    JsonUtility.ToJson(new OpenRequest {op="open",profile=id,seed=seed}):
                    JsonUtility.ToJson(new OpenTextRequest {op="open-text",profile=id,seed=seed,text=accountJson});
                Require(host.Execute(request));
                return new Profile(this,id);
            }
        }
        public Profile RestoreProfile(uint id,string snapshotJson)
        {
            if(snapshotJson==null)throw new ArgumentNullException(nameof(snapshotJson));
            lock(gate)
            {
                Check();
                Require(host.Execute(JsonUtility.ToJson(new TextRequest {op="restore-text",profile=id,text=snapshotJson})));
                return new Profile(this,id);
            }
        }
        public GameplayHost.Metrics ReadMetrics(){lock(gate)return host.ReadMetrics();}
        public GameplayHost.Traffic ReadTraffic(){lock(gate)return host.ReadTraffic();}
        public void Dispose(){lock(gate){host.Dispose();closed=true;}}

        public sealed class Profile : IDisposable
        {
            readonly AccountProgression owner;
            readonly uint id;
            bool closed;
            internal Profile(AccountProgression owner,uint id){this.owner=owner;this.id=id;}
            void Check()
            {
                if(closed)throw new ObjectDisposedException(nameof(Profile));
                owner.Check();
            }
            /// <summary>One command without a profile field. Returns the complete JSON reply.
            /// ok=true can still contain a refused gameplay purchase (result=false).</summary>
            public string Execute(string commandJson)
            {
                if(commandJson==null)throw new ArgumentNullException(nameof(commandJson));
                lock(owner.gate)
                {
                    Check();
                    return owner.host.Execute(JsonUtility.ToJson(new TextRequest {op="profile-command",profile=id,text=commandJson}));
                }
            }
            /// <summary>Complete versioned account and RNG continuation; preserve verbatim.</summary>
            public string Save()
            {
                lock(owner.gate)
                {
                    Check();
                    return Require(owner.host.Execute(JsonUtility.ToJson(new ProfileRequest {op="snapshot-text",profile=id}))).text;
                }
            }
            public string Buy(string unlockId)=>Execute(JsonUtility.ToJson(new IdCommand {op="buy",id=unlockId}));
            public string Invest(string unlockId,long amount)
            {
                Integer(amount,nameof(amount));
                return Execute(JsonUtility.ToJson(new InvestCommand {op="invest",id=unlockId,amount=amount}));
            }
            public string Settle()=>Execute("{\"op\":\"settle\"}");
            public string Acknowledge(string unlockId)=>Execute(JsonUtility.ToJson(new IdCommand {op="acknowledge",id=unlockId}));
            public string Catalogue(uint offset=0,int limit=32)=>Execute(JsonUtility.ToJson(new PageCommand {op="catalogue",offset=offset,limit=limit}));
            /// <summary>Replace authoritative earned observations, preserving purchased rewards.</summary>
            public string Observe(long level,long credits,string ledgerJson,string rosterJson)
            {
                Integer(level,nameof(level));Integer(credits,nameof(credits));
                if(ledgerJson==null)throw new ArgumentNullException(nameof(ledgerJson));
                if(rosterJson==null)throw new ArgumentNullException(nameof(rosterJson));
                lock(owner.gate)
                {
                    Check();
                    return owner.host.Execute(JsonUtility.ToJson(new ObserveRequest {op="observe-text",profile=id,
                        level=level,credits=credits,ledger=ledgerJson,roster=rosterJson}));
                }
            }
            public string UpdateRelics(string stateJson)
            {
                if(stateJson==null)throw new ArgumentNullException(nameof(stateJson));
                lock(owner.gate)
                {
                    Check();
                    return owner.host.Execute(JsonUtility.ToJson(new TextRequest {op="relics-text",profile=id,text=stateJson}));
                }
            }
            public void Dispose()
            {
                // Serializing retirement with open/execute prevents an old Profile
                // from reaching a newly opened account that reuses the same number.
                lock(owner.gate)
                {
                    if(closed)return;
                    if(!owner.closed&&!owner.host.IsClosed)
                        Require(owner.host.Execute("{\"op\":\"close\",\"profile\":"+id.ToString(CultureInfo.InvariantCulture)+"}"));
                    closed=true;
                }
            }
        }
    }
}
