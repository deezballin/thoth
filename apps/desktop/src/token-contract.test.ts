import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Static-analysis guard for the token contract (DESIGN.md — "Stroke & color
// tokens"). Two rules, both source-text scans in the same category as an
// ESLint rule:
//
// 1. No raw color literals in shipped classes — `bg-white`, `text-black`,
//    a raw palette utility (`text-emerald-600`, `bg-amber-500/15`), a hex
//    arbitrary value (`bg-[#c42b1c]`, or buried in a color-mix), or rgb()/
//    rgba() inside an arbitrary value. Colors flow through tokens so skins
//    and dark mode can move them. Fixed-backdrop surfaces that must NOT
//    follow the theme, and sanctioned content palettes (hue = data), are
//    allowlisted below and named as sanctioned literals in DESIGN.md.
// 2. No phantom tokens — every `--ui-*`, `--theme-*`, `--chrome-*`,
//    `--stroke-nous` and `--shadow-nous` reference in shipped code or CSS
//    must resolve to a definition (a stylesheet rule, or a runtime write in
//    `themes/context.tsx`). A reference with no definition compiles fine and
//    silently falls back to `currentColor`/`transparent` — that is how
//    `--ui-danger`, `--ui-border` and `--ui-panel-background` shipped broken.
// 3. Elevation follows the contract (DESIGN.md — "Surfaces & elevation"):
//    floating panels wear the `shadow-nous` + `border-(--stroke-nous)` pair,
//    every menu/popup list paints through `menu.ts`'s `menuSurfaceClass`,
//    and `shadow-xl`/`shadow-2xl` one-offs stay out of surface chrome.
//
// This is a source-text scan, not a behavior test.

const SRC_DIR = resolve(__dirname)

/** Fixed-backdrop surfaces exempt from rule 1 (paths relative to src/). */
const RAW_COLOR_ALLOWLIST = new Set([
  // Windows caption-button chrome — must match the OS, not the theme.
  'app/shell/wslg-window-controls.tsx',
  // Media-hero status footer — white-alpha chrome over a fixed black scrim.
  'plugins/hermes-bots/screen-hero.tsx',
  // Sanctioned content palettes (hue = data, not status) — named in DESIGN.md.
  // The terminal's 16-color table, GFM alert tones, reaction accents, rendered
  // markdown previews, and the screen-share panes' fixed-contrast chrome.
  'lib/ansi.ts',
  'components/assistant-ui/embeds/alert.tsx',
  'components/assistant-ui/thread/message-reactions.tsx',
  'app/chat/right-rail/preview-file.tsx',
  'plugins/hermes-bots/screen-pane.tsx',
  'plugins/hermes-bots/screen-portal.tsx',
  'plugins/hermes-bots/screen-install.tsx'
])

/** Class-literal colors DESIGN.md forbids. */
const RAW_COLOR_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'bg-white', pattern: /\bbg-white\b/gu },
  { label: 'text-black', pattern: /\btext-black\b/gu },
  // Raw palette utilities (`text-emerald-600`, `bg-amber-500/15`,
  // `border-gray-300`) — status hues flow through --ui-success/warning/
  // danger/info, chrome hues through the surface tokens. Sanctioned content
  // palettes live in the allowlist above.
  {
    label: 'raw palette utility',
    pattern:
      /\b(?:bg|text|border|ring)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|zinc|neutral|stone|gray)-\d{1,3}/gu
  },
  { label: 'hex arbitrary value', pattern: /-\[[^\]]*#[0-9a-fA-F]/gu },
  // rgb()/rgba() hidden inside an arbitrary value (shadow-[...rgba(0,0,0,.4)],
  // bg-[radial-gradient(...rgba(...))]) — the hole the inset-bevel shadows
  // shipped through. Scoped to bracket values, so JSX style props and CSS
  // files stay outside this rule's remit.
  { label: 'rgb()/rgba() in an arbitrary value', pattern: /-\[[^\]]*rgba?\(/gu }
]

/** The token families DESIGN.md defines: `--ui-*`, `--theme-*`, `--chrome-*`,
 *  plus the two standalone names. Matched anywhere in shipped source. */
const TOKEN_FAMILY = /--(?:ui-|theme-|chrome-)[a-z][a-z0-9-]*|--stroke-nous|--shadow-nous/gu

/** `--name:` declarations in a stylesheet. */
const CSS_DECLARATION = /(--[a-z][a-z0-9-]*):/gu

/** Runtime writes: object keys (`'--theme-primary': c.primary`) and setters
 *  (`setPersistentCssVar('--ui-success', …)`, `style.setProperty(…)`). */
const RUNTIME_WRITE =
  /['"](--[a-z][a-z0-9-]*)['"]\s*:|set(?:PersistentCssVar|Property)\(\s*['"](--[a-z][a-z0-9-]*)['"]/gu

// Recursively walk a directory and collect all shipped .ts/.tsx/.css paths.
function collectShippedFiles(dir: string): string[] {
  const results: string[] = []

  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '__tests__') {
      continue
    }

    const fullPath = join(dir, entry)

    if (statSync(fullPath).isDirectory()) {
      results.push(...collectShippedFiles(fullPath))
    } else if (/\.(?:ts|tsx|css)$/u.test(entry) && !entry.includes('.test.')) {
      results.push(fullPath)
    }
  }

  return results
}

