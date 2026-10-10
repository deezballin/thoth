import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { fieldCopyForSchemaKey } from '@/app/settings/field-copy'

import { TRANSLATIONS } from './catalog'
import { registerAppLocale, resetAppLocaleRegistry } from './registry'
import { setRuntimeI18nLocale, translateNow } from './runtime'

describe('desktop i18n runtime translator', () => {
  beforeEach(() => {
    setRuntimeI18nLocale('en')
  })

  afterEach(() => {
    setRuntimeI18nLocale('en')
    resetAppLocaleRegistry()
  })

  it('translates string paths for the active runtime locale', () => {
    // English is the only bundled catalog; a registered pack is what makes a
    // second locale renderable, so exercise the active-locale path through it.
    registerAppLocale('pl', { translations: { boot: { ready: 'Gotowe' } } })
    setRuntimeI18nLocale('pl')

    expect(translateNow('boot.ready')).toBe('Gotowe')
    expect(translateNow('boot.ready')).not.toBe(TRANSLATIONS.en.boot.ready)
    // Keys the pack does not carry fall back per key, never to the raw key.
    expect(translateNow('assistant.tool.statusRecovered')).toBe(TRANSLATIONS.en.assistant.tool.statusRecovered)
  })

  it('passes arguments to function translations', () => {
    expect(translateNow('notifications.updateReadyMessage', 2)).toBe(
      TRANSLATIONS.en.notifications.updateReadyMessage(2)
    )
    expect(translateNow('notifications.updateReadyMessage', 2)).toContain('2')
  })

  it('keeps settings field copy addressable from schema keys', () => {
    const field = ['display', 'show_reasoning'].join('.')

    expect(fieldCopyForSchemaKey(TRANSLATIONS.en.settings.fieldLabels, field)).toBeTypeOf('string')
    expect(fieldCopyForSchemaKey(TRANSLATIONS.en.settings.fieldDescriptions, field)).toBeTypeOf('string')
  })

  it('returns the key when no locale can resolve a path', () => {
    setRuntimeI18nLocale('zz')

    expect(translateNow('missing.path')).toBe('missing.path')
  })
})
