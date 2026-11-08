using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using HollowWake.Storage;

static class Program
{
    static void Need(bool value,string note) { if(!value)throw new Exception(note); }
    static SaveResult Finish(SlotStore store,ulong ticket)
    {
        var timer=Stopwatch.StartNew();
        for(;;)
        {
            var reply=store.Poll(ticket);
            if(reply.Status!=SaveStatus.Pending)return reply;
            Need(timer.ElapsedMilliseconds<5000,"save timed out");
            Thread.Yield();
        }
    }
    static int Main(string[] args)
    {
        Need(args.Length==1 || (args.Length==2 && args[1]=="--legacy"),"owned fixture directory");
        string file=Path.Combine(args[0],"managed-é.db");
        var store=new SlotStore();
        var peer=new SlotStore();
        try
        {
            Need(store.Open("relative.db").Status==SaveStatus.InvalidPath,"relative path");
            Need(store.Open(file+"\0ignored").Status==SaveStatus.InvalidPath,"NUL path");
            Need(store.Open(file).Succeeded && !store.IsDisposed,"open");
            Need(store.Read(1).IsEmpty,"empty");
            Need(peer.Open(file).Succeeded,"peer");
            const string body="{\"__proto__\":{\"x\":1},\"uid\":9007199254740991,\"fraction\":0.125,\"text\":\"é𐀀\"}";
            const string stash="{\"items\":[],\"rng\":12345}";
            Need(store.Stage(1,0,"\ud800",stash).Status==SaveStatus.InvalidUtf8,"invalid UTF-16");
            Need(store.Stage(1,SlotStore.MaximumRevision,body,stash).Status==SaveStatus.InvalidRevisionOrSlot,"revision limit");
            Need(store.Stage(1,0,new string('x',SlotStore.DocumentLimit+1),stash).Status==SaveStatus.PayloadSize,"size limit");
            var staged=store.Stage(1,0,body,stash);
            Need(staged.Succeeded,"stage");
            Need(store.Read(1).Result.Status==SaveStatus.Unavailable,"staged owner");
            Need(peer.Read(1).IsEmpty,"uncommitted invisible");
            Need(peer.Stage(1,0,body,stash).Status==SaveStatus.Busy,"competing writer");
            Need(store.Commit(staged.Value+1).Status==SaveStatus.InvalidToken,"wrong token");
            Need(store.Commit(staged.Value).Succeeded,"commit");
            var saved=peer.Read(1);
            Need(saved.Revision==1 && saved.CraftingJson==body && saved.StashJson==stash,"exact saved text");
            Need(peer.Stage(1,0,body,stash).Status==SaveStatus.StaleRevision,"stale writer");
            staged=store.Stage(1,1,"cancelled",stash);
            Need(staged.Succeeded && store.Cancel(staged.Value).Succeeded,"cancel staged");
            var submitted=store.Submit(1,1,body+" ",stash+" ");
            Need(submitted.Succeeded && store.IsSaving,"submit");
            Need(store.Submit(1,1,"\ud800",stash).Status==SaveStatus.Unavailable,"refuse occupied before conversion");
            Need(store.Poll(submitted.Value+1).Status==SaveStatus.InvalidTicket && store.IsSaving,"wrong ticket");
            Need(Finish(store,submitted.Value).Succeeded && !store.IsSaving,"completed");
            Need(store.Poll(submitted.Value).Status==SaveStatus.InvalidTicket,"consumed once");
            saved=store.Read(1);
            Need(saved.Revision==2 && saved.CraftingJson==body+" " && saved.StashJson==stash+" ","continued documents");
            peer.Close();
            Need(store.Checkpoint().Complete,"checkpoint");
            Need(store.Close().Succeeded && store.Open(file,SaveJournal.Preserve).Succeeded,"reopen");
            var next=store.Submit(1,2,body,stash);
            Need(next.Succeeded && next.Value>submitted.Value,"ticket continuation");
            var cancelled=store.CancelAsync(next.Value);
            var completed=Finish(store,next.Value);
            Need(cancelled.Succeeded ? completed.Status==SaveStatus.Cancelled :
                cancelled.Status==SaveStatus.TooLate && completed.Succeeded,"cancellation boundary");
            saved=store.Read(1);
            Need(cancelled.Succeeded ? saved.Revision==2 : saved.Revision==3,"authoritative revision");
            Need(store.Close().Succeeded,"close");
            Need(store.Open(Path.Combine(args[0],"corrupt-utf8.db")).Succeeded,"malformed record fixture");
            Need(store.Read(1).Result.Status==SaveStatus.InvalidRecord,"refuse corrupt stored text");
            if(args.Length==1)GroupTests(args[0]);
            else
            {
                Need(!store.SupportsGroupedSaves,"old library feature detection");
                Need(store.ReadGroup(1).Result.Status==SaveStatus.AbiMismatch,"old library group read refusal");
                Need(store.StageGroup(new SaveWrite(1,0,"a","b")).Status==SaveStatus.AbiMismatch,"old library group write refusal");
            }
            store.Dispose();
            store.Dispose();
            Need(store.IsDisposed && !store.IsSaving,"disposed");
            bool refused=false;
            try { store.Read(1); } catch(ObjectDisposedException) { refused=true; }
            Need(refused,"disposed call");
        }
        finally { peer.Dispose();store.Dispose(); }
        Console.WriteLine(args.Length==2 ? "{\"passed\":true,\"binding\":\"dotnet\",\"legacyLibrary\":true,\"groupsRefused\":true}" :
            "{\"passed\":true,\"binding\":\"dotnet\",\"groupExtension\":1,\"courses\":[\"layout\",\"native-call\",\"text-roundtrip\",\"competing-writers\",\"atomic-publication\",\"bounds\",\"occupied-admission\",\"cancellation\",\"reopen\",\"disposal\",\"corrupt-record\",\"group-snapshot\",\"group-rollback\",\"group-limits\",\"group-owned-input\"]}");
        return 0;
    }
    static void GroupTests(string root)
    {
        using var store=new SlotStore();
        using var peer=new SlotStore();
        Need(store.SupportsGroupedSaves,"group extension layout");
        string file=Path.Combine(root,"managed-group.db");
        Need(store.Open(file).Succeeded && peer.Open(file).Succeeded,"group owners");
        const string body="account\0é𐀀", stash="9007199254740991";
        var initial=new[] {new SaveWrite(10,0,body,stash),new SaveWrite(20,0,"inventory","inventory-stash")};
        var transaction=store.StageGroup(initial);
        Need(transaction.Succeeded,"stage group");
        var before=peer.ReadGroup(20,99,10);
        Need(before.Result.Succeeded && before.Records.Length==3 && before.Records[0].IsEmpty && before.Records[2].IsEmpty,"group uncommitted invisible");
        Need(store.Commit(transaction.Value).Succeeded,"commit group");
        var saved=peer.ReadGroup(20,99,10);
        Need(saved.Result.Succeeded && saved.Records[0].CraftingJson=="inventory" && saved.Records[1].IsEmpty &&
            saved.Records[2].Revision==1 && saved.Records[2].CraftingJson==body && saved.Records[2].StashJson==stash,"group order and exact bytes");
        Need(store.ReadGroup(10,10).Result.Status==SaveStatus.InvalidArgument,"duplicate read slots");
        Need(store.ReadGroup().Result.Status==SaveStatus.InvalidArgument,"empty group read");
        Need(store.StageGroup(new SaveWrite(10,1,"lost","lost"),new SaveWrite(20,0,"stale","stale")).Status==SaveStatus.StaleRevision,"late stale group");
        Need(peer.Read(10).Revision==1 && peer.Read(10).CraftingJson==body,"whole group rollback");
        Need(store.SubmitGroup(new SaveWrite(10,1,body,stash),new SaveWrite(10,1,body,stash)).Status==SaveStatus.InvalidArgument,"duplicate write slots");
        Need(store.StageGroup(new SaveWrite(10,1,body,stash),new SaveWrite(20,1,"\ud800","a")).Status==SaveStatus.InvalidUtf8,"group UTF-16");
        Need(store.StageGroup(new SaveWrite(10,SlotStore.MaximumRevision,body,stash)).Status==SaveStatus.InvalidRevisionOrSlot,"group revision bound");
        string maximum=new string('x',SlotStore.DocumentLimit);
        var large=new SaveWrite[5];
        for(int i=0;i<large.Length;++i)large[i]=new SaveWrite((uint)(100+i),0,maximum,maximum);
        Need(store.SubmitGroup(large).Status==SaveStatus.PayloadSize && !store.IsSaving,"aggregate group byte bound");
        var exact=new SaveWrite[4];Array.Copy(large,exact,4);
        transaction=store.StageGroup(exact);
        Need(transaction.Succeeded && store.Commit(transaction.Value).Succeeded,"exact aggregate boundary");
        var full=store.ReadGroup(103,102,101,100);
        Need(full.Result.Succeeded && full.Records[0].CraftingJson==maximum && full.Records[3].StashJson==maximum,"full bounded group");
        initial[0]=new SaveWrite(10,1,body+"next",stash);
        initial[1]=new SaveWrite(20,1,"next-inventory","next-stash");
        var submitted=store.SubmitGroup(initial);
        Need(submitted.Succeeded && store.IsSaving,"async group");
        initial[0]=new SaveWrite(10,1,"overwritten","overwritten");
        Need(store.Submit(30,0,"a","b").Status==SaveStatus.Unavailable,"shared single request owner");
        Need(store.SubmitGroup(new SaveWrite(10,1,"\ud800","a")).Status==SaveStatus.Unavailable,"group occupied before encoding");
        Need(Finish(store,submitted.Value).Succeeded && !store.IsSaving,"group completion");
        var after=store.ReadGroup(10,20);
        Need(after.Result.Succeeded && after.Records[0].Revision==2 && after.Records[1].Revision==2 &&
            after.Records[0].CraftingJson==body+"next" && after.Records[1].CraftingJson=="next-inventory","group owned inputs");
        Need(saved.Records[2].CraftingJson==body,"managed reads are detached");
        Need(store.Close().Succeeded && store.Open(file,SaveJournal.Preserve).Succeeded,"group reopen");
        after=store.ReadGroup(10,20);
        Need(after.Result.Succeeded && after.Records[0].Revision==2 && after.Records[1].CraftingJson=="next-inventory","group durable continuation");
        store.Dispose();
        bool refused=false;
        try { store.ReadGroup(10,20); } catch(ObjectDisposedException) { refused=true; }
        Need(refused && after.Records[0].CraftingJson==body+"next","group disposal and detached output");
    }
}
