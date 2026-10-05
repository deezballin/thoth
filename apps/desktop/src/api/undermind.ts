import { connectionScoped, hermesApi } from './client'

// ── Undermind (the subconscious) read API ────────────────────────────────────
// Every payload is whatever the local Undermind proxy answered, plus
// `reachable: false` when it didn't. Fail-open is the contract: a stopped
// subconscious is *state the page renders*, never an error the shell shows.

export interface UndermindIntent {
  count: number
  intent_id: string
  last_seen_ms: number
  signature: string
}

export interface UndermindDaydreamStatus {
  cycles_run?: number
  idle_for_s?: number
  idle_threshold_s?: number
  last_result?: Record<string, unknown> | null
  running?: boolean
}

export interface UndermindServingSummary {
  median_latency_ms?: number
  models?: Record<string, number>
  recent_count?: number
  riding_fallback?: boolean
}

export interface UndermindAdversaryStats {
  ok?: number
  recent?: number
  revise?: number
  skip?: number
}

export interface UndermindHealth {
  adversary?: { mode?: string; stats?: UndermindAdversaryStats }
  cache_entries?: number
  daydream?: UndermindDaydreamStatus | null
  draft_model?: string
  handoffs?: number
  inputs?: number
  intents?: number
  model?: string
  ok?: boolean
  outputs?: number
  reflections?: number
  self_intents?: number
  serving?: UndermindServingSummary
  unprocessed_inputs?: number
  version?: string
}

export interface UndermindDoctorPipeline {
  detail?: string
  name: string
  status?: string
}

export interface UndermindDoctorStatus {
  dead?: string[]
  results?: UndermindDoctorPipeline[]
  ts?: string
  verdict?: string
  version?: string
}

export interface UndermindDoctorReport {
  alerts?: string[]
  data_dir?: string
  ok?: boolean
  status?: UndermindDoctorStatus | null
}

export interface UndermindEcho {
  kind?: string
  ref_id?: number
  score?: number
  text: string
  ts_ms?: number
}

export interface UndermindNote {
  category?: string
  issue?: string
  ts_ns?: number
}

export type UndermindHealthResponse = UndermindHealth & { error?: string; reachable?: boolean }
export type UndermindDoctorResponse = UndermindDoctorReport & { error?: string; reachable?: boolean }
export type UndermindIntentsResponse = { error?: string; intents?: UndermindIntent[]; reachable?: boolean }
export type UndermindSelfIntentsResponse = { error?: string; reachable?: boolean; self_intents?: UndermindIntent[] }
export type UndermindEchoesResponse = { echoes?: UndermindEcho[]; error?: string; reachable?: boolean }
export type UndermindNotesResponse = { error?: string; notes?: UndermindNote[]; reachable?: boolean }

// Undermind is machine-global (one proxy per host), so these carry only the
// connection scope — the profile must not fork the subconscious.

export function getUndermindHealth(): Promise<UndermindHealthResponse> {
  return hermesApi<UndermindHealthResponse>({
    ...connectionScoped(),
    path: '/api/undermind/health'
  })
}

export function getUndermindDoctor(): Promise<UndermindDoctorResponse> {
  return hermesApi<UndermindDoctorResponse>({
    ...connectionScoped(),
    path: '/api/undermind/doctor'
  })
}

export function getUndermindIntents(minCount = 2, limit = 10): Promise<UndermindIntentsResponse> {
  return hermesApi<UndermindIntentsResponse>({
    ...connectionScoped(),
    path: `/api/undermind/intents?min_count=${minCount}&limit=${limit}`
  })
}

export function getUndermindSelfIntents(minCount = 1): Promise<UndermindSelfIntentsResponse> {
  return hermesApi<UndermindSelfIntentsResponse>({
    ...connectionScoped(),
    path: `/api/undermind/self-intents?min_count=${minCount}`
  })
}

export function getUndermindEchoes(query: string, limit = 4): Promise<UndermindEchoesResponse> {
  const suffix = query ? `?q=${encodeURIComponent(query)}&limit=${limit}` : ''

  return hermesApi<UndermindEchoesResponse>({
    ...connectionScoped(),
    path: `/api/undermind/echoes${suffix}`
  })
}

export function getUndermindAdversaryNotes(): Promise<UndermindNotesResponse> {
  return hermesApi<UndermindNotesResponse>({
    ...connectionScoped(),
    path: '/api/undermind/adversary-notes'
  })
}
