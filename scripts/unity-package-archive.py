import gzip
import hashlib
import io
import json
import pathlib
import sys
import tarfile


def plugin_meta():
    return """PluginImporter:
  externalObjects: {}
  serializedVersion: 2
  iconMap: {}
  executionOrder: {}
  defineConstraints: []
  isPreloaded: 0
  isOverridable: 0
  isExplicitlyReferenced: 0
  validateReferences: 1
  platformData:
  - first:
      '': Any
    second:
      enabled: 0
      settings:
        Exclude Editor: 0
        Exclude Linux64: 1
        Exclude OSXUniversal: 1
        Exclude Win: 1
        Exclude Win64: 0
        Exclude Android: 1
        Exclude iOS: 1
        Exclude WebGL: 1
  - first:
      Any:
    second:
      enabled: 0
      settings: {}
  - first:
      Editor: Editor
    second:
      enabled: 1
      settings:
        CPU: x86_64
        DefaultValueInitialized: true
        OS: Windows
  - first:
      Standalone: Linux64
    second:
      enabled: 0
      settings:
        CPU: None
  - first:
      Standalone: OSXUniversal
    second:
      enabled: 0
      settings:
        CPU: None
  - first:
      Standalone: Win
    second:
      enabled: 0
      settings:
        CPU: None
  - first:
      Standalone: Win64
    second:
      enabled: 1
      settings:
        CPU: x86_64
  userData:
  assetBundleName:
  assetBundleVariant:
"""


def meta(rel, directory, namespace):
    guid = hashlib.sha256((namespace + "/" + rel).encode()).hexdigest()[:32]
    body = "fileFormatVersion: 2\nguid: " + guid + "\n"
    if directory:
        body += "folderAsset: yes\n"
    if rel.endswith(".dll"):
        return body + plugin_meta()
    ext = pathlib.PurePosixPath(rel).suffix
    importer = {".cs": "MonoImporter", ".asmdef": "AssemblyDefinitionImporter", ".bytes": "TextScriptImporter",
                ".txt": "TextScriptImporter", ".json": "TextScriptImporter", ".md": "TextScriptImporter"}.get(ext, "DefaultImporter")
    if rel == "package.json":
        importer = "PackageManifestImporter"
    body += importer + ":\n  externalObjects: {}\n"
    if importer == "MonoImporter":
        body += "  serializedVersion: 2\n  defaultReferences: []\n  executionOrder: 0\n  icon: {instanceID: 0}\n"
    return body + "  userData:\n  assetBundleName:\n  assetBundleVariant:\n"


def package(stage, archive):
    namespace = json.loads((stage / "package.json").read_text(encoding="utf-8"))["name"]
    entries = {}
    for file in sorted(stage.rglob("*")):
        assert not file.is_symlink()
        rel = file.relative_to(stage).as_posix()
        assert not rel.endswith(".meta")
        if file.is_file():
            entries[rel] = file.read_bytes()
        if not rel.endswith("~"):
            entries[rel + ".meta"] = meta(rel, file.is_dir(), namespace).encode()
    with archive.open("xb") as out, gzip.GzipFile(fileobj=out, filename="", mode="wb", mtime=0) as gz:
        with tarfile.open(fileobj=gz, mode="w|", format=tarfile.USTAR_FORMAT) as tar:
            for name, data in sorted(entries.items()):
                entry = tarfile.TarInfo("package/" + name)
                entry.size = len(data)
                entry.mode = 0o644
                tar.addfile(entry, io.BytesIO(data))


if __name__ == "__main__":
    stage, archive = sys.argv[1:]
    package(pathlib.Path(stage), pathlib.Path(archive))