function toPosix(path: string): string {
  return path.split('\\').join('/')
}

function findAll(content: string, pattern: RegExp): RegExpExecArray[] {
  pattern.lastIndex = 0

  return [...content.matchAll(pattern)]
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split('\n').length
}

/** Rule 1 — raw color literals in class strings, minus the sanctioned set. */
function rawColorViolations(content: string, relativePath: string): string[] {
  if (RAW_COLOR_ALLOWLIST.has(relativePath)) {
    return []
  }

  const violations: string[] = []

  for (const { label, pattern } of RAW_COLOR_PATTERNS) {
    for (const match of findAll(content, pattern)) {
      violations.push(`${relativePath}:${lineOf(content, match.index ?? 0)} — ${label} (\`${match[0]}\`)`)
    }
  }

  return violations
}

/** Rule 2 — every token-family reference must resolve to a definition. */
function phantomTokenViolations(files: Array<{ path: string; content: string }>): string[] {
  const defined = new Set<string>()
  const references: Array<{ name: string; path: string; line: number }> = []

  for (const file of files) {
    const defPatterns = file.path.endsWith('.css') ? [CSS_DECLARATION] : [RUNTIME_WRITE]

    for (const defPattern of defPatterns) {
      for (const match of findAll(file.content, defPattern)) {
        const name = match[1] ?? match[2]

        if (name) {
          defined.add(name)
        }
      }
    }

    for (const match of findAll(file.content, TOKEN_FAMILY)) {
      references.push({ name: match[0], path: file.path, line: lineOf(file.content, match.index ?? 0) })
    }
  }

  const missing = new Map<string, { path: string; line: number; count: number }>()

  for (const reference of references) {
    if (defined.has(reference.name)) {
      continue
    }

    const seen = missing.get(reference.name)

    if (seen) {
      seen.count += 1
    } else {
      missing.set(reference.name, { path: reference.path, line: reference.line, count: 1 })
    }
  }

  return [...missing].map(
    ([name, at]) =>
      `${name} — referenced at ${at.path}:${at.line}${at.count > 1 ? ` (+${at.count - 1} more)` : ''}, never defined`
  )
}

const SRC_FILES = collectShippedFiles(SRC_DIR).map(path => ({
  path: toPosix(relative(SRC_DIR, path)),
  content: readFileSync(path, 'utf-8')
}))

