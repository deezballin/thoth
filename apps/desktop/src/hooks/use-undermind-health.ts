import { getUndermindHealth } from '@/api/undermind'
import { $undermindHealth } from '@/store/undermind-health'

import { useViewedInterval } from './use-viewed-interval'

/** Ambient cadence. This is a dot, not a dashboard — the subconscious does not
 *  change second-to-second, and the endpoint is a local HTTP hop. */
const UNDERMIND_HEALTH_INTERVAL_MS = 30_000

/**
 * One probe of `/api/undermind/health`, feeding `$undermindHealth`.
 *
 * This is an `async` function rather than a bare `.then()` chain for one
 * specific reason: `hermesApi` reads `window.hermesDesktop.api` and throws
 * SYNCHRONOUSLY when the bridge isn't there — a gateway-less window, or under
 * vitest where nothing stubs it. Only an async body converts that throw into a
 * rejection this try/catch can absorb, so "no bridge" can never escape as an
 * unhandled error in a render effect.
 *
 * On failure nothing is written. See `$undermindDotState`: the router answers
 * HTTP 200 even when the proxy is down, so a rejected request means the
 * GATEWAY is unreachable — which says nothing about Undermind, and must not be
 * painted as its state.
 */
export async function probeUndermindHealth(): Promise<void> {
  try {
    const health = await getUndermindHealth()

    // A bridge that answers with a non-object would otherwise become a
    // "successful" probe of nothing.
    if (health && typeof health === 'object') {
      $undermindHealth.set(health)
    }
  } catch {
    // Gateway unreachable — keep the last known state instead of inventing one.
  }
}

/**
 * Probe on a slow cadence while this window is actually being viewed, feeding
 * `$undermindHealth`.
 *
 * `useViewedInterval` rather than a bare `setInterval` because a hidden or
 * unfocused window has nobody to show the dot to — and it fires a leading tick
 * on focus/visibility return, so a dot that was off-screen comes back correct
 * immediately instead of up to half a minute stale.
 */
export function useUndermindHealthPoll(enabled = true): void {
  useViewedInterval(
    () => {
      void probeUndermindHealth()
    },
    UNDERMIND_HEALTH_INTERVAL_MS,
    enabled
  )
}
