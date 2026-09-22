import { generateText, Output } from 'ai'
import { type NextRequest, NextResponse } from 'next/server'
import {
  type GenerateListingResponse,
  listingDraftSchema,
  sampleDraft,
} from '@/lib/listing'

export const maxDuration = 60

const MODEL = 'google/gemini-3.8-flash'

const SYSTEM_PROMPT = `You are eBay Live's listing assistant. During a live selling stream you receive
still frames captured from the seller's camera plus a transcript of what the seller said about the item.
Produce a single, accurate, ready-to-review eBay listing draft for the product being shown.

Rules:
- Identify the product primarily from the frames; use the transcript to fill in brand, model, condition, and details.
- Only claim what is actually visible in the frames or stated in the transcript. Never invent specs, flaws, or accessories.
- If brand or model is unknown, set it to null rather than guessing.
- The title must be <= 80 characters, keyword-first, no emojis, no ALL CAPS.
- Choose the closest condition from the allowed set based on visible wear and what the seller says.
- suggestedPrice is a rough estimated asking range (not verified sold comps); pick a sensible range.
- If the frames/transcript do not clearly show a specific sellable physical product, set isSellableProduct to false
  and give a short rejectionReason.`

export async function POST(req: NextRequest) {
  let transcript = ''
  try {
    const body = (await req.json()) as { frames?: string[]; transcript?: string }
    transcript = (body.transcript ?? '').trim()
    const frames = (body.frames ?? []).filter((f) => typeof f === 'string' && f.startsWith('data:')).slice(0, 4)

    if (frames.length === 0 && !transcript) {
      return NextResponse.json(
        { error: 'Provide at least one captured frame or some transcript.' },
        { status: 400 },
      )
    }

    const userContent: Array<
      { type: 'text'; text: string } | { type: 'image'; image: string; mediaType: string }
    > = [
      {
        type: 'text',
        text:
          `Seller's spoken transcript during the stream:\n"""${transcript || '(no audio captured)'}"""\n\n` +
          `${frames.length} frame(s) captured from the live stream are attached. ` +
          `Generate the eBay listing draft for the product shown.`,
      },
    ]
    for (const frame of frames) {
      userContent.push({ type: 'image', image: frame, mediaType: 'image/jpeg' })
    }

    const { output } = await generateText({
      model: MODEL,
      system: SYSTEM_PROMPT,
      output: Output.object({ schema: listingDraftSchema }),
      messages: [{ role: 'user', content: userContent }],
    })

    const response: GenerateListingResponse = { source: 'ai', draft: output }
    return NextResponse.json(response)
  } catch (err) {
    // AI Gateway is unauthenticated in local sandboxes (no OIDC token). Rather
    // than break the demo, fall back to a coherent sample draft.
    console.log('[v0] generate-listing falling back to sample:', (err as Error)?.message)
    const response: GenerateListingResponse = {
      source: 'sample',
      notice:
        'Showing a sample listing — the AI model was not reachable in this environment. Deploy on Vercel for live AI generation.',
      draft: sampleDraft(transcript),
    }
    return NextResponse.json(response)
  }
}
