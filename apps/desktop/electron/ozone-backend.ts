/**
 * Ozone backend resolution — the normalizer every windowing decision asks
 * instead of re-deriving "Linux && Wayland" itself.
 *
 * The Ozone backend (not the login session) is the normalizer: Electron 20+
 * prefers a native Wayland surface on a Wayland session, where `setBounds`
 * position is a no-op. X11 is the inverse; macOS and Windows report their own
 * native backends so callers get one vocabulary.
 */

export type OzoneBackend = 'wayland' | 'x11'

function requestedOzonePlatform(env: NodeJS.ProcessEnv, argv: readonly string[]): null | string {
  let explicit: null | string = null
  let hint: null | string = null

  for (const arg of argv) {
    const match = /^--ozone-platform(-hint)?=(.+)$/.exec(arg)

    if (!match) {
      continue
    }

    if (match[1]) {
      hint = match[2].toLowerCase()
    } else {
      explicit = match[2].toLowerCase()
    }
  }

  return explicit ?? hint ?? env.ELECTRON_OZONE_PLATFORM_HINT?.toLowerCase() ?? null
}

function sessionIsWayland(env: NodeJS.ProcessEnv): boolean {
  return env.XDG_SESSION_TYPE === 'wayland' || (Boolean(env.WAYLAND_DISPLAY) && !env.DISPLAY)
}

/**
 * The Ozone platform Electron will actually use on Linux.
 *
 * Unset / `auto` follows the session. An explicit `--ozone-platform=x11`
 * (or `desktop.ozone_platform_hint: x11`) lands on X11 even on Wayland.
 */
export function linuxOzoneBackend(env: NodeJS.ProcessEnv, argv: readonly string[]): OzoneBackend {
  const requested = requestedOzonePlatform(env, argv)

  if (requested === 'x11') {
    return 'x11'
  }

  if (requested === 'wayland') {
    return 'wayland'
  }

  return sessionIsWayland(env) ? 'wayland' : 'x11'
}
