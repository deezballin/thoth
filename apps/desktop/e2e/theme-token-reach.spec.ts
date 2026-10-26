/**
 * Theme-token reachability — every skin seed must actually move a shipped
 * surface token, in both modes.
 *
 * Guards the bug class behind `userBubble`: a seed the preset declares
 * reaches the UI only through `color-mix()` knobs, and a knob sitting at 0%
 * for one mode silently drops the seed — the chain still compiles, every
 * static check passes, and the surface paints the neutral fallback instead
 * of the skin's color (while Settings previews the declared value). A source
 * scan cannot see this; resolving the chain in the browser can: override the
 * seed on <html>, re-resolve the witness token, require the color to move,
 * then restore and require it to come back.
 *
 * Witness = the token that directly consumes the seed (two hops for the
 * sidebar, through `--ui-bg-sidebar`), each verified to be referenced by
 * shipped markup or stylesheet rules. jsdom does not resolve var() or
 * color-mix(), so this runs in the Electron app like the rest of the suite.
 * Requires `npm run build` so dist/ exists.
 */

import { type MockBackendFixture, setupMockBackend, waitForAppReady } from './fixtures'
import { expect, test } from './test'

/**
 * Seed → the token whose resolved color must move when the seed moves.
 *
 * Witnesses live at the `--ui-bg-*`/`--dt-*` layer, not the `--ui-*-
 * surface-background` wrappers: glass mode legitimately pins those wrappers
 * (transparent, or a near-opaque mix) per scope, so they don't reflect their
 * seed while glass is live — the seed contract is one layer down, in the
 * token each wrapper derives from.
 */
const SEED_WITNESSES: Array<{ seed: string; witness: string }> = [
  { seed: '--theme-foreground', witness: '--ui-base' },
  { seed: '--theme-primary', witness: '--ui-accent-secondary' },
  { seed: '--theme-secondary', witness: '--dt-secondary' },
  { seed: '--theme-accent-soft', witness: '--dt-accent' },
  { seed: '--theme-midground', witness: '--ui-accent' },
  { seed: '--theme-warm', witness: '--ui-warm' },
  { seed: '--theme-background-seed', witness: '--ui-bg-chrome' },
  { seed: '--theme-sidebar-seed', witness: '--ui-bg-sidebar' },
  { seed: '--theme-card-seed', witness: '--ui-bg-editor' },
  { seed: '--theme-elevated-seed', witness: '--ui-bg-elevated' },
  // The pair this guard exists for — light mode's 0%-mix knob hid the seed
  // behind the neutral card until the --dt-user-bubble-fill split.
  { seed: '--theme-bubble-seed', witness: '--dt-user-bubble' }
]

/** A stark override no grayscale seed already resolves to. */
const PERTURBATION = '#ff00ff'

let fixture: MockBackendFixture | null = null

test.beforeAll(async () => {
  fixture = await setupMockBackend()
  await waitForAppReady(fixture!, 120_000)
})

test.afterAll(async () => {
  await fixture?.cleanup()
  fixture = null
})

test.describe('theme token reachability', () => {
  test('every skin seed moves its witness token in light and dark', async () => {
    const page = fixture!.page

    /**
     * Resolve each witness before, during (seed overridden to a stark
     * color), and after (seed restored) — all in one evaluate so the three
     * reads can't interleave with app re-renders.
     */
    const probeAll = () =>
      page.evaluate(pairs => {
        const root = document.documentElement

        const resolve = (token: string) => {
          const probe = document.createElement('div')
          probe.style.backgroundColor = `var(${token})`
          root.appendChild(probe)
          const value = getComputedStyle(probe).backgroundColor
          probe.remove()
          return value
        }

        return pairs.map(({ seed, witness }) => {
          const before = resolve(witness)
          const saved = root.style.getPropertyValue(seed)
          root.style.setProperty(seed, '#ff00ff')
          const perturbed = resolve(witness)

          if (saved) {
            root.style.setProperty(seed, saved)
          } else {
            root.style.removeProperty(seed)
          }

          return { before, perturbed, restored: resolve(witness), seed, witness }
        })
      }, SEED_WITNESSES)

    const assertReachable = (mode: string, results: Awaited<ReturnType<typeof probeAll>>) => {
      for (const { before, perturbed, restored, seed, witness } of results) {
        expect(perturbed, `${witness} must move when ${seed} changes (mode: ${mode}; before=${before}, perturbed=${perturbed})`).not.toBe(before)
        expect(restored, `${witness} must return when ${seed} is restored (mode: ${mode}; before=${before}, restored=${restored})`).toBe(before)
      }
    }

    assertReachable('light', await probeAll())

    // Flip appearance → Dark through the real Settings UI, same path the
    // bubble-fill test uses (setMode persists, applyTheme repaints).
    await page.getByRole('button', { name: 'Open settings', exact: true }).click()
    await page.getByRole('button', { name: 'Appearance', exact: true }).click()
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('button', { name: 'Dark', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'dark', { timeout: 10_000 })
    await page.getByRole('button', { name: 'Close settings', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Appearance', exact: true })).toBeHidden({ timeout: 10_000 })

    assertReachable('dark', await probeAll())
  })
})
