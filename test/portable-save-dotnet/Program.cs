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
        Need(args.Length==1,"owned fixture directory");
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
            store.Dispose();
            store.Dispose();
            Need(store.IsDisposed && !store.IsSaving,"disposed");
            bool refused=false;
            try { store.Read(1); } catch(ObjectDisposedException) { refused=true; }
            Need(refused,"disposed call");
        }
        finally { peer.Dispose();store.Dispose(); }
        Console.WriteLine("{\"passed\":true,\"binding\":\"dotnet\",\"courses\":[\"layout\",\"native-call\",\"text-roundtrip\",\"competing-writers\",\"atomic-publication\",\"bounds\",\"occupied-admission\",\"cancellation\",\"reopen\",\"disposal\",\"corrupt-record\"]}");
        return 0;
    }
}
