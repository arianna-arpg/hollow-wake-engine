"""Seal retained equipment-candidate courses without publishing workstation logs."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]


def sha(body):
    return hashlib.sha256(body).hexdigest()


def read(file):
    return json.loads(file.read_text(encoding='utf-8-sig'))


def seal(args):
    assert not args.output.exists()
    assert len(args.source_ref) == 40 and all(c in '0123456789abcdef' for c in args.source_ref)
    inputs = read(args.inputs)
    assert set(inputs) == {'gameplay', 'shared', 'equipment', 'account-storage', 'progression', 'archives'}
    reports, observations, sources = {}, {}, {}

    def collect(value):
        if isinstance(value, dict):
            for field, child in value.items():
                if field in ('sources', 'sdkSources', 'nativeSources'):
                    for file, expected in child.items():
                        name = file.replace('\\', '/')
                        assert not name.startswith('/') and ':' not in name and '..' not in Path(name).parts
                        assert sha((ROOT / name).read_bytes()) == expected, name
                        assert name not in sources or sources[name] == expected, name
                        sources[name] = expected
                else:
                    collect(child)
        elif isinstance(value, list):
            for child in value:
                collect(child)

    for name, relative in inputs.items():
        file = (ROOT / relative).resolve()
        assert file.parent == (ROOT / '.artifacts').resolve()
        report = read(file)
        assert report['passed'] and report['cleaned'] and report.get('inputsUnchanged', True), name
        reports[name] = report
        collect(report)
        if name == 'archives':
            continue
        body = Path(str(file) + '.raw.json.gz').read_bytes()
        assert sha(body) == report['rawSha256'], name
        raw = json.loads(gzip.decompress(body))
        clean = {key: value for key, value in raw.items() if not key.endswith('.log')}
        if name == 'account-storage':
            clean['faultAssertions'] = {
                fault['name']: [line for key, text in raw.items() if key.endswith('.log')
                                for line in text.splitlines() if line.startswith('Exception: ' + fault['assertion'])]
                for fault in report['result']['faults']}
            assert all(clean['faultAssertions'].values())
        observations[name] = clean
    for name, expected in sources.items():
        assert sha(subprocess.check_output(['git', 'show', args.source_ref + ':' + name], cwd=ROOT)) == expected, name
    accepted = dict(schemaVersion=1, passed=True, sourceCommit=args.source_ref,
                    scope='Retained features in Unity 2021.3.6f1 Windows x64 Editor and relocated Mono player',
                    packagePublication=False, physicalDeviceQualification=False, completeSdkQualification=False,
                    sources=sources,
                    developmentEvidenceSha256=sha((ROOT / 'evidence/shared-account-equipment/acceptance.json').read_bytes()),
                    priorPackageEvidenceSha256=sha((ROOT / 'evidence/unity-shared-account/acceptance.json').read_bytes()))
    accepted['tools'] = {name: sha((ROOT / name).read_bytes()) for name in [
        'adapters/unity-shared-account/qualification/seal-equipment-retained.py',
        'adapters/unity-shared-account/qualification/check-equipment-retained.mjs']}
    packed = {}
    for name, value in [('reports.json.gz', reports), ('observations.json.gz', observations)]:
        text = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
        plain = text.replace('\\', '')
        assert not any(marker in plain for marker in ['C:Users', 'D:Games', 'C:/Users/', 'D:/Games/', 'Unity Licensing', 'EntitlementGroup']), name
        packed[name] = gzip.compress(text.encode(), mtime=0)
    accepted['files'] = {name: sha(body) for name, body in packed.items()}
    args.output.mkdir()
    for name, body in packed.items():
        (args.output / name).write_bytes(body)
    (args.output / 'acceptance.json').write_text(json.dumps(accepted, indent=2) + '\n', encoding='utf-8', newline='\n')
    return accepted


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-ref', required=True)
    for name in ('inputs', 'output'):
        parser.add_argument('--' + name, type=lambda p: Path(p).resolve(), required=True)
    accepted = seal(parser.parse_args())
    print(json.dumps(dict(passed=True, sources=len(accepted['sources']), files=accepted['files'])))
