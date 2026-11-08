"""Seal preview installation evidence, retaining historical parent source identities."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
OLD_GAMEPLAY_SOURCE = '98edfa74a4b9caecf6e0e6ef3ce49cb4365966f8'


def sha(body):
    return hashlib.sha256(body).hexdigest()


def read(file):
    return json.loads(file.read_text(encoding='utf-8-sig'))


def seal(args):
    assert not args.output.exists()
    assert len(args.source_ref) == 40 and all(c in '0123456789abcdef' for c in args.source_ref)
    inputs = read(args.inputs)
    assert set(inputs) == {'equipment', 'compatibility', 'gameplay', 'archives'}
    reports, observations, sources, historical = {}, {}, {}, {}

    def collect(value, location, source_ref):
        if location == ('compatibility', 'mixed', 'packages', 'gameplay'):
            source_ref = OLD_GAMEPLAY_SOURCE
        if isinstance(value, dict):
            for field, child in value.items():
                if field in ('sources', 'sdkSources', 'nativeSources'):
                    mapping = sources if source_ref == args.source_ref else historical.setdefault(source_ref, {})
                    for file, expected in child.items():
                        name = file.replace('\\', '/')
                        assert not name.startswith('/') and ':' not in name and '..' not in Path(name).parts
                        assert name not in mapping or mapping[name] == expected, name
                        if source_ref == args.source_ref:
                            assert sha((ROOT / name).read_bytes()) == expected, name
                        mapping[name] = expected
                else:
                    collect(child, location + (field,), source_ref)
        elif isinstance(value, list):
            for child in value:
                collect(child, location, source_ref)

    without_logs = lambda raw: {key: value for key, value in raw.items() if not key.endswith('.log')}
    for name, relative in inputs.items():
        file = (ROOT / relative).resolve()
        artifacts = (ROOT / '.artifacts').resolve()
        assert file.parent == artifacts or file.parent.parent == artifacts
        report = read(file)
        assert report['passed'] and report['cleaned'] and report['inputsUnchanged'], name
        reports[name] = report
        if name == 'compatibility':
            assert report['mixed']['gameplaySourceRef'] == OLD_GAMEPLAY_SOURCE
        collect(report, (name,), args.source_ref)
        if name == 'archives':
            continue
        rawfile = file.with_name('raw.json.gz') if name == 'compatibility' else Path(str(file) + '.raw.json.gz')
        body = rawfile.read_bytes()
        assert sha(body) == report['rawSha256'], name
        raw = json.loads(gzip.decompress(body))
        if name == 'compatibility':
            observations[name] = dict(standalone=without_logs({key: value for key, value in raw.items() if key.startswith('standalone/')}),
                                      mixed=without_logs(raw['mixed']))
        else:
            observations[name] = without_logs(raw)
    for source_ref, mapping in [(args.source_ref, sources), *historical.items()]:
        for name, expected in mapping.items():
            assert sha(subprocess.check_output(['git', 'show', source_ref + ':' + name], cwd=ROOT)) == expected, (source_ref, name)
    accepted = dict(schemaVersion=1, passed=True, sourceCommit=args.source_ref,
                    scope='Versioned previews installed in Unity 2021.3.6f1 Windows x64 Editor and relocated Mono player',
                    installedPackageQualification=True, physicalDeviceQualification=False, completeSdkQualification=False,
                    sources=sources, historicalSources=historical,
                    developmentEvidenceSha256=sha((ROOT / 'evidence/shared-account-equipment/acceptance.json').read_bytes()),
                    retainedEvidenceSha256=sha((ROOT / 'evidence/shared-account-equipment/retained/acceptance.json').read_bytes()))
    for name, pack in reports['equipment']['packages'].items():
        accepted[name + 'Sha256'] = pack['sha256']
        accepted[name + 'Version'] = pack['version']
    accepted['tools'] = {name: sha((ROOT / name).read_bytes()) for name in [
        'adapters/unity-shared-account/qualification/seal-equipment-preview.py',
        'adapters/unity-shared-account/qualification/check-equipment-preview.mjs']}
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
    for name in ['inputs', 'output']:
        parser.add_argument('--' + name, type=lambda p: Path(p).resolve(), required=True)
    accepted = seal(parser.parse_args())
    print(json.dumps(dict(passed=True, sources=len(accepted['sources']), historicalSources={ref: len(rows) for ref, rows in accepted['historicalSources'].items()}, files=accepted['files'])))
