import type * as React from 'react'
import { useCallback, useEffect, useState } from 'react'

import { PageLoader } from '@/components/page-loader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { EmptyState } from '@/components/ui/empty-state'
import { LogView } from '@/components/ui/log-view'
import { SearchField } from '@/components/ui/search-field'
import {
  getUndermindAdversaryNotes,
  getUndermindDoctor,
  getUndermindEchoes,
  getUndermindHealth,
  getUndermindIntents,
  getUndermindSelfIntents,
  type UndermindDoctorPipeline,
  type UndermindDoctorResponse,
  type UndermindEcho,
  type UndermindHealthResponse,
  type UndermindIntent,
  type UndermindIntentsResponse,
  type UndermindNote,
  type UndermindNotesResponse,
  type UndermindSelfIntentsResponse
} from '@/hermes'
import { fmtDayTime } from '@/lib/time'
import { cn } from '@/lib/utils'

import { useRefreshHotkey } from '../hooks/use-refresh-hotkey'
import { PAGE_INSET_X, PAGE_MAX_W } from '../layout-constants'
import type { SetStatusbarItemGroup } from '../shell/statusbar-controls'

/**
 * The Subconscious page — Undermind made visible.
 *
 * Undermind is a background mind: it mines repeated directions into offered
 * memory, folds the assistant's own replies into a self-mirror, and keeps a
 * watch-only critic on deep turns. None of that is visible anywhere else in
 * the wrapper, which is exactly the point of this page: read-only windows
 * into what the subconscious is doing while the conscious surface stays fast.
 *
 * Copy is literal English on purpose — this build ships one language (the
 * other locales are on the cut list), so nothing here goes through i18n.
 */

interface SubconsciousViewProps extends React.ComponentProps<'section'> {
  setStatusbarItemGroup?: SetStatusbarItemGroup
}

const HEALTH_POLL_MS = 30_000

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[0.6875rem] text-(--ui-text-tertiary)">{label}</div>
      <div className="text-sm tabular-nums text-(--ui-text-primary)">{value}</div>
    </div>
  )
}

function Section({
  children,
  meta,
  title
}: {
  children: React.ReactNode
  meta?: React.ReactNode
  title: string
}) {
  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-(--ui-text-primary)">{title}</h2>
        {meta ? <span className="text-xs text-(--ui-text-tertiary)">{meta}</span> : null}
      </header>
      {children}
    </section>
  )
}

function intentRow(intent: UndermindIntent): React.ReactNode {
  return (
    <div className="flex items-baseline gap-3 py-1" key={intent.intent_id}>
      <span className="min-w-0 flex-1 truncate text-sm text-(--ui-text-secondary)">{intent.signature}</span>
      <Badge size="xs" variant="muted">
        ×{intent.count}
      </Badge>
      <span className="w-24 shrink-0 text-right text-xs tabular-nums text-(--ui-text-tertiary)">
        {intent.last_seen_ms ? fmtDayTime.format(new Date(intent.last_seen_ms)) : '—'}
      </span>
    </div>
  )
}

function doctorBadge(status?: string): React.ReactNode {
  const variant =
    status === 'up' ? 'default' : status === 'dead' ? 'destructive' : status ? 'warn' : 'outline'

  return (
    <Badge size="xs" variant={variant}>
      {status ? status.toUpperCase() : 'UNKNOWN'}
    </Badge>
  )
}

function pipelineRow(pipeline: UndermindDoctorPipeline): React.ReactNode {
  return (
    <div className="flex items-baseline gap-3 py-1" key={pipeline.name}>
      <span className="w-40 shrink-0 text-sm text-(--ui-text-primary)">{pipeline.name}</span>
      {doctorBadge(pipeline.status)}
      <span className="min-w-0 flex-1 truncate text-xs text-(--ui-text-tertiary)">{pipeline.detail || '—'}</span>
    </div>
  )
}

