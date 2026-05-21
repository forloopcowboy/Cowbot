/**
 * Pre-process markdown so single (stray) tildes are treated as literals.
 *
 * Marked + GFM treats sequences of `~` as strikethrough delimiters. That breaks
 * idiomatic uses of `~` for "approximately" (e.g. "~80% EUR / ~20% BRL").
 *
 * We escape any `~` that is NOT adjacent to another `~`, so:
 *   ~80% EUR / ~20% BRL   →  \~80% EUR / \~20% BRL   (renders as plain text)
 *   ~~strikethrough~~     →  unchanged                (still works)
 */
export function escapeStrayTildes(md: string): string {
  return md.replace(/(?<!~)~(?!~)/g, '\\~')
}
