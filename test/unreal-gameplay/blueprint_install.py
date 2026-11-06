"""Run inside a disposable, content-only Unreal Editor project."""
import json
import os
from pathlib import Path
import unreal

actor = unreal.load_class(None, "/Script/HollowWakeGameplay.HollowWakeTrainingTarget")
subsystem = unreal.load_class(None, "/Script/HollowWakeGameplay.HollowWakeGameplaySubsystem")
if not actor or not subsystem:
    raise RuntimeError("Installed editor module did not register both classes")
factory = unreal.BlueprintFactory()
factory.set_editor_property("parent_class", actor)
bp = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
    "BP_TrainingTarget", "/Game/HollowWakeTest", unreal.Blueprint, factory)
if not bp or not unreal.EditorAssetLibrary.save_loaded_asset(bp):
    raise RuntimeError("Unable to create a Blueprint from the installed training target")
generated = unreal.EditorAssetLibrary.load_blueprint_class("/Game/HollowWakeTest/BP_TrainingTarget")
if not generated:
    raise RuntimeError("Unable to load the saved Blueprint")
paths = (actor.get_path_name(), subsystem.get_path_name(), generated.get_path_name())
(Path(os.environ["HWE_UNREAL_COURSE"]) / "blueprint.json").write_text(json.dumps({
    "run": os.environ["HWE_UNREAL_RUN"], "classes": paths,
}), encoding="utf-8")
