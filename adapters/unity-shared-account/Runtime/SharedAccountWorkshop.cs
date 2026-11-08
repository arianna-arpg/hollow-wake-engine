using System;
using System.Collections.Generic;
using UnityEngine;

namespace HollowWake.Gameplay
{
    /// <summary>One shared account authority across independently owned inventories.
    /// Supply the compiled shared-account entry and its matching content table.
    /// Earnings, command authorization and durable storage remain game-owned.</summary>
    public sealed class SharedAccountWorkshop : IDisposable
    {
        readonly GameplayHost host;
        readonly object gate=new object();
        bool closed;
        [Serializable] class Reply { public bool ok;public string reason,text;public long token,version,accountVersion;public WriteReply[] writes; }
        [Serializable] internal class WriteReply { public string kind;public uint handle; }
        [Serializable] class AccountRequest { public string op;public uint account; }
        [Serializable] class AccountText : AccountRequest { public string text; }
        [Serializable] class AccountOpen : AccountText { public string key;public uint seed; }
        [Serializable] class InventoryRequest { public string op;public uint profile; }
        [Serializable] class InventoryText : InventoryRequest { public string text; }
        [Serializable] class InventoryRestore : InventoryText { public uint account; }
        [Serializable] class InventoryOpen : InventoryRestore { public uint seed;public bool progression;public long nextUid; }
        [Serializable] class Batch { public string op="prepare-text",text; }
        [Serializable] class TokenRequest { public string op;public long token; }
        [Serializable] class PreparedSave : TokenRequest { public string kind;public uint handle; }

        public bool IsDisposed { get { lock(gate)return closed||host.IsClosed; } }
        public static SharedAccountWorkshop Open(uint heapMiB=48) => new SharedAccountWorkshop(
            GameplayHost.Read("SharedAccountRules",SharedAccountPackHashes.Rules),
            GameplayHost.Read("SharedAccountContent",SharedAccountPackHashes.Content),heapMiB);
        public SharedAccountWorkshop(byte[] rules,byte[] content,uint heapMiB=48)
        { host=GameplayHost.Create(rules,content,heapMiB,true); }
        void Check()
        { if(closed||host.IsClosed)throw new ObjectDisposedException(nameof(SharedAccountWorkshop)); }
        string Run(object request)
        {
            Check();
            try { return host.Execute(JsonUtility.ToJson(request)); }
            catch { Dispose();throw; }
        }
        static Reply Require(string json)
        {
            var reply=JsonUtility.FromJson<Reply>(json);
            if(reply==null||!reply.ok)throw new InvalidOperationException("Shared account refused: "+reply?.reason);
            return reply;
        }
        /// <summary>Fields JSON contains optional state, craftLore and extra objects.
        /// Extra data is retained verbatim; it cannot override routing fields.</summary>
        public Account OpenAccount(uint id,string key,uint seed,string fieldsJson="{}")
        {
            if(key==null||fieldsJson==null)throw new ArgumentNullException(nameof(fieldsJson));
            lock(gate)
            {
                Require(Run(new AccountOpen {op="open-account-text",account=id,key=key,seed=seed,text=fieldsJson}));
                return new Account(this,id);
            }
        }
        public Account RestoreAccount(uint id,string saveJson)
        {
            if(saveJson==null)throw new ArgumentNullException(nameof(saveJson));
            lock(gate)
            {
                Require(Run(new AccountText {op="restore-account-text",account=id,text=saveJson}));
                return new Account(this,id);
            }
        }
        /// <summary>Stages 1–16 commands and at most eight changed records. Replies
        /// and events are provisional. Inspect gameplay results before saving;
        /// transport ok=true alone does not mean a purchase succeeded. Persist all
        /// candidate records atomically with revision checks before Commit.</summary>
        public PreparedChange Prepare(params Command[] commands)
        {
            if(commands==null||commands.Length<1||commands.Length>16)throw new ArgumentOutOfRangeException(nameof(commands));
            lock(gate)
            {
                Check();var encoded=new string[commands.Length];
                for(int i=0;i<commands.Length;i++)
                {
                    var command=commands[i];
                    if(command==null||!ReferenceEquals(command.Owner,this))throw new ArgumentException("Commands must belong to this owner.",nameof(commands));
                    encoded[i]=command.Encode();
                }
                var reply=Require(Run(new Batch {text="["+String.Join(",",encoded)+"]"}));
                // A managed admission failure after native preparation must not
                // strand a proposal that the caller cannot address or abort.
                try { return new PreparedChange(this,reply.token,reply.text,reply.writes); }
                catch { Dispose();throw; }
            }
        }
        public GameplayHost.Metrics ReadMetrics(){lock(gate)return host.ReadMetrics();}
        public GameplayHost.Traffic ReadTraffic(){lock(gate)return host.ReadTraffic();}
        public void Dispose(){lock(gate){closed=true;host.Dispose();}}

