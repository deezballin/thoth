/**
 * E2E chat tests — send a message and verify a response appears.
 *
 * Requires the full boot chain to complete (hermes serve + mock inference
 * provider). The mock server returns a canned reply, so we verify the
 * response text shows up in the chat transcript.
 *
 * Prerequisite: `npm run build` must have been run so dist/ exists.
 */

import { runDesktopChatSmoke } from '../../../tests-js/scripts/desktop-chat-smoke'
import { BLOCKING_CLARIFY_QUESTION, BLOCKING_CLARIFY_TRIGGER } from '../../../tests-js/scripts/mock-server'

import { type MockBackendFixture, setupMockBackend, waitForAppReady } from './fixtures'
import { expect, test } from './test'
import { expectVisualSnapshot } from './visual-snapshot'

let fixture: MockBackendFixture | null = null

test.beforeAll(async () => {
  fixture = await setupMockBackend()
  await waitForAppReady(fixture!, 120_000)
})

test.afterAll(async () => {
  await fixture?.cleanup()
  fixture = null
})

test.describe('chat interaction with mock backend', () => {
  test('send a message and receive a response', async (): Promise<void> => {
    await runDesktopChatSmoke(fixture!.page, {
      mockUrl: fixture!.mockUrl,
      phase: 'installed',
      outDir: test.info().outputPath('desktop-chat'),
    })
  })

  test('screenshot of chat with messages', async () => {
    await expectVisualSnapshot(fixture!.page, { name: 'chat-with-messages', app: fixture!.app })
  })

  test('user bubble fill follows the theme seed in light and the blended surface in dark', async () => {
    const page = fixture!.page

    /** Resolve the user-bubble fill through the live token chain. var()
     * inside a custom property substitutes at computed-value time, so a
     * probe element reads the final color the bubble would paint. */
    const readBubble = () =>
      page.evaluate(() => {
        const root = document.documentElement
        const probe = document.createElement('div')
        probe.style.backgroundColor = 'var(--dt-user-bubble)'
        root.appendChild(probe)
        const resolved = getComputedStyle(probe).backgroundColor
        probe.remove()

        const cssVar = (name: string) => getComputedStyle(root).getPropertyValue(name).trim()

        return {
          card: cssVar('--theme-neutral-card'),
          keep: cssVar('--user-bubble-keep'),
          mix: cssVar('--theme-mix-bubble'),
          resolved,
          seed: cssVar('--theme-bubble-seed')
        }
      })

    /** Chromium serializes a color-mix() result as `color(srgb …)` floats,
     * not `rgb()` — accept both. */
    const parseRgb = (value: string): [number, number, number] => {
      const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+)?\)$/.exec(value)

      if (srgb) {
        return [1, 2, 3].map(i => Math.round(Number(srgb[i]) * 255)) as [number, number, number]
      }

      const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value)

      if (!rgb) {
        throw new Error(`unparsed color: ${value}`)
      }

      return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
    }

    const parseHex = (value: string): [number, number, number] => {
      const m = /^#([0-9a-f]{6})$/i.exec(value)

      if (!m) {throw new Error(`unparsed hex: ${value}`)}
      const n = Number.parseInt(m[1], 16)

      return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    }

    const expectClose = (label: string, actual: string, expected: [number, number, number]) => {
      const [r, g, b] = parseRgb(actual)
      const worst = Math.max(Math.abs(r - expected[0]), Math.abs(g - expected[1]), Math.abs(b - expected[2]))
      expect(worst, `${label}: ${actual} vs rgb(${expected.join(', ')})`).toBeLessThanOrEqual(1)
    }

    // Light: the bubble must paint the skin's declared userBubble seed
    // solid — the fix that replaced the neutral-card dead end where the
    // 0%-mix overlay token dropped the seed entirely.
    const light = await readBubble()
    expect(light.keep, 'default translucency lever stays unset').toBe('')
    expectClose('light bubble = seed solid', light.resolved, parseHex(light.seed))

    // Flip appearance → Dark through the real Settings UI (full chain:
    // setMode persists per-profile, applyTheme repaints the document).
    await page.getByRole('button', { name: 'Open settings', exact: true }).click()
    await page.getByRole('button', { name: 'Appearance', exact: true }).click()
    // Appearance is a group; the mode picker lives in its Theme subpage.
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('button', { name: 'Dark', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'dark', { timeout: 10_000 })
    await page.getByRole('button', { name: 'Close settings', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Appearance', exact: true })).toBeHidden({ timeout: 10_000 })

    // Dark: the long-standing blend — --theme-mix-bubble of the seed toward
    // the neutral card — so a bright seed settles instead of glowing.
    const dark = await readBubble()
    const ratio = Number.parseFloat(dark.mix) / 100
    const [sr, sg, sb] = parseHex(dark.seed)
    const [cr, cg, cb] = parseHex(dark.card)

    const blended: [number, number, number] = [
      Math.round(sr * ratio + cr * (1 - ratio)),
      Math.round(sg * ratio + cg * (1 - ratio)),
      Math.round(sb * ratio + cb * (1 - ratio))
    ]

    expectClose('dark bubble = seed blended toward the card', dark.resolved, blended)

    await expectVisualSnapshot(page, { name: 'chat-dark-mode', app: fixture!.app })

    // Restore light so later tests in this shared fixture keep their state.
    await page.getByRole('button', { name: 'Open settings', exact: true }).click()
    await page.getByRole('button', { name: 'Appearance', exact: true }).click()
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.getByRole('button', { name: 'Light', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-hermes-mode', 'light', { timeout: 10_000 })
    await page.getByRole('button', { name: 'Close settings', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Appearance', exact: true })).toBeHidden({ timeout: 10_000 })
  })

  test('offers stop, steer, and queue actions while busy', async () => {
    const testInfo = test.info()
    const page = fixture!.page
    const composer = page.locator('[contenteditable="true"]').first()
    const primary = page.locator('[data-slot="composer-root"] button[type="submit"]')
    const queue = page.locator('[data-slot="composer-root"] button[aria-label="Queue message"]')

    await composer.click()
    await composer.type(BLOCKING_CLARIFY_TRIGGER)
    await page.keyboard.press('Enter')
    await page.getByText(BLOCKING_CLARIFY_QUESTION).waitFor({ state: 'visible', timeout: 30_000 })

    await expect(primary).toHaveAttribute('aria-label', 'Stop')

    await composer.click()
    await composer.type('please answer tersely')
    // Since "running is not busy" (3bc52fb9df) the primary keeps the Send
    // affordance mid-turn — steer is routed through the submit engine, not a
    // separate labeled button. Queue remains the explicit secondary action.
    await expect(primary).toHaveAttribute('aria-label', 'Send')
    await expect(queue).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('busy-composer-steer.png') })

    await queue.click()
    await expect(primary).toHaveAttribute('aria-label', 'Stop')
    await expect(queue).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath('busy-composer-queue.png') })
    await expect(page.getByText('1 Queued')).toBeVisible()

    await primary.click()
    await expect(page.getByText('1 Queued — paused')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('busy-composer-queue-paused.png') })
  })
})
