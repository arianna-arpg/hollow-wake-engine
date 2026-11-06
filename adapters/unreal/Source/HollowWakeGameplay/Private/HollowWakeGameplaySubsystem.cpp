#include "HollowWakeGameplaySubsystem.h"
#include "HweRuntime.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonSerializer.h"

namespace
{
using FObject = TSharedPtr<FJsonObject>;
constexpr int64 MaxUid = 9007199254740991LL;

FString Encode(const TSharedRef<FJsonObject>& Object)
{
    FString Json;
    auto Writer = TJsonWriterFactory<TCHAR, TCondensedJsonPrintPolicy<TCHAR>>::Create(&Json);
    FJsonSerializer::Serialize(Object, Writer);
    return Json;
}

bool Accepted(const FString& Json, FObject& Reply, FString& Error)
{
    bool bOk = false;
    if (FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Json), Reply) && Reply.IsValid() &&
        Reply->TryGetBoolField(TEXT("ok"), bOk))
    {
        if (bOk) return true;
        if (Reply->TryGetStringField(TEXT("message"), Error) || Reply->TryGetStringField(TEXT("error"), Error) ||
            Reply->TryGetStringField(TEXT("reason"), Error)) return false;
    }
    Error = TEXT("Unexpected Hollow Wake reply");
    return false;
}

FHollowWakeCast ReadCast(const FObject& Object)
{
    FHollowWakeCast Cast;
    Object->TryGetStringField(TEXT("kind"), Cast.Kind);
    Object->TryGetStringField(TEXT("skillId"), Cast.SkillId);
    Object->TryGetStringField(TEXT("reason"), Cast.Reason);
    Object->TryGetNumberField(TEXT("token"), Cast.Token);
    return Cast;
}

bool PouchRequest(const FHollowWakePouch& Context, const TCHAR* Op, TSharedRef<FJsonObject> Request, FString& Error)
{
    if (Context.ItemUid < 1 || Context.ItemUid > MaxUid) { Error = TEXT("Invalid pouch UID"); return false; }
    Request->SetStringField(TEXT("op"), Op);
    Request->SetStringField(TEXT("state"), Context.InventoryJson);
    Request->SetStringField(TEXT("memory"), Context.MemoryJson);
    Request->SetNumberField(TEXT("uid"), static_cast<double>(Context.ItemUid));
    Request->SetNumberField(TEXT("level"), Context.Level);
    Request->SetBoolField(TEXT("sealed"), Context.bSealed);
    return true;
}
}

bool UHollowWakeGameplaySubsystem::Execute(bool bPouches, const FString& Request, FString& Reply, FString& Error)
{
    Error.Reset();
    Reply.Reset();
    if (!IsInGameThread() || bClosed) { Error = TEXT("Gameplay world unavailable"); return false; }
    auto& Runtime = bPouches ? PouchRuntime : CombatRuntime;
    if (!Runtime)
    {
        auto Candidate = MakeShared<FHweRuntime>();
        if (!Candidate->Open(bPouches, Error)) return false;
        Runtime = Candidate;
    }
    return Runtime->Execute(Request, Reply, Error);
}

bool UHollowWakeGameplaySubsystem::ExecuteCombat(const FString& Request, FString& Reply, FString& Error)
{
    return Execute(false, Request, Reply, Error);
}

bool UHollowWakeGameplaySubsystem::ExecutePouches(const FString& Request, FString& Reply, FString& Error)
{
    return Execute(true, Request, Reply, Error);
}

bool UHollowWakeGameplaySubsystem::ReadRuntimeMetrics(bool bPouches, FHollowWakeRuntimeMetrics& Out) const
{
    Out = {};
    if (!IsInGameThread()) return false;
    const auto& Runtime = bPouches ? PouchRuntime : CombatRuntime;
    return Runtime && Runtime->ReadMetrics(Out);
}

bool UHollowWakeGameplaySubsystem::OpenActor(const TCHAR* Op, const FString& Text, FHollowWakeActor& Actor, FString& Error)
{
    Actor = {};
    auto Request = MakeShared<FJsonObject>();
    Request->SetNumberField(TEXT("version"), 1);
    Request->SetStringField(TEXT("op"), Op);
    Request->SetStringField(TEXT("text"), Text);
    FString Json;
    FObject Reply;
    if (!ExecuteCombat(Encode(Request), Json, Error) || !Accepted(Json, Reply, Error)) return false;
    if (!Reply->TryGetNumberField(TEXT("handle"), Actor.Id)) { Error = TEXT("Missing combat handle"); return false; }
    Actor.World = this;
    return true;
}

bool UHollowWakeGameplaySubsystem::CreateActor(const FString& Json, FHollowWakeActor& Actor, FString& Error)
{
    return OpenActor(TEXT("createText"), Json, Actor, Error);
}

bool UHollowWakeGameplaySubsystem::RestoreActor(const FString& Json, FHollowWakeActor& Actor, FString& Error)
{
    return OpenActor(TEXT("restoreText"), Json, Actor, Error);
}

bool UHollowWakeGameplaySubsystem::ActorReply(FHollowWakeActor Actor, const FString& Tail, FObject& Reply, FString& Error)
{
    if (Actor.World.Get() != this || Actor.Id <= 0) { Error = TEXT("Actor belongs to another world or is empty"); return false; }
    FString Json;
    const FString Request = FString::Printf(TEXT("{\"version\":1,\"handle\":%lld,"), Actor.Id) + Tail + TEXT("}");
    return ExecuteCombat(Request, Json, Error) && Accepted(Json, Reply, Error);
}