describe('token contract', () => {
  it('flags raw color utilities and spares the sanctioned set', () => {
    expect(rawColorViolations('<div className="bg-white" />', 'a.tsx')).toHaveLength(1)
    expect(
      rawColorViolations('<div className="hover:bg-white/10 text-black border-gray-300 bg-[#c42b1c]" />', 'a.tsx')
    ).toHaveLength(4)
    expect(
      rawColorViolations('<div className="text-emerald-600 dark:bg-amber-500/15 ring-red-500" />', 'a.tsx')
    ).toHaveLength(3)
    expect(rawColorViolations('<div className="bg-(--ui-bg-card) hover:text-(--ui-red)" />', 'a.tsx')).toEqual([])
    expect(rawColorViolations('<div className="text-emerald-600" />', 'lib/ansi.ts')).toEqual([])
    expect(rawColorViolations('<div className="bg-white" />', 'app/shell/wslg-window-controls.tsx')).toEqual([])
  })

  it('spot-checks the phantom-token detector', () => {
    const files = [
      { path: 'styles.css', content: ':root { --ui-good: #fff; }' },
      { path: 'a.tsx', content: 'color: var(--ui-good); background: var(--ui-phantom);' }
    ]

    expect(phantomTokenViolations(files)).toEqual(['--ui-phantom — referenced at a.tsx:1, never defined'])
  })

  it('ships no raw color literals outside the sanctioned set', () => {
    const violations: string[] = []

    for (const file of SRC_FILES) {
      if (file.path.endsWith('.css')) {
        continue
      }

      violations.push(...rawColorViolations(file.content, file.path))
    }

    expect(violations, violations.join('\n')).toEqual([])
  })

  it('defines every token family reference', () => {
    const violations = phantomTokenViolations(SRC_FILES)
    expect(violations, violations.join('\n')).toEqual([])
  })
})

/** Floating panels DESIGN.md names as `shadow-nous` + `border-(--stroke-nous)`
 *  wearers, pinned so a redesign can't quietly reintroduce one-off chrome. */
const NOUS_PAIR_FILES = [
  // Base Dialog — the primitive every dialog composes.
  'components/ui/dialog.tsx',
  // Route overlays (settings, command-center, agents, cron, profiles, …).
  'app/overlays/overlay-view.tsx',
  // Floating cmdk pickers that build their own DialogPrimitive box.
  'components/session-picker.tsx',
  // Session switcher / floating panes / command palette chrome.
  'app/floating-hud.ts'
]

/** The exact `menu.ts` list fill. If it appears anywhere else, a list is
 *  painting itself instead of importing `menuSurfaceClass`. */
const MENU_SURFACE_FILL = 'bg-[color-mix(in_srgb,var(--ui-bg-elevated)_96%,transparent)]'

/** Content imagery where a heavy drop shadow IS the affordance (lightbox). */
const SHADOW_ONEOFF_ALLOWLIST = new Set(['components/chat/zoomable-image.tsx'])

describe('surface elevation contract', () => {
  const shipped = (relative: string) => {
    const file = SRC_FILES.find(f => f.path === relative)
    expect(file, `${relative} must exist in the shipped-source scan`).toBeDefined()

    return file!.content
  }

  it('keeps named floating panels on the nous pair', () => {
    for (const relative of NOUS_PAIR_FILES) {
      const content = shipped(relative)
      expect(content, `${relative} must wear shadow-nous`).toContain('shadow-nous')
      expect(content, `${relative} must wear border-(--stroke-nous)`).toContain('border-(--stroke-nous)')
      expect(content, `${relative} must not carry a per-overlay shadow one-off`).not.toMatch(/shadow-(?:lg|xl|2xl)\b/u)
      expect(content, `${relative} must not swap the overlay hairline for stroke-secondary`).not.toContain(
        'border border-(--ui-stroke-secondary)'
      )
    }
  })

  it('paints every menu list through menu.ts', () => {
    const offenders = SRC_FILES.filter(
      file =>
        !file.path.endsWith('.test.ts') && !file.path.endsWith('.test.tsx') && file.path !== 'components/ui/menu.ts'
    )
      .filter(file => file.content.includes(MENU_SURFACE_FILL))
      .map(file => file.path)

    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('ships no shadow-xl/shadow-2xl chrome outside the sanctioned set', () => {
    const offenders = SRC_FILES.filter(file => !file.path.endsWith('.test.ts') && !file.path.endsWith('.test.tsx'))
      .filter(file => !SHADOW_ONEOFF_ALLOWLIST.has(file.path))
      .filter(file => file.content.includes('shadow-2xl') || file.content.includes('shadow-xl'))
      .map(file => file.path)

    expect(offenders, offenders.join('\n')).toEqual([])
  })
})
