import { cn } from '@/lib/utils'

// Thoth brand mark: a waxing crescent (Thoth is the lunar god) in the app-icon
// squircle, rendered inline so it follows the tokens — squircle on
// --ui-bg-editor, glyph on --ui-text-primary, the same light/dark pairing the
// old PNGs hard-coded. No image pipeline: size via className (default size-14).
export function BrandMark({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span className={cn('inline-flex size-14 shrink-0 items-center justify-center', className)} {...props}>
      <svg aria-hidden className="size-full" focusable="false" viewBox="0 0 64 64">
        <rect fill="var(--ui-bg-editor)" height="64" rx="14" width="64" x="0" y="0" />
        <path
          clipRule="evenodd"
          d="M32 15a17 17 0 1 0 0 34 17 17 0 1 0 0-34zM43 12a20 20 0 1 0 0 40 20 20 0 1 0 0-40z"
          fill="var(--ui-text-primary)"
          fillRule="evenodd"
        />
      </svg>
    </span>
  )
}
