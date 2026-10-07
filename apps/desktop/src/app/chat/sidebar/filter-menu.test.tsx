import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import { I18nProvider, registerAppLocale, resolveTranslations, TRANSLATIONS, useI18n } from '@/i18n'
import type { I18nContextValue } from '@/i18n'
import { $interfaceMode } from '@/store/interface-mode'
import {
  $sidebarListGroupIds,
  $sidebarOrdering,
  $sidebarStatusFilter,
  resetSidebarView,
  setSidebarGrouping,
  setSidebarOrdering
} from '@/store/layout'

import { SidebarFilterMenu } from './filter-menu'

let i18n: I18nContextValue

function Menu() {
  i18n = useI18n()

  return <SidebarFilterMenu />
}

afterEach(() => {
  cleanup()
  resetSidebarView()
})

it('translates the live filter menu while preserving selected values and the current grouping order', async () => {
  // Two registered packs stand in for the dropped bundled families: the menu
  // must repaint on a live switch while every selection survives it.
  const disposePl = registerAppLocale('pl', {
    translations: {
      sidebar: {
        filter: {
          filters: 'Filtry',
          grouping: 'Grupowanie',
          status: 'Stan',
          updated: 'Zaktualizowane',
          needsInput: 'Wymaga uwag'
        }
      }
    }
  })

  const disposeCs = registerAppLocale('cs', {
    translations: {
      sidebar: {
        filter: { status: 'Stav', needsInput: 'Vyžaduje vstup' },
        profileRail: 'Profilová lišta',
        markAllRead: 'Označit vše jako přečtené'
      }
    }
  })

  try {
    $interfaceMode.set('advanced')
    setSidebarGrouping('date')
    setSidebarOrdering('manual')
    $sidebarListGroupIds.set(['today'])
    render(
      <I18nProvider configClient={null} initialLocale="en">
        <Menu />
      </I18nProvider>
    )
    const en = TRANSLATIONS.en.sidebar.filter
    fireEvent.keyDown(screen.getByRole('button', { name: en.filters }), { key: 'Enter' })
    const group = screen.getByRole('menuitem', { name: new RegExp(en.grouping) })
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(screen.getByRole('menuitemradio', { name: en.updated }).getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(screen.getByRole('menuitemradio', { name: en.updated }), { key: 'Escape' })
    fireEvent.keyDown(screen.getByRole('button', { name: en.filters }), { key: 'Enter' })
    fireEvent.keyDown(screen.getByRole('menuitem', { name: en.status }), { key: 'ArrowRight' })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: en.needsInput }))
    expect($sidebarStatusFilter.get()).toContain('needs-input')
    await act(() => i18n.setLocale('pl'))
    const pl = resolveTranslations('pl').sidebar.filter
    expect(pl.needsInput).not.toBe(en.needsInput)
    fireEvent.keyDown(screen.getByRole('menuitem', { name: pl.status }), { key: 'ArrowRight' })
    expect(screen.getByRole('menuitemcheckbox', { name: pl.needsInput }).getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByRole('menuitemcheckbox', { name: en.needsInput })).toBeNull()
    await act(() => i18n.setLocale('cs'))
    expect(screen.getByText(resolveTranslations('cs').sidebar.profileRail)).toBeTruthy()
    expect(screen.getByText(resolveTranslations('cs').sidebar.markAllRead)).toBeTruthy()
    expect(screen.queryByText(TRANSLATIONS.en.sidebar.profileRail)).toBeNull()
    expect(screen.queryByText(TRANSLATIONS.en.sidebar.markAllRead)).toBeNull()
    expect($sidebarOrdering.get()).toBe('manual')
  } finally {
    disposePl()
    disposeCs()
  }
})
