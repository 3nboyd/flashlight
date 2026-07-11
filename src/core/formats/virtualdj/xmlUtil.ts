/**
 * Minimal, purpose-built XML helpers for VirtualDJ's database.xml - NOT a
 * general XML engine. A generic parser/serializer round-trip (e.g. via
 * fast-xml-parser's builder) reformats whitespace, and VirtualDJ rejects a
 * database.xml that doesn't use its exact convention: one-space indent for
 * `<Song>`, two-space indent for its children. We therefore parse with
 * targeted regexes and always regenerate output through formatSongBlock()
 * below, and leave every `<Song>` block we don't touch as an untouched
 * substring of the original file.
 */

export type XmlAttrs = Record<string, string>

const ENTITY_TO_CHAR: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'"
}

export function unescapeXml(value: string): string {
  return value.replace(/&amp;|&lt;|&gt;|&quot;|&apos;|&#x?[0-9a-fA-F]+;/g, (match) => {
    if (ENTITY_TO_CHAR[match]) return ENTITY_TO_CHAR[match]
    const isHex = match[2] === 'x' || match[2] === 'X'
    const code = parseInt(match.slice(isHex ? 3 : 2, -1), isHex ? 16 : 10)
    return Number.isNaN(code) ? match : String.fromCodePoint(code)
  })
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const ATTR_PATTERN = /([\w:.-]+)="([^"]*)"/g

export function parseAttrs(attrString: string): XmlAttrs {
  const attrs: XmlAttrs = {}
  for (const match of attrString.matchAll(ATTR_PATTERN)) {
    attrs[match[1]] = unescapeXml(match[2])
  }
  return attrs
}

export function formatAttrs(attrs: XmlAttrs): string {
  return Object.entries(attrs)
    .map(([key, value]) => `${key}="${escapeXml(value)}"`)
    .join(' ')
}

export interface XmlChildElement {
  tag: string
  attrs: XmlAttrs
  /** Only set for paired tags with text content (e.g. <Comment>text</Comment>); undefined for self-closing. */
  text?: string
}

const CHILD_PATTERN = /<(\w+)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/>|>([\s\S]*?)<\/\1\s*>)/g

/** Scans the flat (non-nested) children of a container element in document order. */
export function parseChildren(innerXml: string): XmlChildElement[] {
  const children: XmlChildElement[] = []
  for (const match of innerXml.matchAll(CHILD_PATTERN)) {
    const [, tag, attrString, closer, text] = match
    children.push({
      tag,
      attrs: parseAttrs(attrString),
      text: closer.startsWith('/>') ? undefined : unescapeXml(text ?? '')
    })
  }
  return children
}

export function formatSelfClosingTag(tag: string, attrs: XmlAttrs, indent: string): string {
  const attrString = formatAttrs(attrs)
  return `${indent}<${tag}${attrString ? ' ' + attrString : ''} />`
}
