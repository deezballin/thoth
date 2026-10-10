"""Icon generation reports per-target failures without hiding later targets."""
import importlib.util
import io
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest
from PIL import Image


@pytest.mark.parametrize("bom", [b"", b"\xef\xbb\xbf"])
@pytest.mark.parametrize("editor_export", [False, True])
def test_svg_readers_accept_bom_without_rewriting_assets(tmp_path, monkeypatch, bom, editor_export):
    monkeypatch.setitem(sys.modules, "resvg_py", ModuleType("resvg_py"))
    script = Path(__file__).resolve().parents[2] / "scripts/generate_icons.py"
    spec = importlib.util.spec_from_file_location("icon_readers_under_test", script)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    path = tmp_path / "thoth-crescent.svg"
    element = '<path fill-rule="evenodd" d="M0 0 L1 1" aria-label="café 東京"/>'
    declaration = '<?xml version="1.0" encoding="UTF-8"?>\n' if editor_export else ""
    namespaces = ' xmlns="http://www.w3.org/2000/svg" xmlns:editor="urn:editor"'
    metadata = '<editor:namedview editor:zoom="1"/>' if editor_export else ""
    document = f'<svg{namespaces} viewBox="0 0 20 30">{metadata}{element}</svg>'
    raw = bom + (declaration + document).encode("utf-8")
    path.write_bytes(raw)
    art = SimpleNamespace(crescent=path, path_cache=None, backgrounds=tmp_path, colors=None)
    assert module.art_path(art) == element
    inner, width, height = module.background_inner(art, path.name)
    composed = ET.fromstring(f'<svg xmlns="http://www.w3.org/2000/svg">{inner}</svg>')
    assert (width, height) == (20, 30)
    assert [ET.tostring(child) for child in composed] == [
        ET.tostring(child) for child in ET.fromstring(document)
    ]
    assert path.read_bytes() == raw
    path.write_bytes(bom + b"<svg/>")
    art.path_cache = None
    with pytest.raises(AssertionError, match="no <path>"):
        module.art_path(art)
    with pytest.raises(AssertionError, match="viewBox"):
        module.background_inner(art, path.name)


@pytest.mark.parametrize("failure", [None, "render", "directory", "verify"])
def test_write_status_includes_every_target(tmp_path, monkeypatch, capsys, failure):
    # The renderer is build-only. This test injects failures at its byte boundary.
    monkeypatch.setitem(sys.modules, "resvg_py", ModuleType("resvg_py"))
    script = Path(__file__).resolve().parents[2] / "scripts" / "generate_icons.py"
    spec = importlib.util.spec_from_file_location("icon_generator_under_test", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    source = tmp_path / "immutable source"
    source.mkdir()
    monkeypatch.setattr(module, "IconArt", lambda root, **_flavor: root)
    monkeypatch.setattr(sys, "argv", [str(script), "--source", str(source), "--out", str(tmp_path)])

    image = io.BytesIO()
    Image.new("RGBA", (2, 2), (0, 0, 0, 0)).save(image, "PNG")
    good_bytes = image.getvalue()
    first = "blocked/icon.png" if failure == "directory" else "first.png"
    if failure == "directory":
        (tmp_path / "blocked").write_text("not a directory", encoding="utf-8")
    monkeypatch.setattr(module, "TARGETS", [(first, "png", "first"), ("last.png", "png", "last")])

    def target_bytes(art, kind, target):
        assert art == source
        assert not list(source.iterdir())
        if target == "first":
            if failure == "render":
                raise RuntimeError("injected render failure")
            if failure == "verify":
                return b"not an image"
        return good_bytes

    monkeypatch.setattr(module, "target_bytes", target_bytes)
    code = 0
    try:
        module.main()
    except SystemExit as stopped:
        code = stopped.code
    assert bool(code) is (failure is not None)
    assert (tmp_path / "last.png").read_bytes() == good_bytes
    output = capsys.readouterr().out
    assert "last.png: PNG (2, 2)" in output
    assert ("FAILED" in output) is (failure is not None)


@pytest.mark.parametrize("platform", ["", "mac-"])
@pytest.mark.parametrize("appearance,ink", [("light", "dark"), ("dark", "light")])
@pytest.mark.parametrize("colors", [None, ("#f5cc32", "#443808"), ("#e34850", "#4a1117")])
def test_crescent_mark_sits_centered_on_the_plain_tile_inside_the_outer_silhouette(
        monkeypatch, platform, appearance, ink, colors):
    """The tile keeps the background's own geometry and fill with no stroke
    (the ring is disabled); the crescent rides in a centered MARK_FRACTION
    square, fitted ('meet', never distorted), and the whole group is clipped
    to the outer silhouette so neither mark nor badge can paint past the plate."""
    monkeypatch.setitem(sys.modules, "resvg_py", ModuleType("resvg_py"))
    source = Path(__file__).resolve().parents[2]
    spec = importlib.util.spec_from_file_location("icon_geometry_under_test", source / "scripts/generate_icons.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.BORDER_ENABLED is False
    art = SimpleNamespace(
        backgrounds=source / "assets/backgrounds", colors=colors, commit="",
        crescent=source / "assets/thoth-crescent.svg", path_cache=None,
    )
    name = f"squircle-{platform}{appearance}.svg"
    ns = {"svg": "http://www.w3.org/2000/svg"}
    original = ET.parse(art.backgrounds / name).find("svg:rect", ns)
    result = ET.fromstring(module.compose_svg(art, ink, name))
    tile = result.find("svg:rect", ns)
    assert original is not None and tile is not None
    geometry = tuple(float(original.attrib[key]) for key in ("x", "y", "width", "height", "rx"))
    assert tuple(float(tile.attrib[key]) for key in ("x", "y", "width", "height", "rx")) == geometry
    assert tile.get("stroke") is None and tile.get("stroke-width") is None
    expected_fill = (colors or ("#ffffff", module.DARK_HEX))[appearance == "dark"]
    assert tile.get("fill") == expected_fill
    clip = result.find("svg:defs/svg:clipPath/svg:rect", ns)
    assert clip is not None
    assert tuple(float(clip.attrib[key]) for key in ("x", "y", "width", "height", "rx")) == geometry
    clip_path = result.find("svg:defs/svg:clipPath", ns)
    assert clip_path is not None
    group = result[-1]
    assert group.get("clip-path") == f"url(#{clip_path.attrib['id']})"
    marks = [child for child in group if child.tag == f"{{{ns['svg']}}}svg"]
    assert len(marks) == 1, "one nested mark layer only"
    mark = marks[0]
    assert mark.get("preserveAspectRatio") == "xMidYMid meet"
    assert mark.get("overflow") is None, "the fitted mark needs no overflow"
    assert mark.get("viewBox") == " ".join(str(value) for value in module.CRESCENT_BBOX)
    x, y, w, h, _ = geometry
    side = w * module.MARK_FRACTION
    assert side < w, "the mark never fills the whole plate"
    expected_box = (x + (w - side) / 2.0, y + (h - side) / 2.0, side, side)
    assert tuple(float(mark.attrib[key]) for key in ("x", "y", "width", "height")) == pytest.approx(expected_box)
    paths = result.findall(".//svg:path", ns)
    assert len(paths) == 1  # no badge without a commit; the crescent is one path
    assert paths[0].get("fill") == module.INKS[ink]
    assert paths[0].get("fill-rule") == "evenodd"
    # The composed mark is the exact BrandMark path, byte for byte.
    from_art = ET.fromstring(module.art_path(art))
    assert paths[0].get("d") == from_art.get("d")
