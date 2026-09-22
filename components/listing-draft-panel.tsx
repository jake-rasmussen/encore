'use client'

import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Loader2,
  RefreshCw,
  Sparkles,
  Tag,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CONDITIONS, type ListingDraft, type ListingSource } from '@/lib/listing'

const CONFIDENCE_STYLES: Record<ListingDraft['confidence'], string> = {
  high: 'bg-primary/15 text-primary',
  medium: 'bg-amber-400/15 text-amber-300',
  low: 'bg-live/15 text-live',
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  'w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40'

export function ListingDraftPanel({
  draft,
  source,
  notice,
  confirmed,
  generating,
  onChange,
  onConfirm,
  onRegenerate,
  onDiscard,
}: {
  draft: ListingDraft
  source: ListingSource
  notice?: string
  confirmed: boolean
  generating: boolean
  onChange: (next: ListingDraft) => void
  onConfirm: () => void
  onRegenerate: () => void
  onDiscard: () => void
}) {
  const patch = (partial: Partial<ListingDraft>) => onChange({ ...draft, ...partial })
  const titleOver = draft.title.length > 80

  if (confirmed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Check className="size-7" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-balance">Listing confirmed</h3>
          <p className="mx-auto max-w-xs text-sm text-muted-foreground text-pretty">
            In production this would create the live listing on eBay and pin it to your stream. This POC stops
            at your confirmation.
          </p>
        </div>
        <div className="w-full max-w-xs rounded-lg border border-border bg-background/60 p-3 text-left">
          <p className="text-sm font-medium">{draft.title}</p>
          <p className="mt-1 text-sm text-primary">
            {draft.suggestedPrice.currency} {draft.suggestedPrice.low}–{draft.suggestedPrice.high}
          </p>
        </div>
        <Button variant="outline" onClick={onDiscard} className="mt-2">
          Draft another item
        </Button>
      </div>
    )
  }

  if (!draft.isSellableProduct) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-live/15 text-live">
          <AlertTriangle className="size-7" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">No product detected</h3>
          <p className="mx-auto max-w-xs text-sm text-muted-foreground text-pretty">
            {draft.rejectionReason ?? 'The captured frames did not clearly show a sellable product.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onDiscard}>
            <ChevronLeft className="size-4" /> Back
          </Button>
          <Button onClick={onRegenerate} disabled={generating}>
            {generating ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Try again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Tag className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Listing draft</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${CONFIDENCE_STYLES[draft.confidence]}`}
          >
            {draft.confidence} confidence
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            <Sparkles className="size-3" />
            {source === 'ai' ? 'AI' : 'Sample'}
          </span>
        </div>
      </div>

      {notice ? (
        <p className="border-b border-border bg-amber-400/10 px-4 py-2 text-xs text-amber-300">{notice}</p>
      ) : null}

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <Field label={`Title (${draft.title.length}/80)`}>
          <textarea
            value={draft.title}
            onChange={(e) => patch({ title: e.target.value })}
            rows={2}
            className={`${inputClass} resize-none ${titleOver ? 'border-live focus-visible:border-live' : ''}`}
          />
          {titleOver ? <span className="text-[11px] text-live">Over eBay&apos;s 80-character limit.</span> : null}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand">
            <input
              value={draft.brand ?? ''}
              placeholder="Unbranded"
              onChange={(e) => patch({ brand: e.target.value || null })}
              className={inputClass}
            />
          </Field>
          <Field label="Model">
            <input
              value={draft.model ?? ''}
              placeholder="—"
              onChange={(e) => patch({ model: e.target.value || null })}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Condition">
          <select
            value={draft.condition}
            onChange={(e) => patch({ condition: e.target.value as ListingDraft['condition'] })}
            className={inputClass}
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c} className="bg-card text-foreground">
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Category">
          <input
            value={draft.category}
            onChange={(e) => patch({ category: e.target.value })}
            className={inputClass}
          />
        </Field>

        <div>
          <span className="text-xs font-medium text-muted-foreground">
            Estimated price ({draft.suggestedPrice.currency})
          </span>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="number"
              value={draft.suggestedPrice.low}
              onChange={(e) =>
                patch({ suggestedPrice: { ...draft.suggestedPrice, low: Number(e.target.value) } })
              }
              className={inputClass}
            />
            <span className="text-muted-foreground">–</span>
            <input
              type="number"
              value={draft.suggestedPrice.high}
              onChange={(e) =>
                patch({ suggestedPrice: { ...draft.suggestedPrice, high: Number(e.target.value) } })
              }
              className={inputClass}
            />
          </div>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Rough AI estimate — not verified against sold listings.
          </span>
        </div>

        <Field label="Description">
          <textarea
            value={draft.description}
            onChange={(e) => patch({ description: e.target.value })}
            rows={4}
            className={`${inputClass} resize-none`}
          />
        </Field>

        {draft.keyFeatures.length > 0 ? (
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Key features (AI-suggested)</span>
            <ul className="space-y-1">
              {draft.keyFeatures.map((f, i) => (
                <li key={i} className="flex gap-2 text-sm text-foreground/90">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {draft.itemSpecifics.length > 0 ? (
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Item specifics</span>
            <div className="grid grid-cols-2 gap-1.5">
              {draft.itemSpecifics.map((s, i) => (
                <div key={i} className="rounded-md border border-border bg-background/60 px-2.5 py-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.name}</div>
                  <div className="text-sm">{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t border-border p-3">
        <Button variant="ghost" size="sm" onClick={onDiscard} className="text-muted-foreground">
          Discard
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onRegenerate}
          disabled={generating}
          className="ml-auto"
        >
          {generating ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Regenerate
        </Button>
        <Button size="sm" onClick={onConfirm} disabled={titleOver} className="h-9 px-4">
          <Check className="size-4" /> Confirm listing
        </Button>
      </div>
    </div>
  )
}
