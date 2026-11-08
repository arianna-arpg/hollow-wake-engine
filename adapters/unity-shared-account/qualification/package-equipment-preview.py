"""Promote exact qualified candidate payloads to preview packages with installation guides.

This builder changes documentation and package metadata only. Actual installation
and release acceptance are separate; a successful build is not qualification.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[3]


def sha(body):
    return hashlib.sha256(body).hexdigest()


def read(file):
    return json.loads(file.read_text(encoding='utf-8-sig'))


def packages(candidate, output):
    assert not output.exists()
    evidence = ROOT / 'evidence/shared-account-equipment'
    accepted = read(evidence / 'acceptance.json')
    retained = read(evidence / 'retained/acceptance.json')
    assert accepted['passed'] and retained['passed']
    assert retained['developmentEvidenceSha256'] == sha((evidence / 'acceptance.json').read_bytes())
    for base, record in [(evidence, accepted), (evidence / 'retained', retained)]:
        for name, expected in record['files'].items():
            assert Path(name).name == name and sha((base / name).read_bytes()) == expected, name
    prior = json.loads(gzip.decompress((evidence / 'reports.json.gz').read_bytes()))['equipmentFaults']['control']['packages']
    helper_name = 'experiments/embedded-js/patches/unity-cleanup-archive.py'
    helper = runpy.run_path(str(ROOT / helper_name))
    prepared_name = 'adapters/unity-shared-account/qualification/prepare-public-parent.py'
    frozen = runpy.run_path(str(ROOT / prepared_name))['checked']('evidence/prepared-account', 'native-inputs.json.gz')
    fixture = gzip.compress(json.dumps({name: frozen[name] for name in ['courses.json', 'prepared.json']}).encode(), mtime=0)
    shared_guide = 'adapters/unity-shared-account/SharedEquipmentGuide.md'
    tool = str(Path(__file__).relative_to(ROOT)).replace('\\', '/')
    inputs = {}
    # Refuse all invalid parents before creating either output package.
    for name in ['gameplay', 'storage']:
        receipt_file = candidate / name / 'package-receipt.json'
        receipt = read(receipt_file)
        assert receipt == prior[name], name
        archive = candidate / name / receipt['file']
        assert archive.parent == candidate / name and sha(archive.read_bytes()) == accepted[name + 'Sha256'] == receipt['sha256']
        entries = helper['load'](archive)
        assert {file: sha(body) for file, body in entries.items()} == receipt['files']
        for field in ['sources', 'sdkSources']:
            for file, expected in receipt.get(field, {}).items():
                assert sha((ROOT / file).read_bytes()) == expected, file
        inputs[name] = (receipt_file, receipt, entries)
    output.mkdir()
    results = {}
    for name, version, guide in [
        ('gameplay', '0.6.0-preview.1', 'adapters/unity-shared-account/EquipmentPackageREADME.md'),
        ('storage', '0.5.0-preview.1', 'adapters/unity-shared-account/EquipmentStoragePackageREADME.md'),
    ]:
        receipt_file, parent, entries = inputs[name]
        before = dict(entries)
        manifest = json.loads(entries['package/package.json'])
        assert manifest['name'] == 'com.hollowwake.' + name
        manifest['version'] = version
        manifest['documentationUrl'] = 'https://github.com/arianna-arpg/hollow-wake-engine/blob/unity-shared-equipment-v0.6.0-preview.1/docs/unity-shared-equipment.md'
        entries['package/package.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
        entries['package/README.md'] = (ROOT / guide).read_bytes()
        note = 'package/Documentation~/SharedEquipment.md'
        assert note not in entries
        entries[note] = (ROOT / shared_guide).read_bytes()
        changed = sorted(file for file in before if before[file] != entries[file])
        assert changed == ['package/README.md', 'package/package.json']
        assert set(entries) - set(before) == {note}
        runtime = [file for file in before if file.startswith('package/Runtime/')]
        assert runtime and all(before[file] == entries[file] for file in runtime)
        assert all(before[file] == entries[file] for file in before if file not in changed)
        folder = output / name
        folder.mkdir()
        archive = folder / (manifest['name'] + '-' + version + '.tgz')
        helper['save'](entries, archive)
        assert helper['load'](archive) == entries
        source_names = [tool, helper_name, prepared_name, guide, shared_guide,
                        'evidence/shared-account-equipment/acceptance.json',
                        'evidence/shared-account-equipment/retained/acceptance.json',
                        'evidence/prepared-account/acceptance.json',
                        'evidence/prepared-account/native-inputs.json.gz']
        sources = dict(parent['sources'])
        sources.update({file: sha((ROOT / file).read_bytes()) for file in source_names})
        prefix = 'package/Runtime/Resources/HollowWake/'
        receipt = dict(candidate=True, engineQualified=False, deviceQualified=False,
            name=manifest['name'], version=version, file=archive.name, bytes=archive.stat().st_size,
            sha256=sha(archive.read_bytes()), parentSha256=parent['sha256'],
            parentReceiptSha256=sha(receipt_file.read_bytes()), nativeSha256=parent['nativeSha256'],
            runtimeIdenticalToCandidate=True, preservedRuntimeFiles=len(runtime),
            changed=changed, added=[note], preservedFiles=len(before)-len(changed),
            files={file: sha(body) for file, body in sorted(entries.items())},
            hashes={file[len(prefix):-6]: sha(body) for file, body in sorted(entries.items())
                    if file.startswith(prefix) and file.endswith('.bytes')}, sources=sources)
        if name == 'gameplay':
            receipt['sdkSources'] = parent['sdkSources']
            receipt['frozenInputsSha256'] = sha(fixture)
            (folder / 'qualification-inputs.json.gz').write_bytes(fixture)
        (folder / 'package-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8', newline='\n')
        results[name] = receipt['sha256']
    return results


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['candidate', 'output']:
        parser.add_argument('--' + name, type=lambda p: Path(p).resolve(), required=True)
    args = parser.parse_args()
    print(json.dumps(packages(args.candidate, args.output)))