        public sealed class SavedRecord
        {
            public readonly string Json;
            public readonly long Version,AccountVersion;
            internal SavedRecord(string json,long version,long accountVersion)
            { Json=json;Version=version;AccountVersion=accountVersion; }
        }
        static SavedRecord Saved(Reply reply)
        {
            if(reply.text==null)throw new InvalidOperationException("Missing complete save text.");
            return new SavedRecord(reply.text,reply.version,reply.accountVersion);
        }
        public sealed class Account : IDisposable
        {
            internal readonly SharedAccountWorkshop Owner;
            public uint Handle { get; }
            bool closed;
            internal Account(SharedAccountWorkshop owner,uint id){Owner=owner;Handle=id;}
            internal void Check(){if(closed)throw new ObjectDisposedException(nameof(Account));Owner.Check();}
            public Command Command(string commandJson)
            { if(commandJson==null)throw new ArgumentNullException(nameof(commandJson));lock(Owner.gate){Check();return new Command(this,null,commandJson);} }
            public string Execute(string commandJson)
            { lock(Owner.gate){return Owner.Run(Command(commandJson).Request());} }
            public SavedRecord Save()
            { lock(Owner.gate){Check();return Saved(Require(Owner.Run(new AccountRequest {op="account-save-text",account=Handle})));} }
            public Inventory OpenInventory(uint id,uint seed,string stateJson,bool progression=true,long nextUid=0)
            {
                if(stateJson==null)throw new ArgumentNullException(nameof(stateJson));
                if(nextUid<0||nextUid>9007199254740991L)throw new ArgumentOutOfRangeException(nameof(nextUid));
                lock(Owner.gate)
                {
                    Check();Require(Owner.Run(new InventoryOpen {op="open-workshop-text",profile=id,account=Handle,seed=seed,
                        progression=progression,nextUid=nextUid,text=stateJson}));return new Inventory(this,id);
                }
            }
            public Inventory RestoreInventory(uint id,string saveJson)
            {
                if(saveJson==null)throw new ArgumentNullException(nameof(saveJson));
                lock(Owner.gate)
                {
                    Check();Require(Owner.Run(new InventoryRestore {op="restore-workshop-text",profile=id,account=Handle,text=saveJson}));
                    return new Inventory(this,id);
                }
            }
            public void Dispose()
            {
                lock(Owner.gate)
                {
                    if(closed)return;
                    if(!Owner.IsDisposed)Require(Owner.Run(new AccountRequest {op="close-account",account=Handle}));
                    closed=true;
                }
            }
        }
        public sealed class Inventory : IDisposable
        {
            internal readonly Account Account;
            public uint Handle { get; }
            bool closed;
            internal Inventory(Account account,uint id){Account=account;Handle=id;}
            internal void Check(){if(closed)throw new ObjectDisposedException(nameof(Inventory));Account.Check();}
            public Command Command(string commandJson)
            { if(commandJson==null)throw new ArgumentNullException(nameof(commandJson));lock(Account.Owner.gate){Check();return new Command(null,this,commandJson);} }
            public string Execute(string commandJson)
            { lock(Account.Owner.gate){return Account.Owner.Run(Command(commandJson).Request());} }
            public SavedRecord Save()
            { lock(Account.Owner.gate){Check();return Saved(Require(Account.Owner.Run(new InventoryRequest {op="workshop-save-text",profile=Handle})));} }
            public void Dispose()
            {
                lock(Account.Owner.gate)
                {
                    if(closed)return;
                    if(!Account.Owner.IsDisposed)Require(Account.Owner.Run(new InventoryRequest {op="close-workshop",profile=Handle}));
                    closed=true;
                }
            }
        }
        public sealed class Command
        {
            readonly Account account;readonly Inventory inventory;readonly string text;
            internal SharedAccountWorkshop Owner => account?.Owner??inventory.Account.Owner;
            internal Command(Account account,Inventory inventory,string text){this.account=account;this.inventory=inventory;this.text=text;}
            internal object Request()
            {
                if(account!=null){account.Check();return new AccountText {op="account-command-text",account=account.Handle,text=text};}
                inventory.Check();return new InventoryText {op="workshop-command-text",profile=inventory.Handle,text=text};
            }
            internal string Encode()=>JsonUtility.ToJson(Request());
        }
        public sealed class PreparedWrite
        {
            public readonly string Kind;public readonly uint Handle;
            internal PreparedWrite(string kind,uint handle){Kind=kind;Handle=handle;}
        }
        public sealed class PreparedChange : IDisposable
        {
            readonly SharedAccountWorkshop owner;readonly long token;bool closed;
            public readonly string RepliesJson;
            public IReadOnlyList<PreparedWrite> Writes { get; }
            public bool HasChanges => token!=0;
            internal PreparedChange(SharedAccountWorkshop owner,long token,string replies,WriteReply[] writes)
            {
                if(token<0||token>9007199254740991L||replies==null||writes==null||writes.Length>8||((token==0)!=(writes.Length==0)))
                    throw new InvalidOperationException("Invalid prepared reply.");
                this.owner=owner;this.token=token;RepliesJson=replies;
                var list=new List<PreparedWrite>(writes.Length);
                foreach(var write in writes)
                {
                    if(write==null||(write.kind!="account"&&write.kind!="workshop"))throw new InvalidOperationException("Invalid prepared record.");
                    list.Add(new PreparedWrite(write.kind,write.handle));
                }
                Writes=list.AsReadOnly();
            }
            void Check(){if(closed)throw new ObjectDisposedException(nameof(PreparedChange));owner.Check();}
            public SavedRecord Save(int index)
            {
                lock(owner.gate)
                {
                    Check();if(index<0||index>=Writes.Count)throw new ArgumentOutOfRangeException(nameof(index));
                    var write=Writes[index];return Saved(Require(owner.Run(new PreparedSave {op="prepared-save-text",token=token,kind=write.Kind,handle=write.Handle})));
                }
            }
            /// <summary>Publish only after an acknowledged atomic durable write,
            /// or explicitly accept in-memory-only ownership. A failure after the
            /// disk commit requires disposing and restoring the complete group.</summary>
            public void Commit()
            {
                lock(owner.gate)
                {
                    Check();if(token!=0)Require(owner.Run(new TokenRequest {op="commit-prepared",token=token}));closed=true;
                }
            }
            public void Dispose()
            {
                lock(owner.gate)
                {
                    if(closed)return;
                    if(token!=0&&!owner.IsDisposed)Require(owner.Run(new TokenRequest {op="abort-prepared",token=token}));closed=true;
                }
            }
        }
    }
}
