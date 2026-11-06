import hashlib
import importlib.util
import json
import pathlib
import stat
import sys
import tempfile
import unittest
import warnings
import zipfile

sys.dont_write_bytecode = True
source = pathlib.Path(__file__).resolve().parents[1] / "scripts/godot-proc-example-archive.py"
spec = importlib.util.spec_from_file_location("addon_archive", source)
addon = importlib.util.module_from_spec(spec)
spec.loader.exec_module(addon)


class ArchiveContract(unittest.TestCase):
    def test_all_capabilities_preserve_every_base_byte_and_install(self):
        with tempfile.TemporaryDirectory(prefix="hwe-addon-contract-") as temp:
            root = pathlib.Path(temp)
            base = root / "base.zip"
            with zipfile.ZipFile(base, "w") as out:
                out.writestr("addons/hollow_wake/manifest.json", b'{"original":true}')
                out.writestr("addons/hollow_wake/bin/library", b"native bytes")
            expected = root / "receipt.json"
            expected.write_text(json.dumps({"archiveSha256": addon.sha(base.read_bytes()),
                "files": {"bin/library": addon.sha(b"native bytes")}}))
            for capability, files in addon.EXTRAS.items():
                extra = root / capability
                extra.mkdir()
                for name in files:
                    (extra / name).write_bytes(name.encode())
                combined = root / (capability + ".zip")
                addon.assemble(base, expected, extra, combined, capability)
                project = root / (capability + "-project")
                addon.install(combined, project)
                self.assertEqual((project / "addons/hollow_wake/bin/library").read_bytes(), b"native bytes")
                for name in files:
                    self.assertEqual((project / "addons/hollow_wake" / capability / name).read_bytes(), name.encode())
                with self.assertRaises(FileExistsError):
                    addon.install(combined, project)

    def test_unsafe_or_ambiguous_members_are_rejected(self):
        names = ["../escape", "/addons/hollow_wake/file", "addons/hollow_wake/../escape",
            "addons/hollow_wake//file", "addons/hollow_wake/./file", "addons\\hollow_wake\\file", "outside/file",
            "addons/hollow_wake/directory/", "addons/hollow_wake/file:stream", "addons/hollow_wake"]
        with tempfile.TemporaryDirectory(prefix="hwe-addon-paths-") as temp:
            root = pathlib.Path(temp)
            for index, name in enumerate(names):
                archive = root / (str(index) + ".zip")
                with zipfile.ZipFile(archive, "w") as out:
                    member = zipfile.ZipInfo("placeholder")
                    # Bypass ZipInfo's Windows separator normalization so the
                    # fixture actually retains the malformed member spelling.
                    member.filename = name
                    member.orig_filename = name
                    out.writestr(member, b"invalid")
                with self.subTest(name=name), self.assertRaises(ValueError):
                    addon.install(archive, root / "project")
            for label in ["duplicate", "symlink"]:
                archive = root / (label + ".zip")
                with warnings.catch_warnings(), zipfile.ZipFile(archive, "w") as out:
                    warnings.simplefilter("ignore", UserWarning)
                    member = zipfile.ZipInfo("addons/hollow_wake/file")
                    if label == "symlink":
                        member.external_attr = (stat.S_IFLNK | 0o777) << 16
                    out.writestr(member, b"target")
                    if label == "duplicate":
                        out.writestr(member.filename, b"different")
                with self.assertRaises(ValueError):
                    addon.install(archive, root / "project")

    def test_changed_base_digest_fails_before_output_creation(self):
        with tempfile.TemporaryDirectory(prefix="hwe-addon-digest-") as temp:
            root = pathlib.Path(temp)
            base, receipt, output = root / "base", root / "receipt", root / "output"
            base.write_bytes(b"changed")
            receipt.write_text(json.dumps({"archiveSha256": hashlib.sha256(b"original").hexdigest()}))
            with self.assertRaises(ValueError):
                addon.assemble(base, receipt, root, output)
            self.assertFalse(output.exists())

    def test_existing_custom_assets_and_corrupt_archive_do_not_leave_partial_install(self):
        with tempfile.TemporaryDirectory(prefix="hwe-addon-install-") as temp:
            root = pathlib.Path(temp)
            archive = root / "addon.zip"
            with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_STORED) as out:
                out.writestr(addon.PREFIX + "manifest.json", b"{}")
                out.writestr(addon.PREFIX + "z.txt", b"bad-crc-fixture")
            custom = root / "existing/addons/hollow_wake/my-settings.txt"
            custom.parent.mkdir(parents=True)
            custom.write_bytes(b"keep")
            with self.assertRaises(FileExistsError):
                addon.install(archive, root / "existing")
            self.assertEqual(list(custom.parent.iterdir()), [custom])
            self.assertEqual(custom.read_bytes(), b"keep")
            archive.write_bytes(archive.read_bytes().replace(b"bad-crc-fixture", b"BAD-crc-fixture"))
            with self.assertRaises(zipfile.BadZipFile):
                addon.install(archive, root / "new")
            self.assertFalse((root / "new/addons/hollow_wake").exists())
            self.assertEqual(list((root / "new/addons").iterdir()), [])


if __name__ == "__main__":
    unittest.main()
