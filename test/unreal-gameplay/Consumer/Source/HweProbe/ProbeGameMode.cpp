#include "ProbeGameMode.h"
#include "Engine/World.h"
#include "HollowWakeGameplaySubsystem.h"
#include "HollowWakeTrainingTarget.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonSerializer.h"

namespace
{
bool Replay(UHollowWakeGameplaySubsystem& Sdk, const FString& Folder, const FString& Stage, const FString& Name, FString& Error)
{
    TArray<FString> Requests, Replies;
    if (!FFileHelper::LoadFileToStringArray(Requests, *(Folder / (Name + TEXT(".requests"))))) return false;
    for (const auto& Request : Requests)
    {
        FString Reply;
        bool bOk = Name == TEXT("combat") ? Sdk.ExecuteCombat(Request, Reply, Error) : Sdk.ExecutePouches(Request, Reply, Error);
        if (!bOk) return false;
        Replies.Add(MoveTemp(Reply));
    }
    return FFileHelper::SaveStringArrayToFile(Replies, *(Folder / (Stage + TEXT("-") + Name + TEXT(".replies"))),
        FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
}

bool CheckWorld(UWorld& World, UHollowWakeGameplaySubsystem& Sdk, TSharedRef<FJsonObject> Receipt, FString& Error)
{
    FString Config, MidCast, LeftSave, RightSave, Effect;
    FHollowWakeActor Original, Restored, Rejected;
    FHollowWakeCast Cast;
    FHollowWakeFrame Frame, Continued;
    FHollowWakeHit Hit, Second;
    if (!Sdk.LoadMagicianConfiguration(Config, Error) || !Sdk.CreateActor(Config, Original, Error) ||
        !Sdk.Press(Original, Cast, Error) || Cast.Kind != TEXT("started") ||
        !Sdk.Press(Original, Cast, Error) || Cast.Reason != TEXT("busy") ||
        !Sdk.Advance(Original, 0.1, 1, Frame, Error) || Frame.bHasCast ||
        !Sdk.SaveActor(Original, MidCast, Error) || Sdk.RestoreActor(TEXT("{}"), Rejected, Error) ||
        !Sdk.RestoreActor(MidCast, Restored, Error)) return false;
    int32 SingleSteps = 0;
    FHollowWakeRuntimeMetrics Before, Singles, Batch, Pouches;
    if (!Sdk.ReadRuntimeMetrics(false, Before)) return false;
    do
    {
        if (!Sdk.Advance(Original, 1.0/30, 1, Frame, Error)) return false;
        ++SingleSteps;
    } while (!Frame.bHasCast && SingleSteps < 64);
    if (!Sdk.ReadRuntimeMetrics(false, Singles) ||
        !Sdk.Advance(Restored, 1.0/30, 64, Continued, Error) || !Sdk.ReadRuntimeMetrics(false, Batch) ||
        !Sdk.ReadRuntimeMetrics(true, Pouches) || !Continued.bHasCast ||
        Frame.Cast.Kind != TEXT("completed") || Continued.Cast.Token != Frame.Cast.Token || Continued.Steps != SingleSteps ||
        !Sdk.ResolveContact(Original, Hit, Error) || !Sdk.ResolveContact(Restored, Second, Error) ||
        Hit.Damage <= 0 || Hit.Damage != Second.Damage || !Sdk.SaveActor(Original, LeftSave, Error) ||
        !Sdk.SaveActor(Restored, RightSave, Error) || LeftSave != RightSave ||
        !Sdk.ApplyTimedDamage(Original, 10, Effect, Error) || !Sdk.Advance(Original, 1, 1, Frame, Error) || Frame.Damage <= 0 ||
        !Sdk.ReleaseActor(Restored, Error) || Sdk.Press(Restored, Cast, Error) || !Sdk.ReleaseActor(Original, Error)) return false;
    Receipt->SetNumberField(TEXT("restoredHit"), Hit.Damage);
    Receipt->SetNumberField(TEXT("timedDamage"), Frame.Damage);
    Receipt->SetNumberField(TEXT("singleStepsToCast"), SingleSteps);
    Receipt->SetNumberField(TEXT("singleRequests"), Singles.Delivered - Before.Delivered);
    Receipt->SetNumberField(TEXT("catchUpRequests"), Batch.Delivered - Singles.Delivered);
    Receipt->SetNumberField(TEXT("singleWireBytes"), Singles.WireBytes - Before.WireBytes);
    Receipt->SetNumberField(TEXT("catchUpWireBytes"), Batch.WireBytes - Singles.WireBytes);
    Receipt->SetNumberField(TEXT("singleVmAllocations"), Singles.Allocations - Before.Allocations);
    Receipt->SetNumberField(TEXT("catchUpVmAllocations"), Batch.Allocations - Singles.Allocations);
    Receipt->SetNumberField(TEXT("combatVmPeakBytes"), Batch.PeakBytes);
    Receipt->SetNumberField(TEXT("pouchVmPeakBytes"), Pouches.PeakBytes);

    auto* SampleClass = LoadClass<AHollowWakeTrainingTarget>(nullptr, TEXT("/Game/HollowWakeTest/BP_TrainingTarget.BP_TrainingTarget_C"));
    if (!SampleClass) { Error = TEXT("Packaged Blueprint sample class is missing"); return false; }
    Receipt->SetStringField(TEXT("sampleClass"), SampleClass->GetPathName());
    auto* Target = World.SpawnActor<AHollowWakeTrainingTarget>(SampleClass);
    if (!Target) return false;
    for (int32 Tick = 0; Tick < 90 && Target->LastHit.Damage == 0; ++Tick) Target->Tick(1.0f/30);
    const double SampleDamage = Target->LastHit.Damage;
    Target->Destroy();
    Receipt->SetNumberField(TEXT("sampleHit"), SampleDamage);
    return SampleDamage == Hit.Damage;
}

bool CheckPouch(UHollowWakeGameplaySubsystem& Sdk, const FString& Folder, FString& Error)
{
    TArray<FString> Requests;
    if (!FFileHelper::LoadFileToStringArray(Requests, *(Folder / TEXT("pouches.requests"))) || Requests.Num() <= 30) return false;
    TSharedPtr<FJsonObject> Source;
    if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Requests[30]), Source)) return false;
    FHollowWakePouch Context;
    auto EncodeField = [&](const TCHAR* Key, FString& Out)
    {
        return FJsonSerializer::Serialize(Source->GetObjectField(Key).ToSharedRef(), TJsonWriterFactory<>::Create(&Out));
    };
    if (!EncodeField(TEXT("state"), Context.InventoryJson) || !EncodeField(TEXT("memory"), Context.MemoryJson)) return false;
    Context.ItemUid = Source->GetIntegerField(TEXT("uid"));
    Context.Level = Source->GetIntegerField(TEXT("level"));
    const FString Group = Source->GetStringField(TEXT("group"));
    FString Facet, Preview, Move;
    Source->TryGetStringField(TEXT("facet"), Facet);
    const int64 Uid = 4294967301LL;
    if (!Sdk.InspectPouch(Context, Preview, Error) || !Sdk.RecallPouch(Context, Group, Facet, Uid, Move, Error)) return false;
    TSharedPtr<FJsonObject> Proposal;
    int64 Next = 0;
    return FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Move), Proposal) &&
        Proposal->TryGetNumberField(TEXT("nextUid"), Next) && Next == Uid + 1 &&
        !Proposal->GetStringField(TEXT("itemsJson")).IsEmpty() && !Proposal->GetStringField(TEXT("ledgerJson")).IsEmpty();
}
}

