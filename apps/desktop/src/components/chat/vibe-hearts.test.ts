import { beforeEach, describe, expect, it, vi } from 'vitest'

const { burst } = vi.hoisted(() => ({ burst: vi.fn() }))

vi.mock('@/components/particles/particle-field', () => ({
  createParticleEmitter: () => ({ burst, subscribe: () => () => undefined }),
  ParticleField: () => null
}))

import { burstVibeHearts } from '@/components/chat/vibe-hearts'
import { setVibeHeartsEnabled } from '@/store/vibe-hearts-enabled'

// Hearts used to route between three destinations (popped-out pet, in-window
// pet, composer). With the companion gone the router collapses to one: the
// field plays, gated by the preference.
describe('burstVibeHearts', () => {
  beforeEach(() => {
    burst.mockClear()
    setVibeHeartsEnabled(true)
  })

  it('plays hearts when the preference is on', () => {
    burstVibeHearts()

    expect(burst).toHaveBeenCalledOnce()
  })

  it('no-ops when the preference is off', () => {
    setVibeHeartsEnabled(false)

    burstVibeHearts()

    expect(burst).not.toHaveBeenCalled()
  })

  it('stays silent on a preference change made after the burst was requested', () => {
    setVibeHeartsEnabled(false)

    burstVibeHearts()

    expect(burst).not.toHaveBeenCalled()
  })
})
