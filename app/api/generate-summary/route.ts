import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { IS_DEMO } from '@/lib/env'
import { getTemplate } from '@/lib/report-templates'
import {
  itemStatus,
  itemComment,
  overallScore,
  recommendationFromScore,
  normalizeRecommendation,
  vehicleTitle,
  RECOMMENDATION_LABEL,
  STATUS_LABEL,
} from '@/lib/report-utils'
import { PAINT_SECTION_ID, PAINT_PANELS, PAINT_LABEL } from '@/lib/issues'
import type { InspectionReport } from '@/lib/report-types'

// Reads cookies (auth), fetches the report and calls an external API — Node only,
// never cached.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// A short summary returns in a few seconds on Groq; cap generously but under any limit.
export const maxDuration = 30

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'

// The brief's Inspector Summary prompt (item 10): faithful, buyer-facing, grounded
// only in the report data. Strict no-fabrication rules — on an inspection report,
// inventing a fault is a liability.
const SYSTEM_INSTRUCTION = `You are writing the final Inspector Summary for a professional used-car inspection report (Crescent Car Check). Use ONLY the inspection data provided. Write a clear, objective summary for the buyer.

RULES:
- Do NOT invent any faults, measurements, causes or recommendations that are not in the data.
- 2–3 short paragraphs, around 200–300 words maximum.
- Start with one sentence summarising the overall condition of the vehicle (e.g. "Overall, the car is in fair condition, but several issues were found that should be considered before purchase.").
- Focus on the most important findings first — especially major faults, safety, accident/flood/rust, mechanical issues, diagnostic faults, leaks, underbody concerns, odometer concerns and test-drive issues.
- Explain findings in simple language a normal car buyer can understand.
- End with a clear conclusion that supports the final recommendation: Buy, Negotiate, or Avoid.
- Tone: professional, balanced, direct and easy to understand. Use UK spelling and motoring terms (tyre, bumper, colour).
- Return ONLY the summary text — no headings, preamble, bullet points or markdown.`

const MAX_INPUT_CHARS = 16000

/** Compact, model-friendly digest of everything the summary may draw on. */
function buildDigest(report: InspectionReport): string {
  const lines: string[] = []
  lines.push(`Vehicle: ${vehicleTitle(report)}`)
  if (report.odometer) lines.push(`Odometer: ${report.odometer}`)
  const specs = [report.transmission, report.fuel_type, report.engine_size, report.regional_specs]
    .filter((s) => s && s.trim())
    .join(', ')
  if (specs) lines.push(`Specs: ${specs}`)

  const template = getTemplate(report.package_type)
  lines.push(`Inspection package: ${template.name}`)

  const score = overallScore(report.package_type, report.checklist)
  if (score != null) lines.push(`Crescent Score: ${score}/100`)
  const chosen = normalizeRecommendation(report.buyer_recommendation)
  const suggested = recommendationFromScore(score)
  const rec = chosen ?? suggested
  if (rec) lines.push(`Final recommendation: ${RECOMMENDATION_LABEL[rec]}`)

  const issues: string[] = []
  for (const section of template.sections) {
    const state = report.checklist?.[section.id] || {}
    for (const item of section.items) {
      const status = itemStatus(state[item.id])
      if (status === 'minor' || status === 'major') {
        const comment = itemComment(state[item.id])
        issues.push(`- [${STATUS_LABEL[status]}] ${section.title} → ${item.title}${comment ? `: ${comment}` : ''}`)
      }
    }
  }

  // Non-original paint panels (the exterior paint map is stored separately).
  const paint = report.checklist?.[PAINT_SECTION_ID] || {}
  const repainted = PAINT_PANELS.map((p) => ({ p, cond: paint[p.id]?.paint }))
    .filter((x) => x.cond && x.cond !== 'original')
  if (repainted.length) {
    issues.push(
      `- [Paint] Non-original panels: ${repainted.map((x) => `${x.p.label} (${PAINT_LABEL[x.cond!]})`).join(', ')}`,
    )
  }

  lines.push('')
  if (issues.length) {
    lines.push('Findings (issues recorded):')
    lines.push(...issues)
  } else {
    lines.push('Findings: no issues were recorded — all checks passed.')
  }
  return lines.join('\n').slice(0, MAX_INPUT_CHARS)
}

async function loadReport(id: string): Promise<InspectionReport | null> {
  if (IS_DEMO) {
    const { demoGetReport } = await import('@/lib/demo')
    return demoGetReport(id)
  }
  const supabase = await createClient()
  const { data } = await supabase.from('inspection_reports').select('*').eq('id', id).maybeSingle()
  return (data as InspectionReport) ?? null
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    console.error('[generate-summary] GROQ_API_KEY is not set')
    return NextResponse.json({ error: 'AI summary is not configured yet.' }, { status: 503 })
  }

  let reportId: unknown
  try {
    ;({ reportId } = await req.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  if (typeof reportId !== 'string' || !reportId.trim()) {
    return NextResponse.json({ error: 'Missing report id.' }, { status: 400 })
  }

  const report = await loadReport(reportId)
  if (!report) {
    return NextResponse.json({ error: 'Report not found or access denied.' }, { status: 404 })
  }

  const digest = buildDigest(report)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25_000)
  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.4,
        max_tokens: 700,
        messages: [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          { role: 'user', content: digest },
        ],
      }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error('[generate-summary] Groq error', res.status, detail.slice(0, 500))
      const error =
        res.status === 429
          ? 'AI is busy right now — please try again in a moment.'
          : 'Could not generate the summary. Please try again.'
      return NextResponse.json({ error }, { status: 502 })
    }

    const data = await res.json()
    const text = (data?.choices?.[0]?.message?.content ?? '').trim()
    if (!text) {
      console.error('[generate-summary] empty completion', data?.choices?.[0]?.finish_reason ?? 'unknown')
      return NextResponse.json(
        { error: 'Could not generate the summary. Please write it manually.' },
        { status: 502 },
      )
    }
    return NextResponse.json({ text })
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    console.error('[generate-summary] request failed', err)
    return NextResponse.json(
      { error: aborted ? 'AI timed out — please try again.' : 'Could not reach the AI service.' },
      { status: 504 },
    )
  } finally {
    clearTimeout(timeout)
  }
}
