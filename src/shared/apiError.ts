/**
 * An API error is not an answer.
 *
 * When a turn fails before the model says anything — a lapsed login, a usage
 * limit, a 5xx — the CLI does not put it on stderr. It writes an `assistant`
 * line with model `<synthetic>` whose text is the error sentence, flagged
 * `is_api_error_message` on the stream and `isApiErrorMessage` in the
 * transcript. Taken as a message, the error sat in the thread under CLAUDE as
 * if the model had said it, and — since a message arriving is the proof that
 * lowers the sign-in note — it hid the one note that said what to do.
 *
 * Returns the sentence when the line is one of these, null for everything else.
 */
export function apiErrorIn(line: unknown): string | null {
  if (!line || typeof line !== 'object') return null
  const l = line as Record<string, any>
  if (l.type !== 'assistant') return null
  const flagged = l.is_api_error_message === true || l.isApiErrorMessage === true
  // `<synthetic>` alone is not enough: the CLI also uses it for its own quiet
  // lines, such as "No response requested." after a stop.
  const synthetic = l.message?.model === '<synthetic>' && typeof l.error === 'string'
  if (!flagged && !synthetic) return null
  const content = l.message?.content
  const text = Array.isArray(content)
    ? content
        .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
        .map((b: any) => b.text)
        .join('\n')
    : typeof content === 'string'
      ? content
      : ''
  return text.trim() || (typeof l.error === 'string' ? l.error : null)
}