void AProbeGameMode::StartPlay()
{
    Super::StartPlay();
    const FString Folder = FPlatformMisc::GetEnvironmentVariable(TEXT("HWE_UNREAL_COURSE"));
    const FString Stage = FPlatformMisc::GetEnvironmentVariable(TEXT("HWE_UNREAL_STAGE"));
    if (Folder.IsEmpty() || (Stage != TEXT("editor") && Stage != TEXT("player"))) return;
    auto* Sdk = GetWorld()->GetSubsystem<UHollowWakeGameplaySubsystem>();
    auto Receipt = MakeShared<FJsonObject>();
    FString Error;
    if (FParse::Param(FCommandLine::Get(), TEXT("HweDamagedPouchTest")))
    {
        // The driver changes one byte in the staged pouch content. Combat must remain usable.
        FString Json, Config;
        FHollowWakeActor Actor;
        FHollowWakeRuntimeMetrics Unopened;
        const bool bRefused = Sdk && !Sdk->ExecutePouches(TEXT("{}"), Json, Error) &&
            Error == TEXT("Missing, oversized or mismatched SDK file: PouchesContent.bin") &&
            !Sdk->ReadRuntimeMetrics(true, Unopened);
        Receipt->SetStringField(TEXT("refusal"), Error);
        const bool bCombat = Sdk && Sdk->LoadMagicianConfiguration(Config, Error) &&
            Sdk->CreateActor(Config, Actor, Error) && Sdk->ReleaseActor(Actor, Error);
        Receipt->SetBoolField(TEXT("combatAvailable"), bCombat);
        Receipt->SetBoolField(TEXT("refusedDamagedPouches"), bRefused);
        Receipt->SetStringField(TEXT("run"), FPlatformMisc::GetEnvironmentVariable(TEXT("HWE_UNREAL_RUN")));
        FString Output;
        FJsonSerializer::Serialize(Receipt, TJsonWriterFactory<>::Create(&Output));
        const bool bSaved = FFileHelper::SaveStringToFile(Output, *(Folder / TEXT("integrity.json")),
            FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
        FPlatformMisc::RequestExitWithStatus(false, bRefused && bCombat && bSaved ? 0 : 3);
        return;
    }
    const bool bReplay = Sdk && Replay(*Sdk, Folder, Stage, TEXT("combat"), Error) && Replay(*Sdk, Folder, Stage, TEXT("pouches"), Error);
    const bool bWorld = bReplay && CheckWorld(*GetWorld(), *Sdk, Receipt, Error);
    const bool bPouch = bWorld && CheckPouch(*Sdk, Folder, Error);
    Receipt->SetBoolField(TEXT("replay"), bReplay);
    Receipt->SetBoolField(TEXT("world"), bWorld);
    Receipt->SetBoolField(TEXT("pouch"), bPouch);
    Receipt->SetStringField(TEXT("error"), Error);
    Receipt->SetStringField(TEXT("stage"), Stage);
    Receipt->SetStringField(TEXT("run"), FPlatformMisc::GetEnvironmentVariable(TEXT("HWE_UNREAL_RUN")));
    Receipt->SetStringField(TEXT("engine"), FEngineVersion::Current().ToString());
    FString Output;
    FJsonSerializer::Serialize(Receipt, TJsonWriterFactory<>::Create(&Output));
    const bool bSaved = FFileHelper::SaveStringToFile(Output, *(Folder / (Stage + TEXT(".json"))),
        FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
    FPlatformMisc::RequestExitWithStatus(false, bPouch && bSaved ? 0 : 3);
}
