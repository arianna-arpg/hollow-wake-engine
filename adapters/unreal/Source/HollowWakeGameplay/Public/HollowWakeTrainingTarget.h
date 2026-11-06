#pragma once

#include "GameFramework/Actor.h"
#include "HollowWakeGameplaySubsystem.h"
#include "HollowWakeTrainingTarget.generated.h"

/** Place in a level and play to cast at a stationary target. Call StartCast to cast again. */
UCLASS(Blueprintable)
class HOLLOWWAKEGAMEPLAY_API AHollowWakeTrainingTarget : public AActor
{
    GENERATED_BODY()
public:
    AHollowWakeTrainingTarget();
    virtual void BeginPlay() override;
    virtual void EndPlay(const EEndPlayReason::Type Reason) override;
    virtual void Tick(float DeltaSeconds) override;
    UFUNCTION(BlueprintCallable, Category="Hollow Wake|Sample") bool StartCast();
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Hollow Wake|Sample") bool bCastOnBeginPlay = true;
    UPROPERTY(VisibleInstanceOnly, BlueprintReadOnly, Category="Hollow Wake|Sample") FHollowWakeCast LastCast;
    UPROPERTY(VisibleInstanceOnly, BlueprintReadOnly, Category="Hollow Wake|Sample") FHollowWakeHit LastHit;
    UPROPERTY(VisibleInstanceOnly, BlueprintReadOnly, Category="Hollow Wake|Sample") FString LastError;
private:
    UPROPERTY(Transient) FHollowWakeActor CombatActor;
    bool bReady = false;
    double Accumulator = 0;
};
