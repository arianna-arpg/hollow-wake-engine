using UnrealBuildTool;

public class HollowWakeGameplay : ModuleRules
{
    public HollowWakeGameplay(ReadOnlyTargetRules target) : base(target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PublicDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine" });
        PrivateDependencyModuleNames.AddRange(new[] { "Projects", "Json" });
        AddEngineThirdPartyPrivateStaticDependencies(target, "OpenSSL");
        RuntimeDependencies.Add("$(PluginDir)/ThirdParty/Win64/hwe_embedded.dll", StagedFileType.NonUFS);
        foreach (string name in new[] { "CombatRules", "CombatContent", "PouchesRules", "PouchesContent", "Magician" })
            RuntimeDependencies.Add("$(PluginDir)/Resources/SDK/" + name + ".bin", StagedFileType.NonUFS);
    }
}
