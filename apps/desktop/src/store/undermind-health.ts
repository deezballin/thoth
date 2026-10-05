/**
 * UNDERMIND DOT STATE — the ambient health light on the sidebar's Subconscious
 * row. One store so the dot can never disagree with the page it points at.
 *
 * The FastAPI router (`hermes_cli/web_routers/undermind.py`) answers
 * `/api/undermind/health` with **HTTP 200 in every case it can reach the
 * gateway**: `{"reachable": false, "error": ...}` when the Undermind proxy on
 * :11435 is down, otherwise `{"reachable": true, ...payload}`. It never 5xx's.
 *
 * That makes the failure modes unambiguous, and this store is built around not
 * lying about them:
 *
 * - `reachable: false` → the subconscious is genuinely down → `down`.
 * - `ok: false` while reachable → up but reporting unhealthy → `down`.
 * - The REQUEST itself failed → the gateway is unreachable, which says nothing
 *   about Undermind. We keep the last known state instead of inventing one.
 * - Never probed → `null` → the dot stays hidden.
 *
 * An ambient indicator that guesses is worse than no indicator: a red dot that
 * means "we couldn't ask" teaches people to ignore the red dot that means
 * "it's dead".
 */

import { atom, computed } from 'nanostores'

import type { UndermindHealthResponse } from '@/api/undermind'

/** `null` = not probed (or the last probe failed): render nothing. */
export type UndermindDotState = 'down' | 'up' | null

/** Last successful health payload. Deliberately NOT cleared on failure. */
export const $undermindHealth = atom<UndermindHealthResponse | null>(null)

/**
 * The row's dot as a single scalar — `useStore` / `useStoreSelector` both want
 * a primitive snapshot, and deriving it here means every surface that asks the
 * question gets the same answer.
 */
export const $undermindDotState = computed($undermindHealth, (health): UndermindDotState => {
  if (!health) {
    return null
  }

  if (health.reachable === false || health.ok === false) {
    return 'down'
  }

  return 'up'
})
