#include "HollowWakeTrainingTarget.h"
#include "Engine/World.h"

AHollowWakeTrainingTarget::AHollowWakeTrainingTarget()
{
    PrimaryActorTick.bCanEverTick = true;
    PrimaryActorTick.bStartWithTickEnabled = false;
}

void AHollowWakeTrainingTarget::BeginPlay()
{
    Super::BeginPlay();
    auto* Sdk = GetWorld()->GetSubsystem<UHollowWakeGameplaySubsystem>();
    FString Build;
    bReady = Sdk && Sdk->LoadMagicianConfiguration(Build, LastError) && Sdk->CreateActor(Build, CombatActor, LastError);
    if (bReady)
    {
        SetActorTickEnabled(true);
        if (bCastOnBeginPlay) StartCast();
    }
}

bool AHollowWakeTrainingTarget::StartCast()
{
    if (!bReady) return false;
    return GetWorld()->GetSubsystem<UHollowWakeGameplaySubsystem>()->Press(CombatActor, LastCast, LastError);
}

void AHollowWakeTrainingTarget::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    constexpr double Step = 1.0 / 30;
    Accumulator += DeltaSeconds;
    // Keep excess time for the next frame. Stop at input-sensitive events.
    int32 Budget = 64;
    auto* Sdk = GetWorld()->GetSubsystem<UHollowWakeGameplaySubsystem>();
    while (Budget && Accumulator >= Step)
    {
        const int32 Count = FMath::FloorToInt(FMath::Min(Accumulator / Step, static_cast<double>(Budget)));
        FHollowWakeFrame Frame;
        if (!Sdk->Advance(CombatActor, Step, Count, Frame, LastError) || Frame.Steps <= 0)
        { SetActorTickEnabled(false); return; }
        Accumulator -= Frame.Steps * Step;
        Budget -= Frame.Steps;
        if (Frame.bHasCast)
        {
            LastCast = Frame.Cast;
            // This sample has confirmed contact with a stationary target. A moving projectile
            // should call ResolveContact from the game's collision callback instead.
            if (LastCast.Kind == TEXT("completed"))
            {
                if (!Sdk->ResolveContact(CombatActor, LastHit, LastError) || LastHit.Life <= 0)
                { SetActorTickEnabled(false); return; }
            }
        }
        if (Frame.TargetLife <= 0) { SetActorTickEnabled(false); return; }
    }
}

void AHollowWakeTrainingTarget::EndPlay(const EEndPlayReason::Type Reason)
{
    if (bReady)
    {
        if (auto* Sdk = GetWorld()->GetSubsystem<UHollowWakeGameplaySubsystem>()) Sdk->ReleaseActor(CombatActor, LastError);
        bReady = false;
    }
    Super::EndPlay(Reason);
}
