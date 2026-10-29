/**
 * A slash command, as the CLI files it.
 *
 * Typed at a terminal or sent by this app, `/morning focus on Garden` goes into
 * the transcript not as those words but as the CLI's own tags:
 *
 *   <command-message>morning</command-message>
 *   <command-name>/morning</command-name>
 *   <command-args>focus on Garden</command-args>
 *
 * — which opens with `<`, the mark the transcript reader takes for a line the
 * CLI injected. So the one turn the reader actually typed was read back as
 * machinery and dropped: a thread started from ⌘K's `/morning` showed the turn
 * while it ran and lost it the moment it was opened again, and a fork is cut by
 * those two agreeing.
 *
 * Returns what was typed, or null for anything that is not exactly a command's
 * own tags — a line that merely mentions them is not one.
 */
export function typedCommand(text: string): string | null {
  const name = /<command-name>\s*(\/[^<\s]+)\s*<\/command-name>/.exec(text)
  if (!name) return null
  const rest = text.replace(/<(command-message|command-name|command-args)>[\s\S]*?<\/\1>/g, '').trim()
  if (rest) return null
  const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1]?.trim()
  return args ? `${name[1]} ${args}` : name[1]
}