export function SubconsciousView({ setStatusbarItemGroup: _setStatusbarItemGroup, ...props }: SubconsciousViewProps) {
  const [health, setHealth] = useState<UndermindHealthResponse | null>(null)
  const [doctor, setDoctor] = useState<UndermindDoctorResponse | null>(null)
  const [intents, setIntents] = useState<UndermindIntent[]>([])
  const [selfIntents, setSelfIntents] = useState<UndermindIntent[]>([])
  const [notes, setNotes] = useState<UndermindNote[]>([])
  const [echoes, setEchoes] = useState<UndermindEcho[]>([])
  const [echoQuery, setEchoQuery] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    // Every call is fail-open on the backend, so one rejection here would mean
    // a bug, not a downed subconscious — swallow it and keep what we have.
    const [h, d, i, s, n] = await Promise.all([
      getUndermindHealth().catch((): UndermindHealthResponse => ({ reachable: false })),
      getUndermindDoctor().catch((): UndermindDoctorResponse => ({ reachable: false })),
      getUndermindIntents(2, 10).catch((): UndermindIntentsResponse => ({ reachable: false })),
      getUndermindSelfIntents(1).catch((): UndermindSelfIntentsResponse => ({ reachable: false })),
      getUndermindAdversaryNotes().catch((): UndermindNotesResponse => ({ reachable: false }))
    ])

    setHealth(h)
    setDoctor(d)
    setIntents(i.intents ?? [])
    setSelfIntents(s.self_intents ?? [])
    setNotes(n.notes ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const id = window.setInterval(() => void load(), HEALTH_POLL_MS)

    return () => window.clearInterval(id)
  }, [load])

  useRefreshHotkey(load)

  // Echoes are a deliberate lookup (embedding search), not a live feed — fire
  // only after a short pause in typing so every keystroke isn't an encode.
  useEffect(() => {
    const query = echoQuery.trim()

    if (!query) {
      setEchoes([])

      return
    }

    const id = window.setTimeout(() => {
      void getUndermindEchoes(query, 4)
        .then(result => setEchoes(result.echoes ?? []))
        .catch(() => setEchoes([]))
    }, 400)

    return () => window.clearTimeout(id)
  }, [echoQuery])

  if (loading) {
    return <PageLoader label="Reading the subconscious" />
  }

  const reachable = Boolean(health?.reachable)
  const ridingFallback = Boolean(health?.serving?.riding_fallback)
  const daydream = health?.daydream ?? null
  const adversary = health?.adversary
  const pipelines = doctor?.status?.results ?? []
  const alerts = doctor?.alerts ?? []

  return (
    <section className={cn('h-full overflow-y-auto', PAGE_INSET_X)} {...props}>
      <div className={cn('mx-auto w-full space-y-8 py-6', PAGE_MAX_W)}>
        <header className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-base font-medium text-(--ui-text-primary)">Subconscious</h1>
            <p className="text-xs text-(--ui-text-tertiary)">
              Undermind — offered memory, self-mirror and the daydream miner, running beside the conversation.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={reachable ? (ridingFallback ? 'warn' : 'default') : 'destructive'}>
              {!health
                ? 'UNKNOWN'
                : reachable
                  ? ridingFallback
                    ? 'RIDING FALLBACK'
                    : 'AWAY'
                  : 'NOT ANSWERING'}
            </Badge>
            <Button aria-label="Refresh" onClick={() => void load()} size="icon-sm" variant="ghost">
              <Codicon name="refresh" />
            </Button>
          </div>
        </header>

        {!reachable ? (
          <EmptyState
            description="Start it with `uv run python -m undermind.proxy`, or point UNDERMIND_PROXY_URL at the host running it. Everything below stays empty until then."
            title="The subconscious isn't answering on :11435"
          />
        ) : null}

        <Section meta={health?.version ? `v${health.version}` : undefined} title="Bridge">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
            <Stat label="Inputs" value={health?.inputs ?? 0} />
            <Stat label="Unmined" value={health?.unprocessed_inputs ?? 0} />
            <Stat label="Intent buckets" value={health?.intents ?? 0} />
            <Stat label="Replies" value={health?.outputs ?? 0} />
            <Stat label="Self-themes" value={health?.self_intents ?? 0} />
            <Stat label="Reflections" value={health?.reflections ?? 0} />
            <Stat label="Handoffs" value={health?.handoffs ?? 0} />
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 text-xs text-(--ui-text-secondary)">
            <span>
              Daydream{' '}
              <span className="text-(--ui-text-primary)">{daydream?.running ? 'watching' : 'asleep'}</span>
              {daydream ? ` · ${daydream.cycles_run ?? 0} cycles · idle ${daydream.idle_for_s ?? 0}s` : ''}
            </span>
            <span>
              Serving{' '}
              <span className="text-(--ui-text-primary)">{health?.serving?.recent_count ?? 0}</span> recent
              {health?.serving?.median_latency_ms != null
                ? ` · p50 ${Math.round(health.serving.median_latency_ms)}ms`
                : ''}
            </span>
            <span>
              Critic <span className="text-(--ui-text-primary)">{adversary?.mode ?? 'off'}</span>
              {adversary?.stats
                ? ` · ${adversary.stats.revise ?? 0} revise / ${adversary.stats.ok ?? 0} ok / ${adversary.stats.skip ?? 0} skip`
                : ''}
            </span>
          </div>
        </Section>

        <Section
          meta={doctor?.status?.ts}
          title="Doctor"
        >
          {pipelines.length ? (
            <div className="space-y-0.5">{pipelines.map(pipelineRow)}</div>
          ) : (
            <p className="text-sm text-(--ui-text-tertiary)">
              No census yet — run `uv run undermind --doctor` once to populate it.
            </p>
          )}
          {alerts.length ? <LogView className="max-h-40">{alerts.join('\n')}</LogView> : null}
        </Section>

        <Section meta="offered, never directed" title="Offered memory">
          {intents.length ? (
            <div className="space-y-0.5">{intents.map(intentRow)}</div>
          ) : (
            <p className="text-sm text-(--ui-text-tertiary)">
              Nothing repeated yet. Directions you give twice land here and ride along as context.
            </p>
          )}
        </Section>

        <Section meta="mined from its own replies" title="Self-mirror">
          {selfIntents.length ? (
            <div className="space-y-0.5">{selfIntents.map(intentRow)}</div>
          ) : (
            <p className="text-sm text-(--ui-text-tertiary)">No recurring themes yet.</p>
          )}
        </Section>

        <Section meta="past reflections by meaning" title="Echoes">
          <SearchField onChange={setEchoQuery} placeholder="Ask the memory a question…" value={echoQuery} />
          {echoes.length ? (
            <div className="space-y-2 pt-1">
              {echoes.map(echo => (
                <div className="flex items-baseline gap-3" key={`${echo.ref_id ?? ''}-${echo.ts_ms ?? 0}`}>
                  <span className="min-w-0 flex-1 text-sm text-(--ui-text-secondary)">{echo.text}</span>
                  {echo.score != null ? (
                    <Badge size="xs" variant="muted">
                      {Math.round(echo.score * 100)}%
                    </Badge>
                  ) : null}
                </div>
              ))}
            </div>
          ) : echoQuery.trim() ? (
            <p className="text-sm text-(--ui-text-tertiary)">Nothing close to that.</p>
          ) : null}
        </Section>

        <Section meta="watch-only critic" title="Critic's notes">
          {notes.length ? (
            <div className="space-y-2">
              {notes.map(note => (
                <div className="flex items-baseline gap-3" key={`${note.ts_ns ?? 0}-${note.category ?? ''}`}>
                  <Badge size="xs" variant="warn">
                    {note.category || 'issue'}
                  </Badge>
                  <span className="min-w-0 flex-1 text-sm text-(--ui-text-secondary)">{note.issue}</span>
                  {note.ts_ns ? (
                    <span className="shrink-0 text-xs tabular-nums text-(--ui-text-tertiary)">
                      {fmtDayTime.format(new Date(note.ts_ns / 1e6))}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-(--ui-text-tertiary)">Nothing flagged in the recent window.</p>
          )}
        </Section>
      </div>
    </section>
  )
}
