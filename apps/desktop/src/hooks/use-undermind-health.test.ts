/**
 * The probe is the half of this feature that can fail, so it gets tested
 * directly rather than only through a rendered hook: it is a plain async
 * function, and the interesting case is what it does NOT write.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getUndermindHealth, type UndermindHealthResponse } from '@/api/undermind'
import { $undermindHealth } from '@/store/undermind-health'

import { probeUndermindHealth } from './use-undermind-health'

vi.mock('@/api/undermind', () => ({ getUndermindHealth: vi.fn() }))

const mockHealth = vi.mocked(getUndermindHealth)

describe('probeUndermindHealth', () => {
  beforeEach(() => {
    $undermindHealth.set(null)
    mockHealth.mockReset()
  })

  it('records a successful probe', async () => {
    mockHealth.mockResolvedValue({ reachable: true, intents: 4 })

    await probeUndermindHealth()

    expect($undermindHealth.get()).toEqual({ reachable: true, intents: 4 })
  })

  it('records reachable:false so the dot can go down', async () => {
    mockHealth.mockResolvedValue({ reachable: false, error: 'connection refused' })

    await probeUndermindHealth()

    expect($undermindHealth.get()).toMatchObject({ reachable: false })
  })

  it('keeps the last known state when the gateway cannot be reached', async () => {
    $undermindHealth.set({ reachable: true })
    mockHealth.mockRejectedValue(new Error('bridge missing'))

    await probeUndermindHealth()

    expect($undermindHealth.get()).toEqual({ reachable: true })
  })

  it('leaves the store untouched when nothing was probed yet', async () => {
    mockHealth.mockRejectedValue(new Error('bridge missing'))

    await probeUndermindHealth()

    expect($undermindHealth.get()).toBe(null)
  })

  it('ignores a non-object answer instead of recording a probe of nothing', async () => {
    mockHealth.mockResolvedValue(undefined as unknown as UndermindHealthResponse)

    await probeUndermindHealth()

    expect($undermindHealth.get()).toBe(null)
  })

  it('absorbs a SYNCHRONOUS throw from the bridge rather than rejecting', async () => {
    // window.hermesDesktop.api is undefined outside Electron (vitest, a
    // gateway-less window), so the call throws before it can return a promise.
    mockHealth.mockImplementation(() => {
      throw new Error('Cannot read properties of undefined')
    })

    await expect(probeUndermindHealth()).resolves.toBeUndefined()

    expect($undermindHealth.get()).toBe(null)
  })
})
