import type { FC, ReactNode } from 'react'
import { useMemo } from 'react'

import { type Contribution, useContributions } from '@/contrib'
import { ContribBoundary, ContribRender } from '@/contrib/react/boundary'
import { parseTranscriptDirective, TRANSCRIPT_DIRECTIVE_AREA, type TranscriptDirectiveContribution } from '@/lib/transcript-directives'

/**
 * The transcript's directive slot. Given text, renders the plugin component
 * for every claimed `::name{...}` in it, in order — several, because models
 * merge lines under formatting pressure. Nothing renders for a name no plugin
 * claimed; that text stays the prose it always was.
 *
 * Resolution is registry-backed (`transcript.directives`), so hot-loading a
 * plugin upgrades already-rendered paragraphs in place, exactly like every
 * other contribution area.
 */

/** Extract the paragraph's text when it is text-only — directives never carry
 *  inline markup, so any non-string child disqualifies the paragraph. */
export function paragraphPlainText(children: ReactNode): string | null {
  if (typeof children === 'string') {
    return children
  }

  if (Array.isArray(children) && children.length > 0 && children.every(child => typeof child === 'string')) {
    return children.join('')
  }

  return null
}

/** The contribution claiming `name`, if any. First registration wins. */
function claimFor(contributions: readonly Contribution[], name: string) {
  return contributions.find(c => (c.data as TranscriptDirectiveContribution | undefined)?.name === name)
}

export const TranscriptDirectiveLeaf: FC<{ text: string; streaming?: boolean }> = ({ text, streaming }) => {
  const contributions = useContributions(TRANSCRIPT_DIRECTIVE_AREA)

  const parsed = useMemo(() => parseTranscriptDirective(text), [text])
  const match = parsed ? claimFor(contributions, parsed.name) : undefined
  // SAFETY: claimFor resolved this entry from the directive area by its registered name.
  const render = (match?.data as TranscriptDirectiveContribution | undefined)?.render

  // Stable component identity for ContribRender (which mounts this AS a
  // component): a fresh closure per render would remount the widget on
  // every parent render.
  const renderLeaf = useMemo(
    () =>
      render && parsed
        ? () => render({ attrs: parsed.attrs, source: parsed.source, streaming: streaming ?? false })
        : null,
    [render, parsed, streaming]
  )

  if (!match || !renderLeaf) {
    return null
  }

  return (
    <ContribBoundary id={match.id} variant="chip">
      <ContribRender render={renderLeaf} />
    </ContribBoundary>
  )
}

/** A paragraph resolved against the registry: the prose to keep as prose, and
 *  the claimed directives to render as cards, in the order they were written. */
export type ResolvedParagraphSegment = { kind: 'prose'; text: string } | { kind: 'directive'; source: string }

/**
 * How a paragraph should render. Null means "as the plain `<p>` it always
 * was" — no directive in it, or none that anyone registered.
 *
 * A directive nobody claimed is folded back into the prose around it, which is
 * what keeps this from taking text away from the reader: the only thing that
 * can be lifted out of a sentence is markup a plugin is standing by to draw.
 */
export function useResolvedParagraph(text: string | null): ResolvedParagraphSegment[] | null {
  const contributions = useContributions(TRANSCRIPT_DIRECTIVE_AREA)

  return useMemo(() => {
    const parsed = text === null ? null : parseTranscriptDirective(text)

    return parsed && claimFor(contributions, parsed.name) ? [{ kind: 'directive', source: parsed.source }] : null
  }, [contributions, text])
}
