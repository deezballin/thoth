"""Guard: every id in the live ``plugins.enabled`` list must resolve to an installed plugin.

An id that no discovery scan matches is inert — the loader ignores it silently — so a stale
entry (a plugin that was deleted, a name that was renamed) reads as *enabled* in
``config.yaml`` while doing nothing. That is how 13 dead ids (the 21 killed platform
adapters, langfuse and homeassistant) sat in the operator's config after the Phase 3 carve.

Read-only by design: it opens the operator's real ``config.yaml`` and lists plugin
directories; nothing is written to the real home. ``tests/conftest.py`` sandboxes
``HERMES_HOME`` and the autouse ``_hermetic_environment`` fixture re-points both
``HERMES_HOME`` and ``hermes_constants._get_platform_default_hermes_home`` at a tempdir, so
the live home is captured at *import* time — before any fixture runs — and the user-plugin
scan root is re-anchored on it for the duration of the test.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

import hermes_cli.plugins_cmd as plugins_cmd
from hermes_cli.plugins_cmd import _resolve_plugin_key
from hermes_constants import _get_platform_default_hermes_home

# Captured while this module is imported: conftest has already redirected HERMES_HOME to its
# session sandbox (recording the sandbox in HERMES_TEST_SANDBOX_HOME), but the per-test
# fixtures that patch the platform default and HERMES_HOME have not run yet.
_IMPORT_HOME = os.environ.get("HERMES_HOME", "").strip()
_IMPORT_SANDBOX = os.environ.get("HERMES_TEST_SANDBOX_HOME", "").strip()
_NATIVE_HOME = _get_platform_default_hermes_home()


def _live_home() -> Path:
    """The operator's real Hermes home, past both pytest sandboxes."""
    if _IMPORT_HOME and _IMPORT_HOME != _IMPORT_SANDBOX:
        # A non-production HERMES_HOME is honored by conftest, so it already is the live home.
        return Path(_IMPORT_HOME).expanduser()
    return _NATIVE_HOME


def _enabled_ids(home: Path) -> list[str]:
    """The ``plugins.enabled`` entries of ``<home>/config.yaml`` (empty when absent/unreadable)."""
    import hermes_yaml as yaml

    config = home / "config.yaml"
    data = yaml.safe_load(config.read_text(encoding="utf-8-sig")) or {}
    plugins = data.get("plugins") if isinstance(data, dict) else None
    enabled = plugins.get("enabled") if isinstance(plugins, dict) else None
    return [entry for entry in (enabled or []) if isinstance(entry, str)]


# Deliberate, read-only contact with the real home: the invariant can only be checked
# against the config the operator actually runs (a fixture copy would be vacuous). The home
# I/O guard exists to stop tests MUTATING real state; this test reads one file and lists
# plugin directories - and the _plugins_dir patch below also keeps its mkdir off the real home.
@pytest.mark.allow_real_home_io
def test_live_config_enabled_ids_all_resolve(monkeypatch) -> None:
    home = _live_home()
    config = home / "config.yaml"
    if not config.is_file():
        pytest.skip(f"no live config at {config} — nothing to guard")

    # _discover_all_plugins() reads the user plugins dir through get_hermes_home(), which the
    # test session has sandboxed; re-anchor it so plugins installed under the operator's home
    # (curator-evolver, hermes-workspace, …) resolve instead of looking missing.
    monkeypatch.setattr(plugins_cmd, "_plugins_dir", lambda: home / "plugins")

    ids = _enabled_ids(home)
    assert ids, f"plugins.enabled in {config} should list ids"

    unresolved = sorted({entry for entry in ids if _resolve_plugin_key(entry) is None})
    assert not unresolved, (
        "stale plugins.enabled ids — no installed plugin matches them, so they are inert. "
        f"Prune them from {config}: {unresolved}"
    )


def test_unknown_plugin_id_does_not_resolve() -> None:
    """Anti-vacuity: an id nothing provides must come back ``None``, or the guard is worthless."""
    assert _resolve_plugin_key("no-such-plugin-xyzzy") is None


def test_bundled_plugin_id_resolves() -> None:
    """Positive control: discovery works in this session, so an empty match set means real trouble."""
    assert _resolve_plugin_key("disk-cleanup") == "disk-cleanup"
