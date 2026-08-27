/**
 * Shared Groq config for the two AI features: "Polish with AI" (app/api/polish-comment)
 * and the Inspector Summary (app/api/generate-summary).
 *
 * Groq hosts open models and RETIRES them on a rolling schedule. Both routes used
 * to pin `llama-3.3-70b-versatile` independently; when Groq decommissioned it, every
 * AI call started failing with HTTP 404 `model_not_found` and the UI just showed
 * "Could not polish the note." The model lives here now so the next retirement is a
 * one-line fix instead of a hunt through the API routes.
 *
 * When these routes start 404ing again, list what the key can actually reach:
 *   curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"
 * then set GROQ_MODEL (or update the default below) to one of those ids.
 */
export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
export const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

// gpt-oss is a REASONING model, unlike the llama model it replaced. Left alone it
// spends most of the token budget thinking, and the thinking comes back alongside
// the answer — so a tight max_tokens can return an empty `content` with
// finish_reason "length". "hidden" keeps the reasoning out of the response and
// "low" keeps it short; tidying an inspector's spelling needs no deliberation.
//
// These two keys are NOT universally accepted — Groq rejects them outright with a
// 400 on non-reasoning models (e.g. allam-2-7b), and qwen only accepts
// none/default for reasoning_effort. GROQ_MODEL is a documented override, so only
// send them to the family that supports them.
export function reasoningParams(model: string): Record<string, string> {
  return model.startsWith('openai/gpt-oss')
    ? { reasoning_format: 'hidden', reasoning_effort: 'low' }
    : {}
}

/**
 * Safety net for reasoning models that inline their thinking into the message
 * content instead of a separate field (qwen does this, and it can't be turned off
 * via reasoning_format). Without this, pinning GROQ_MODEL to such a model would
 * paste a wall of "Here's a thinking process..." into a customer-facing report.
 *
 * An unterminated <think> means the reply was cut off mid-thought and there is no
 * answer to salvage — return empty and let the caller surface its normal error.
 */
export function stripReasoning(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    .trim()
}
