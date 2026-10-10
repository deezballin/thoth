import { describe, expect, it } from 'vitest'

import { TRANSLATIONS } from './catalog'
import { DEFAULT_LOCALE, isLocale, isSupportedLocaleValue, LOCALE_OPTIONS, normalizeLocale } from './languages'

describe('desktop i18n languages', () => {
  it('normalizes supported locale aliases', () => {
    expect(normalizeLocale('en')).toBe('en')
    expect(normalizeLocale('EN-US')).toBe('en')
    expect(normalizeLocale(' en_us ')).toBe('en')
  })

  it('falls back to English for languages the app no longer bundles', () => {
    // Phase 4 dropped the eight non-English families: config and OS values
    // that used to map onto them must settle on English instead of naming a
    // catalog the binary cannot render.
    for (const value of [
      'zh',
      'zh-CN',
      'zh-Hans',
      'zh-TW',
      'zh_HK',
      'ja',
      'ja-JP',
      'ar',
      'AR-SA',
      'ru',
      'RU-RU',
      'fr',
      'FR-CA',
      'de',
      'DE-AT',
      'es',
      'ES-419'
    ]) {
      expect(normalizeLocale(value), value).toBe(DEFAULT_LOCALE)
      expect(isSupportedLocaleValue(value), value).toBe(false)
    }
  })

  it('falls back to English for empty or unsupported values', () => {
    expect(normalizeLocale(null)).toBe(DEFAULT_LOCALE)
    expect(normalizeLocale('')).toBe(DEFAULT_LOCALE)
    expect(normalizeLocale('it')).toBe(DEFAULT_LOCALE)
  })

  it('distinguishes exact locale ids from supported config aliases', () => {
    expect(isSupportedLocaleValue('en-US')).toBe(true)
    expect(isSupportedLocaleValue('it')).toBe(false)
    expect(isSupportedLocaleValue('zh-CN')).toBe(false)
    expect(isLocale('en-US')).toBe(false)
    expect(isLocale('en')).toBe(true)
    expect(isLocale('zh')).toBe(false)
    expect(isLocale('zh-hant')).toBe(false)
    expect(isLocale('ja')).toBe(false)
    expect(isLocale('ar')).toBe(false)
  })

  it('bundles exactly English and offers exactly it in the picker', () => {
    expect(Object.keys(TRANSLATIONS)).toEqual(['en'])
    expect(LOCALE_OPTIONS.map(option => option.id)).toEqual(['en'])
  })

  it('round-trips every picker option through its display.language value to a registered catalog', () => {
    for (const option of LOCALE_OPTIONS) {
      expect(normalizeLocale(option.configValue)).toBe(option.id)
      expect(TRANSLATIONS[option.id]).toBeDefined()
    }

    expect(Object.keys(TRANSLATIONS).sort()).toEqual(LOCALE_OPTIONS.map(option => option.id).sort())
  })
})
