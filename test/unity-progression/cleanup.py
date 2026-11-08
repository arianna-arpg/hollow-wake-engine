"""Owned Unity fixtures must disappear on success, failure and transient locks."""
import runpy,shutil,time
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2]
(ROOT/'.artifacts').mkdir(exist_ok=True)
owned=runpy.run_path(str(ROOT/'scripts/verify-unity-progression.py'))['owned_workspace']
original=shutil.rmtree
def remove_if_needed(folder):
    if folder.exists():
        assert folder.resolve().parent==(ROOT/'.artifacts').resolve()
        original(folder)
with owned() as folder:(folder/'fixture.txt').write_text('owned',encoding='utf-8')
assert not folder.exists()
try:
    with owned() as folder:
        (folder/'fixture.txt').write_text('owned',encoding='utf-8')
        raise RuntimeError('deliberate body failure')
except RuntimeError as error:assert str(error)=='deliberate body failure'
else:raise AssertionError('Body failure was swallowed')
assert not folder.exists()
attempts=0
def locked_then_release(path):
    global attempts
    attempts+=1
    if attempts<=2:raise PermissionError('temporary player lock')
    original(path)
try:
    with patch.object(shutil,'rmtree',side_effect=locked_then_release),patch.object(time,'sleep'):
        with owned() as folder:(folder/'fixture.txt').write_text('owned',encoding='utf-8')
    assert attempts==3 and not folder.exists()
finally:remove_if_needed(folder)
try:
    try:
        with patch.object(shutil,'rmtree',side_effect=FileNotFoundError('missing child')):
            with owned() as folder:(folder/'fixture.txt').write_text('owned',encoding='utf-8')
    except FileNotFoundError:assert folder.exists()
    else:raise AssertionError('Missing child concealed surviving fixture')
finally:remove_if_needed(folder)
try:
    try:
        with patch.object(shutil,'rmtree',side_effect=PermissionError('persistent lock')),patch.object(time,'monotonic',side_effect=[0,20]):
            with owned() as folder:(folder/'fixture.txt').write_text('owned',encoding='utf-8')
    except PermissionError:assert folder.exists()
    else:raise AssertionError('Persistent lock was swallowed')
finally:remove_if_needed(folder)
print('PASS: five owned-fixture cleanup controls; no fixtures retained')