bool UHollowWakeGameplaySubsystem::SaveActor(FHollowWakeActor Actor, FString& SnapshotJson, FString& Error)
{
    SnapshotJson.Reset();
    FObject Reply;
    return ActorReply(Actor, TEXT("\"op\":\"snapshotText\""), Reply, Error) && Reply->TryGetStringField(TEXT("text"), SnapshotJson);
}

bool UHollowWakeGameplaySubsystem::ReleaseActor(FHollowWakeActor Actor, FString& Error)
{
    FObject Reply;
    return ActorReply(Actor, TEXT("\"op\":\"destroy\""), Reply, Error);
}

bool UHollowWakeGameplaySubsystem::Press(FHollowWakeActor Actor, FHollowWakeCast& Cast, FString& Error)
{
    Cast = {};
    FObject Reply;
    if (!ActorReply(Actor, TEXT("\"op\":\"command\",\"command\":{\"op\":\"press\"}"), Reply, Error)) return false;
    Cast = ReadCast(Reply->GetObjectField(TEXT("value")));
    return true;
}

bool UHollowWakeGameplaySubsystem::Advance(FHollowWakeActor Actor, double StepSeconds, int32 Steps, FHollowWakeFrame& Frame, FString& Error)
{
    Frame = {};
    if (!FMath::IsFinite(StepSeconds) || StepSeconds < 0 || StepSeconds > 60 || Steps < 1 || Steps > 64)
    { Error = TEXT("Expected 1 to 64 steps of 0 to 60 seconds each"); return false; }
    FObject Reply;
    const FString Tail = FString::Printf(TEXT("\"op\":\"advanceSteps\",\"dt\":%.17g,\"steps\":%d"), StepSeconds, Steps);
    if (!ActorReply(Actor, Tail, Reply, Error)) return false;
    const auto& Value = Reply->GetObjectField(TEXT("value"));
    Frame.Steps = Value->GetIntegerField(TEXT("steps"));
    Frame.Damage = Value->GetNumberField(TEXT("damage"));
    Frame.TargetLife = Value->GetNumberField(TEXT("targetLife"));
    const FObject* Cast = nullptr;
    if (Value->TryGetObjectField(TEXT("cast"), Cast))
    {
        Frame.Cast = ReadCast(*Cast);
        Frame.bHasCast = true;
    }
    return true;
}

bool UHollowWakeGameplaySubsystem::ResolveContact(FHollowWakeActor Actor, FHollowWakeHit& Hit, FString& Error)
{
    Hit = {};
    FObject Reply;
    if (!ActorReply(Actor, TEXT("\"op\":\"command\",\"command\":{\"op\":\"hit\"}"), Reply, Error)) return false;
    const auto& Value = Reply->GetObjectField(TEXT("value"));
    Hit.Damage = Value->GetNumberField(TEXT("damage"));
    Hit.Life = Value->GetNumberField(TEXT("life"));
    Hit.bCritical = Value->GetBoolField(TEXT("crit"));
    return true;
}

bool UHollowWakeGameplaySubsystem::ApplyTimedDamage(FHollowWakeActor Actor, double DamagePerSecond, FString& Result, FString& Error)
{
    Result.Reset();
    if (!FMath::IsFinite(DamagePerSecond) || DamagePerSecond < 0) { Error = TEXT("Invalid damage rate"); return false; }
    FObject Reply;
    const FString Tail = FString::Printf(TEXT("\"op\":\"command\",\"command\":{\"op\":\"applyDot\",\"dps\":%.17g}"), DamagePerSecond);
    return ActorReply(Actor, Tail, Reply, Error) && Reply->TryGetStringField(TEXT("value"), Result);
}

bool UHollowWakeGameplaySubsystem::InspectPouch(const FHollowWakePouch& Context, FString& Json, FString& Error)
{
    Json.Reset();
    auto Request = MakeShared<FJsonObject>();
    FObject Reply;
    return PouchRequest(Context, TEXT("inspectText"), Request, Error) && ExecutePouches(Encode(Request), Json, Error) &&
        Accepted(Json, Reply, Error);
}

bool UHollowWakeGameplaySubsystem::RecallPouch(const FHollowWakePouch& Context, const FString& Group, const FString& Facet,
    int64 NextUid, FString& Json, FString& Error)
{
    Json.Reset();
    if (NextUid < 1 || NextUid >= MaxUid) { Error = TEXT("Invalid next inventory UID"); return false; }
    auto Request = MakeShared<FJsonObject>();
    if (!PouchRequest(Context, TEXT("recallText"), Request, Error)) return false;
    Request->SetNumberField(TEXT("nextUid"), static_cast<double>(NextUid));
    Request->SetStringField(TEXT("group"), Group);
    Request->SetStringField(TEXT("facet"), Facet);
    FObject Reply;
    return ExecutePouches(Encode(Request), Json, Error) && Accepted(Json, Reply, Error);
}

bool UHollowWakeGameplaySubsystem::LoadMagicianConfiguration(FString& Json, FString& Error)
{
    Json.Reset();
    Error.Reset();
    return FHweRuntime::LoadSample(Json, Error);
}

void UHollowWakeGameplaySubsystem::Deinitialize()
{
    bClosed = true;
    CombatRuntime.Reset();
    PouchRuntime.Reset();
    Super::Deinitialize();
}
