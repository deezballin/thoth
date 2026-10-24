import { contrastRatio, parseColor } from '@hermes/shared/color'
import { describe, expect, it } from 'vitest'

import { BUILTIN_THEME_LIST, BUILTIN_THEMES, DEFAULT_TYPOGRAPHY, nousTheme, thothTheme } from './presets'

// #40364: none of the UI text/mono fonts carry emoji glyphs, so every font
// stack must end with a color-emoji fallback or emoji render as tofu on
// platforms whose default font lacks them (e.g. Linux).
describe('theme typography emoji fallback (#40364)', () => {
  const stacks: Array<[string, string]> = [
    ['DEFAULT_TYPOGRAPHY.fontSans', DEFAULT_TYPOGRAPHY.fontSans],
    ['DEFAULT_TYPOGRAPHY.fontMono', DEFAULT_TYPOGRAPHY.fontMono],
    // A theme may override only fontMono (fontSans then falls back to the
    // default, which already carries the emoji stack), so skip undefined.
    ...BUILTIN_THEME_LIST.flatMap(theme =>
      (
        [
          [`${theme.name}.fontSans`, theme.typography?.fontSans],
          [`${theme.name}.fontMono`, theme.typography?.fontMono]
        ] as Array<[string, string | undefined]>
      ).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    )
  ]

  it.each(stacks)('%s includes a color-emoji font', (_label, stack) => {
    expect(stack).toMatch(/Apple Color Emoji|Segoe UI Emoji|Noto Color Emoji|(^|,\s*)emoji\b/)
  })
})

describe('theme typography Latin Extended fallback (#61392)', () => {
  const monoStacks: Array<[string, string]> = [
    ['DEFAULT_TYPOGRAPHY.fontMono', DEFAULT_TYPOGRAPHY.fontMono],
    ...BUILTIN_THEME_LIST.map(
      theme =>
        [
          `${theme.name}.effectiveFontMono`,
          theme.typography?.fontMono ?? nousTheme.typography?.fontMono ?? DEFAULT_TYPOGRAPHY.fontMono
        ] as [string, string]
    )
  ]

  it.each(monoStacks)('%s falls back to bundled JetBrains Mono before generic fonts', (_label, stack) => {
    const jetbrains = stack.indexOf('JetBrains Mono')

    expect(jetbrains).toBeGreaterThanOrEqual(0)

    const genericIndexes = [
      stack.indexOf('ui-monospace'),
      stack.indexOf('monospace'),
      stack.indexOf('Apple Color Emoji'),
      stack.indexOf('Segoe UI Emoji'),
      stack.indexOf('Noto Color Emoji')
    ].filter(index => index >= 0)

    expect(genericIndexes.length).toBeGreaterThan(0)
    expect(jetbrains).toBeLessThan(Math.min(...genericIndexes))
  })

  it('default stack includes common Linux monospace glyph fallbacks', () => {
    expect(DEFAULT_TYPOGRAPHY.fontMono).toContain('DejaVu Sans Mono')
    expect(DEFAULT_TYPOGRAPHY.fontMono).toContain('Liberation Mono')
    expect(DEFAULT_TYPOGRAPHY.fontMono).toContain('Noto Sans Mono')
  })
})

describe('Thoth monochrome X-ray theme', () => {
  const modes = [
    ['light', thothTheme.colors],
    ['dark', thothTheme.darkColors!]
  ] as const

  it('is registered as its own selectable built-in without replacing Mono', () => {
    expect(BUILTIN_THEMES.thoth).toBe(thothTheme)
    expect(BUILTIN_THEME_LIST.map(theme => theme.name)).toContain('thoth')
    expect(BUILTIN_THEMES.mono.name).toBe('mono')
  })

  it.each(modes)('%s palette is neutral and keeps text and focus legible', (_mode, colors) => {
    expect(contrastRatio(colors.foreground, colors.background)).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(colors.cardForeground, colors.card)).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(colors.mutedForeground, colors.muted)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(colors.primary, colors.sidebarBackground!)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(colors.primary, colors.primaryForeground)).toBeGreaterThanOrEqual(4.5)

    for (const [slot, color] of Object.entries(colors)) {
      if (slot === 'destructive' || slot === 'destructiveForeground') {
        continue
      }

      expect(color, slot + ' stays grayscale').toMatch(/^#[0-9a-f]{6}$/i)
      expect(parseColor(color)![0]).toBe(parseColor(color)![1])
      expect(parseColor(color)![1]).toBe(parseColor(color)![2])
    }
  })

  const terminalSlots = [
    'foreground',
    'black',
    'red',
    'green',
    'yellow',
    'blue',
    'magenta',
    'cyan',
    'white',
    'brightBlack',
    'brightRed',
    'brightGreen',
    'brightYellow',
    'brightBlue',
    'brightMagenta',
    'brightCyan',
    'brightWhite'
  ] as const

  // The only slots allowed to carry hue: the ANSI status colors.
  const statusHues = new Set(['red', 'green', 'yellow', 'brightRed', 'brightGreen', 'brightYellow'])

  it.each([
    ['light', thothTheme.terminal, thothTheme.colors.background],
    ['dark', thothTheme.darkTerminal, thothTheme.darkColors!.background]
  ] as const)('%s terminal palette ships every ANSI slot, color reserved for status', (_mode, palette, surface) => {
    expect(palette).toBeDefined()


    for (const slot of terminalSlots) {
      const color = palette?.[slot]
      expect(color, slot + ' is a hex color').toMatch(/^#[0-9a-f]{6}$/i)

      if (!color || statusHues.has(slot)) {
        continue
      }

      expect(parseColor(color)![0], slot + ' stays grayscale').toBe(parseColor(color)![1])
      expect(parseColor(color)![1], slot + ' stays grayscale').toBe(parseColor(color)![2])
    }

    expect(contrastRatio(palette!.foreground!, surface)).toBeGreaterThanOrEqual(7)
  })
})
