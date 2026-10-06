/**
 * Unit tests for the Ozone backend normalizer (session + argv + env hint).
 */

import assert from 'node:assert/strict'

import { test } from 'vitest'

import { linuxOzoneBackend } from './ozone-backend'

const X11_SESSION = { DISPLAY: ':0', XDG_SESSION_TYPE: 'x11' }
const WAYLAND_SESSION = { WAYLAND_DISPLAY: 'wayland-0', XDG_SESSION_TYPE: 'wayland' }
const XWAYLAND_SESSION = { DISPLAY: ':0', WAYLAND_DISPLAY: 'wayland-0', XDG_SESSION_TYPE: 'wayland' }

test('a Wayland session with DISPLAY set is still a native Wayland client under Electron 20+', () => {
  assert.equal(linuxOzoneBackend(XWAYLAND_SESSION, []), 'wayland')
})

test('asking for a native Wayland surface keeps the Wayland backend', () => {
  for (const argv of [['--ozone-platform=wayland'], ['--ozone-platform-hint=wayland']]) {
    assert.equal(linuxOzoneBackend(WAYLAND_SESSION, argv), 'wayland')
  }

  assert.equal(linuxOzoneBackend({ ...WAYLAND_SESSION, ELECTRON_OZONE_PLATFORM_HINT: 'wayland' }, []), 'wayland')
})

test('an auto hint follows the session', () => {
  assert.equal(linuxOzoneBackend(WAYLAND_SESSION, ['--ozone-platform-hint=auto']), 'wayland')
  assert.equal(linuxOzoneBackend(X11_SESSION, ['--ozone-platform-hint=auto']), 'x11')
  assert.equal(linuxOzoneBackend(XWAYLAND_SESSION, ['--ozone-platform-hint=auto']), 'wayland')
})

test('asking for X11 on a Wayland session wins', () => {
  assert.equal(linuxOzoneBackend(WAYLAND_SESSION, ['--ozone-platform=x11']), 'x11')
  assert.equal(linuxOzoneBackend({ ...WAYLAND_SESSION, ELECTRON_OZONE_PLATFORM_HINT: 'x11' }, []), 'x11')
})

test('the explicit switch beats the hint, and the last switch wins', () => {
  assert.equal(linuxOzoneBackend(WAYLAND_SESSION, ['--ozone-platform-hint=auto', '--ozone-platform=x11']), 'x11')
  assert.equal(linuxOzoneBackend(X11_SESSION, ['--ozone-platform=x11', '--ozone-platform=wayland']), 'wayland')
})

test('a backend nobody recognises follows the session, not a silent X11 default', () => {
  assert.equal(linuxOzoneBackend(X11_SESSION, ['--ozone-platform=headless']), 'x11')
  assert.equal(linuxOzoneBackend(WAYLAND_SESSION, ['--ozone-platform=headless']), 'wayland')
  assert.equal(linuxOzoneBackend({}, []), 'x11')
})

test('linuxOzoneBackend is the session/argv normalizer', () => {
  assert.equal(linuxOzoneBackend(X11_SESSION, []), 'x11')
  assert.equal(linuxOzoneBackend(WAYLAND_SESSION, []), 'wayland')
  assert.equal(linuxOzoneBackend(WAYLAND_SESSION, ['--ozone-platform=x11']), 'x11')
  assert.equal(linuxOzoneBackend(X11_SESSION, ['--ozone-platform-hint=auto']), 'x11')
})
