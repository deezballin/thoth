import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { I18nProvider, registerAppLocale, useI18n } from '@/i18n'
import type { I18nContextValue } from '@/i18n'

import { Intro } from './intro'
import stock from './intro-copy.jsonl?raw'

let i18n: I18nContextValue

function Controls() {
  i18n = useI18n()

  return null
}

function Fixture({ personality, seed = 0 }: { personality?: string; seed?: number }) {
  return (
    <I18nProvider configClient={null} initialLocale="en">
      <Controls />
      <Intro personality={personality} seed={seed} />
    </I18nProvider>
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
it('translates every shipped stock body at the same personality and rotation position', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0)

  const entries = stock
    .trim()
    .split('\n')
    .map(line => JSON.parse(line) as { personality: string; body: string })

  // English is the only bundled catalog now, so a registered pack stands in
  // for the dropped locale families: one translated body per stock slot,
  // tagged so the render proves the pack (not the stock jsonl) was picked.
  const stockByPersonality: Record<string, string[]> = {}

  for (const entry of entries) {
    const bodies = (stockByPersonality[entry.personality] ??= [])
    bodies.push(`${entry.body} [pack]`)
  }

  const dispose = registerAppLocale('pl', { endonym: 'Polski', translations: { intro: { stock: stockByPersonality } } })

  try {
    const { container, rerender } = render(<Fixture />)
    await act(() => i18n.setLocale('pl'))

    for (const personality of new Set(entries.map(entry => entry.personality))) {
      expect(i18n.t.intro.stock[personality]).toHaveLength(
        entries.filter(entry => entry.personality === personality).length
      )
    }

    const indices = new Map<string, number>()

    for (const entry of entries) {
      const seed = indices.get(entry.personality) ?? 0
      indices.set(entry.personality, seed + 1)
      rerender(<Fixture personality={entry.personality} seed={seed} />)
      const body = container.querySelector('[data-slot="aui_intro"] > div > p:last-child')!.textContent
      expect(body).toBe(`${entry.body} [pack]`)
    }

    await act(() => i18n.setLocale('en'))
    rerender(<Fixture personality={entries[0].personality} seed={0} />)
    expect(container.querySelector('[data-slot="aui_intro"] > div > p:last-child')!.textContent).toBe(entries[0].body)
  } finally {
    dispose()
  }
})
it('localizes the custom-personality fallback without translating its user-supplied name', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0)
  const custom = (name: string) => [`A pack-localized greeting that still names ${name}.`]
  const disposePl = registerAppLocale('pl', { translations: { intro: { custom } } })
  const disposeCs = registerAppLocale('cs', { translations: { intro: { custom } } })

  try {
    const { container } = render(<Fixture personality="My Custom Voice" seed={4} />)
    const english = container.querySelector('[data-slot="aui_intro"] > div > p:last-child')!.textContent

    for (const locale of ['pl', 'cs'] as const) {
      await act(() => i18n.setLocale(locale))
      const body = container.querySelector('[data-slot="aui_intro"] > div > p:last-child')!.textContent
      expect(body).not.toBe(english)
      expect(body).toContain('My Custom Voice')
    }
  } finally {
    disposePl()
    disposeCs()
  }
})
