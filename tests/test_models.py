from pathlib import Path
import pytest
from backend.engine import KiCad, EngineError


def test_native_model_export_uses_assigned_models(monkeypatch, tmp_path):
    engine = object.__new__(KiCad)
    engine.exe = 'kicad-cli'
    engine.help = lambda _: '--subst-models --include-tracks --include-pads --include-silkscreen --include-soldermask'
    source = tmp_path / 'board.kicad_pcb'
    source.write_text('original')
    target = tmp_path / 'board.glb'
    def run(args, cwd, log):
        assert args[:4] == ['kicad-cli', 'pcb', 'export', 'glb']
        assert '--subst-models' in args and '--include-pads' in args
        assert args[-1] == source
        target.write_bytes(b'glTF' + bytes(16))
        return 0, ''
    monkeypatch.setattr('backend.engine.run', run)
    model = engine.pcb_model(source, target)
    assert model['kind'] == '3d' and model['artifact'] == 'board.glb'
    assert source.read_text() == 'original'


def test_invalid_model_export_is_not_published(monkeypatch, tmp_path):
    engine = object.__new__(KiCad)
    engine.exe = 'kicad-cli'
    engine.help = lambda _: ''
    target = tmp_path / 'board.glb'
    target.write_bytes(b'not a model')
    monkeypatch.setattr('backend.engine.run', lambda *args: (0, 'invalid export'))
    with pytest.raises(EngineError, match='Native 3D export unavailable'):
        engine.pcb_model(tmp_path / 'board.kicad_pcb', target)
