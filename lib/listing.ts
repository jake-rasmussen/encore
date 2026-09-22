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
    title: "Guess Women's Black Cotton Jacket Sherpa-Lined Full-Zip Medium — Pre-Owned",
    category: "Clothing, Shoes & Accessories > Women > Women's Clothing > Coats, Jackets & Vests",
    condition: 'Used - Good',
    brand: 'Guess',
    model: null,
    keyFeatures: [
      'Sherpa fleece-lined collar for warmth',
      'Full-zip front with snap-button placket',
      'Snap chest pocket plus front hand pockets',
      '100% cotton, size Medium',
    ],
    description:
      'Pre-owned Guess black jacket in 100% cotton, size Medium.' +
      ' Full-zip front with a snap placket, a snap chest pocket, and a cozy sherpa fleece-lined collar.' +
      ' In good used condition with only light wear consistent with normal use.' +
      spokenNote,
    itemSpecifics: [
      { name: 'Type', value: 'Jacket' },
      { name: 'Brand', value: 'Guess' },
      { name: 'Department', value: 'Women' },
      { name: 'Size', value: 'M (Medium)' },
      { name: 'Material', value: '100% Cotton' },
      { name: 'Color', value: 'Black' },
    ],
    suggestedPrice: { low: 20, high: 20, currency: 'USD' },
    confidence: 'medium',
  }
}

export const DEMO_TRANSCRIPT =
  "Okay next up I've got this Guess black jacket, this one is a really nice piece. " +
  "It's a women's medium, one hundred percent cotton, and it's got that soft sherpa fleece lining right along the collar. " +
  'Full zip up the front with the snap buttons over it, a little snap pocket on the chest and pockets on the sides. ' +
  "It's pre-owned but honestly in great shape, just a little bit of wear. I'm letting this one go for twenty dollars, who wants it?"
