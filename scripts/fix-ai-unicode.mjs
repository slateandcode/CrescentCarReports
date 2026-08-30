#!/usr/bin/env node
/**
 * One-off cleanup for reports saved while the gpt-oss model was emitting exotic
 * Unicode (non-breaking hyphens etc.) that the report font renders as black
 * "tofu" boxes. New AI output is sanitized at the API routes (sanitizeModelText
 * in lib/groq.ts — keep the CHAR maps below in sync with it); this script
 * repairs the rows written before that fix.
 *
 * Touches every field AI text can land in: inspector_summary,
 * price_negotiation_notes, checklist[*][*].comment / .notes, and
 * critical_findings[*].title / .description (auto-derived from comments).
 *
 * Dry-run by default — prints what would change. Pass --apply to write.
 *
 *   node scripts/fix-ai-unicode.mjs           # preview
 *   node scripts/fix-ai-unicode.mjs --apply   # fix
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local
 * (or the environment).
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Minimal .env.local loader — no dotenv dependency in this project.
function loadEnvLocal() {
  let raw
  try {
    raw = readFileSync(resolve(root, '.env.local'), 'utf8')
  } catch {
    return
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim()
  }
}
loadEnvLocal()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local or env).')
  process.exit(1)
}

const APPLY = process.argv.includes('--apply')
const supabase = createClient(url, key, { auth: { persistSession: false } })

// Mirror of sanitizeModelText in lib/groq.ts.
const HYPHENS = /[\u2010\u2011\u2212]/g
const SPACES = /[\u00A0\u2007\u2009\u200A\u202F]/g
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g
const ANY_BAD = /[\u2010\u2011\u2212\u00A0\u2007\u2009\u200A\u202F\u200B-\u200D\u2060\uFEFF]/

function sanitize(text) {
  return text.replace(HYPHENS, '-').replace(SPACES, ' ').replace(ZERO_WIDTH, '')
}

/** Sanitize a string field on `obj`; returns true if it changed. */
function fixField(obj, fieldKey, label, changes) {
  const v = obj[fieldKey]
  if (typeof v !== 'string' || !ANY_BAD.test(v)) return false
  obj[fieldKey] = sanitize(v)
  changes.push(label)
  return true
}

const { data: reports, error } = await supabase
  .from('inspection_reports')
  .select('id, report_reference, inspector_summary, price_negotiation_notes, checklist, critical_findings')
  .order('created_at', { ascending: true })
if (error) {
  console.error('Failed to load reports:', error.message)
  process.exit(1)
}

let touched = 0
for (const report of reports) {
  const changes = []
  const update = {}

  const top = {
    inspector_summary: report.inspector_summary,
    price_negotiation_notes: report.price_negotiation_notes,
  }
  for (const fieldKey of Object.keys(top)) {
    if (fixField(top, fieldKey, fieldKey, changes)) update[fieldKey] = top[fieldKey]
  }

  const checklist = report.checklist ?? {}
  let checklistChanged = false
  for (const [sectionId, items] of Object.entries(checklist)) {
    for (const [itemId, state] of Object.entries(items ?? {})) {
      for (const fieldKey of ['comment', 'notes']) {
        if (fixField(state, fieldKey, `checklist.${sectionId}.${itemId}.${fieldKey}`, changes)) {
          checklistChanged = true
        }
      }
    }
  }
  if (checklistChanged) update.checklist = checklist

  const findings = report.critical_findings ?? []
  let findingsChanged = false
  findings.forEach((f, i) => {
    for (const fieldKey of ['title', 'description']) {
      if (fixField(f, fieldKey, `critical_findings[${i}].${fieldKey}`, changes)) {
        findingsChanged = true
      }
    }
  })
  if (findingsChanged) update.critical_findings = findings

  if (!changes.length) continue
  touched++
  console.log(`${report.report_reference || report.id}:`)
  for (const c of changes) console.log(`  - ${c}`)

  if (APPLY) {
    const { error: upErr } = await supabase.from('inspection_reports').update(update).eq('id', report.id)
    if (upErr) {
      console.error(`  FAILED to update ${report.id}: ${upErr.message}`)
      process.exitCode = 1
    } else {
      console.log('  updated ✓')
    }
  }
}

console.log(
  `\n${touched} of ${reports.length} report(s) ${APPLY ? 'updated' : 'need fixing'}` +
    (APPLY || !touched ? '' : ' — rerun with --apply to write'),
)
