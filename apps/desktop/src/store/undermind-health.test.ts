/**
 * The dot must never claim to know something it doesn't. These cases pin the
 * distinction the store exists to enforce: `reachable:false` (asked, proxy is
 * down) is a real `down`; an unanswered probe is `null`, not `down`.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { $undermindDotState, $undermindHealth } from './undermind-health'

describe('undermind dot state', () => {
  beforeEach(() => {
    $undermindHealth.set(null)
  })

  it('renders nothing until a probe succeeds', () => {
    expect($undermindDotState.get()).toBe(null)
  })

  it('lights up when the proxy answers', () => {
    $undermindHealth.set({ reachable: true, intents: 4 })
    expect($undermindDotState.get()).toBe('up')
  })

  it('goes down when the router reports the proxy unreachable', () => {
    $undermindHealth.set({ reachable: false, error: 'connection refused' })
    expect($undermindDotState.get()).toBe('down')
  })

  it('goes down when reachable but reporting unhealthy', () => {
    $undermindHealth.set({ reachable: true, ok: false })
    expect($undermindDotState.get()).toBe('down')
  })

  it('treats a payload without ok as up — ok is optional, not defaulted false', () => {
    $undermindHealth.set({ reachable: true, intents: 1 })
    expect($undermindDotState.get()).toBe('up')
  })
})
