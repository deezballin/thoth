import { RowButton } from '@/components/ui/row-button'
import { useI18n } from '@/i18n'
import { ChevronRight } from '@/lib/icons'
import { PROVIDER_DISPLAY_NAMES } from '@/lib/model-status-label'
import type { OAuthProvider } from '@/types/hermes'

const PROVIDER_ORDER: Record<string, number> = {
  nous: 0,
  'openai-codex': 1,
  'minimax-oauth': 2,
  'qwen-oauth': 3,
  'xai-oauth': 4,
  anthropic: 5,
  'claude-code': 6
}

const assetPath = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`

export const providerTitle = (p: OAuthProvider) => PROVIDER_DISPLAY_NAMES[p.id] ?? p.name
const orderOf = (p: OAuthProvider) => PROVIDER_ORDER[p.id] ?? 99

export const sortProviders = (providers: OAuthProvider[]) =>
  [...providers].sort((a, b) => orderOf(a) - orderOf(b) || a.name.localeCompare(b.name))

const PROVIDER_ROW_CLASS =
  'group flex w-full items-center justify-between gap-3 rounded-[6px] px-3 py-2.5 text-left transition-colors hover:bg-(--ui-control-hover-background)'

/** Quick-key row for API-key providers (Fireworks leads the key catalog, OpenRouter further down). */
export function KeyProviderRow({ onClick, pitch, title }: { onClick: () => void; pitch: string; title: string }) {
  return (
    <RowButton className={PROVIDER_ROW_CLASS} onClick={onClick}>
      <div className="min-w-0">
        <span className="text-[length:var(--conversation-text-font-size)] font-semibold">{title}</span>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{pitch}</p>
      </div>
      <ChevronRight className="size-4 text-muted-foreground transition group-hover:text-foreground" />
    </RowButton>
  )
}

export function FireworksProviderRow({ onClick }: { onClick: () => void }) {
  const { t } = useI18n()

  return <KeyProviderRow onClick={onClick} pitch={t.onboarding.fireworksPitch} title="Fireworks AI" />
}

/** Onboarding row for the managed local runtime: no account, no key — the
 *  destination is the Local Models pane where install/download live. */
export function LocalModelsProviderRow({ onClick }: { onClick: () => void }) {
  const { t } = useI18n()

  return (
    <KeyProviderRow onClick={onClick} pitch={t.onboarding.localModelsPitch} title={t.onboarding.localModelsTitle} />
  )
}

export function OpenRouterProviderRow({ onClick }: { onClick: () => void }) {
  const { t } = useI18n()

  return <KeyProviderRow onClick={onClick} pitch={t.onboarding.openRouterPitch} title="OpenRouter" />
}
