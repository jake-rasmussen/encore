import { type NextRequest, NextResponse } from 'next/server'
import { type GenerateListingResponse, sampleDraft } from '@/lib/listing'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  let transcript = ''
  try {
    const body = (await req.json()) as { frames?: string[]; transcript?: string }
    transcript = (body.transcript ?? '').trim()
  } catch {
    // ignore malformed body — the POC returns the fixed product regardless
  }

  // POC: this demo always presents the same hard-coded product (the Guess
  // black cotton jacket) so the listing draft is deterministic when published,
  // instead of running live vision that may not detect a product in the frame.
  const response: GenerateListingResponse = { source: 'ai', draft: sampleDraft(transcript) }
  return NextResponse.json(response)
}
