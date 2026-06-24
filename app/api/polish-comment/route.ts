import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth'

// Reads cookies (for auth) and calls an external API — must run on Node and never
// be cached.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// A short text rewrite returns in ~1s on Groq; cap generously but well under any limit.
export const maxDuration = 30

// Groq's OpenAI-compatible chat endpoint. `llama-3.3-70b-versatile` is a strong,
// fast instruction-follower on the free tier. NOT a reasoning model, so it emits
// the answer directly (no <think> tokens to strip). Pin a different free model via
// GROQ_MODEL (e.g. openai/gpt-oss-120b) if you prefer.
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'

// Inspector notes are short; reject anything implausibly large rather than burn
// quota on it.
const MAX_INPUT_CHARS = 5000

// The whole point of the feature: tidy the English WITHOUT changing what was
// observed. The rules below are deliberately strict — on an inspection report,
// inventing or inflating a fault is a liability, not a nicety.
const SYSTEM_INSTRUCTION = `You are an editor for a UK vehicle inspection company (Crescent Car Check). An inspector has written a rough note about a car during an inspection. Rewrite it in clear, professional British English suitable for a customer-facing inspection report.

STRICT RULES:
- Fix spelling, grammar, punctuation and capitalisation.
- Keep the EXACT same meaning and every fact. Do not add, remove, exaggerate or downplay anything.
- Do NOT invent details, severity, causes, locations, measurements or recommendations that are not in the original note.
- Keep it concise and factual — roughly the same length as the original, usually one or two short sentences.
- Use UK spelling and motoring terms (e.g. "tyre", "bumper", "colour", "wheel arch").
- If the note is already clear and professional, return it essentially unchanged.
- Return ONLY the rewritten note. No quotes, no preamble, no explanation, no markdown.`

export async function POST(req: NextRequest) {
  // Gate the endpoint behind a signed-in session so the API key / free-tier quota
  // can't be drained by anonymous callers. Return JSON 401 (not requireUser()'s
  // redirect) so the client fetch gets a clean error instead of a login page.
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    // Misconfiguration, not a user error — log it, but tell the client plainly.
    console.error('[polish-comment] GROQ_API_KEY is not set')
    return NextResponse.json(
      { error: 'AI polishing is not configured yet.' },
      { status: 503 },
    )
  }

  let text: unknown
  try {
    ;({ text } = await req.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  if (typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: 'Nothing to polish.' }, { status: 400 })
  }
  if (text.length > MAX_INPUT_CHARS) {
    return NextResponse.json({ error: 'Note is too long to polish.' }, { status: 400 })
  }

  // Don't let a slow/hung upstream hold the function open to its full budget.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)

  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: GROQ_MODEL,
        // Low temperature: we want a faithful clean-up, not a creative rewrite.
        temperature: 0.2,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          { role: 'user', content: text },
        ],
      }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('[polish-comment] Groq error', res.status, detail.slice(0, 500))
      // 429 = free-tier rate limit; surface a friendlier hint for that case.
      const error =
        res.status === 429
          ? 'AI is busy right now — please try again in a moment.'
          : 'Could not polish the note. Please try again.'
      return NextResponse.json({ error }, { status: 502 })
    }

    const data = await res.json()
    const polished = (data?.choices?.[0]?.message?.content ?? '').trim()

    if (!polished) {
      console.error(
        '[polish-comment] empty completion',
        data?.choices?.[0]?.finish_reason ?? 'unknown',
      )
      return NextResponse.json(
        { error: 'Could not polish the note. Please edit it manually.' },
        { status: 502 },
      )
    }

    return NextResponse.json({ text: polished })
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    console.error('[polish-comment] request failed', err)
    return NextResponse.json(
      { error: aborted ? 'AI timed out — please try again.' : 'Could not reach the AI service.' },
      { status: 504 },
    )
  } finally {
    clearTimeout(timeout)
  }
}
