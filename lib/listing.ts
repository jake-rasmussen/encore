import { z } from 'zod'

export const CONDITIONS = [
  'New',
  'New with defects',
  'Open box',
  'Used - Like New',
  'Used - Good',
  'Used - Fair',
  'For parts or not working',
] as const

export type Condition = (typeof CONDITIONS)[number]

export const listingDraftSchema = z.object({
  isSellableProduct: z
    .boolean()
    .describe('True only if the frames/audio clearly show a specific physical product being sold.'),
  rejectionReason: z
    .string()
    .nullable()
    .describe('If not a sellable product, one short sentence explaining why. Otherwise null.'),
  title: z
    .string()
    .describe('eBay-style listing title, at most 80 characters, keyword-rich, no emojis.'),
  category: z.string().describe('Best-guess eBay category path, e.g. "Cameras & Photo > Film Cameras".'),
  condition: z.enum(CONDITIONS).describe('Item condition inferred from what is seen and said.'),
  brand: z.string().nullable().describe('Brand if visible or stated, otherwise null.'),
  model: z.string().nullable().describe('Model/name if visible or stated, otherwise null.'),
  keyFeatures: z
    .array(z.string())
    .describe('3-6 short selling points grounded in what is visible or spoken.'),
  description: z
    .string()
    .describe('2-4 sentence buyer-facing description. Only claim what is seen or heard.'),
  itemSpecifics: z
    .array(z.object({ name: z.string(), value: z.string() }))
    .describe('Structured item specifics such as Type, Color, Material, Size.'),
  suggestedPrice: z.object({
    low: z.number(),
    high: z.number(),
    currency: z.string().describe('ISO currency code, e.g. USD.'),
  }),
  confidence: z
    .enum(['high', 'medium', 'low'])
    .describe('How confident the model is about the identification overall.'),
})

export type ListingDraft = z.infer<typeof listingDraftSchema>

export type ListingSource = 'ai' | 'sample'

export type GenerateListingResponse = {
  source: ListingSource
  /** Present when we fell back to a sample draft (e.g. AI not reachable). */
  notice?: string
  draft: ListingDraft
}

/**
 * Deterministic sample used whenever the AI Gateway is unreachable (e.g. no
 * OIDC token in a local sandbox). Keeps the whole flow demoable end to end.
 * Mirrors the bundled demo product frame so the mock stays coherent.
 */
export function sampleDraft(transcript?: string): ListingDraft {
  const heard = (transcript ?? '').trim()
  const spokenNote = heard
    ? ` The seller mentioned on stream: "${heard.slice(0, 220)}${heard.length > 220 ? '…' : ''}"`
    : ''

  return {
    isSellableProduct: true,
    rejectionReason: null,
    title: 'Vintage Polaroid SX-70 Land Camera Folding Instant Film — Tested & Working',
    category: 'Cameras & Photo > Vintage Movie & Photography > Vintage Cameras',
    condition: 'Used - Good',
    brand: 'Polaroid',
    model: 'SX-70',
    keyFeatures: [
      'Iconic folding SLR body in brown leather & brushed chrome',
      'Uses SX-70 / 600-type instant film',
      'Fully manual focus with classic optical viewfinder',
      'Tested and confirmed working on stream',
    ],
    description:
      'Classic Polaroid SX-70 folding instant camera in good vintage condition with light cosmetic wear consistent with age.' +
      ' A collector favorite that still produces charming instant prints.' +
      spokenNote,
    itemSpecifics: [
      { name: 'Type', value: 'Instant Film Camera' },
      { name: 'Brand', value: 'Polaroid' },
      { name: 'Model', value: 'SX-70' },
      { name: 'Color', value: 'Brown / Chrome' },
      { name: 'Film Format', value: 'SX-70 Instant' },
    ],
    suggestedPrice: { low: 120, high: 185, currency: 'USD' },
    confidence: 'medium',
  }
}

export const DEMO_TRANSCRIPT =
  "Alright everyone, check this out — this is a vintage Polaroid SX-70 Land Camera. " +
  "It's the original folding model with the real leather and chrome finish. I just tested it and it fires perfectly, " +
  "the bellows are light-tight, no cracks. Takes SX-70 film. There's a little wear on the corners but honestly it " +
  "looks amazing for its age. This is a collector's piece, who wants it?"
