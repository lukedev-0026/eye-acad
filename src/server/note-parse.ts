import type { NoteChunk, NoteSentence } from './note-types'

// Turns the layout XML that poppler's `pdftohtml -xml` produces into passages.
// Everything is decided from position and font size, never from font ids or
// from the wording, so a re-exported or lightly edited PDF still parses.

type Font = { size: number; color: string }
type Item = {
  page: number
  top: number
  left: number
  size: number
  white: boolean
  bold: boolean
  text: string
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#34;': '"',
  '&#39;': "'",
  '&#160;': ' ',
}

function decode(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:amp|lt|gt|quot|apos|#\d+);/g, (m) =>
      ENTITIES[m] ?? String.fromCodePoint(Number(m.slice(2, -1))),
    )
}

export type ParsedPage = { number: number; footerNumber: number | null }

function readItems(xml: string): { items: Array<Item>; pages: Array<ParsedPage> } {
  const fonts = new Map<string, Font>()
  for (const m of xml.matchAll(/<fontspec id="(\d+)" size="(\d+)"[^>]*color="(#[0-9a-fA-F]+)"/g)) {
    fonts.set(m[1], { size: Number(m[2]), color: m[3].toLowerCase() })
  }
  const items: Array<Item> = []
  const pages: Array<ParsedPage> = []
  for (const pageXml of xml.split(/(?=<page number=)/).slice(1)) {
    const head = /<page number="(\d+)"[^>]*height="(\d+)"/.exec(pageXml)
    if (!head) continue
    const page = Number(head[1])
    const height = Number(head[2])
    let footerNumber: number | null = null
    for (const m of pageXml.matchAll(
      /<text top="(\d+)" left="(\d+)" width="\d+" height="\d+" font="(\d+)">([\s\S]*?)<\/text>/g,
    )) {
      const top = Number(m[1])
      const text = decode(m[4])
      // Running header and footer, by position.
      if (top < height * 0.05) continue
      if (top > height * 0.95) {
        if (/^\s*\d+\s*$/.test(text)) footerNumber = Number(text)
        continue
      }
      const font = fonts.get(m[3]) ?? { size: 15, color: '#000000' }
      items.push({
        page,
        top,
        left: Number(m[2]),
        size: font.size,
        white: font.color === '#ffffff',
        bold: /<b>/.test(m[4]),
        text,
      })
    }
    pages.push({ number: page, footerNumber })
  }
  return { items, pages }
}

type Role = 'title' | 'h2' | 'h3' | 'body' | 'table_head' | 'table_cell' | 'small'

function roleOf(item: Item): Role {
  if (item.white) return 'table_head'
  if (item.size >= 30) return 'title'
  if (item.size >= 20) return 'h2'
  if (item.size >= 16) return 'h3'
  if (item.size === 15) return 'body'
  if (item.size === 14) return 'table_cell'
  return 'small'
}

// A run of body text: the words, and which page each stretch of them is on.
type Span = { start: number; end: number; page: number }
type Block = {
  kind: 'paragraph' | 'bullet'
  headings: Array<string>
  leadIn: string | null
  text: string
  spans: Array<Span>
  firstPage: number
  lastPage: number
}

function appendLine(block: Block, line: string, page: number) {
  const piece = line.replace(/\s+/g, ' ').trim()
  if (!piece) return
  // A word hyphenated across a line break ("open-" / "angle") is rejoined
  // without a space. The hyphen is kept: these are compound words.
  const glue = block.text === '' || /[A-Za-z]-$/.test(block.text) ? '' : ' '
  const start = block.text.length + glue.length
  block.text += glue + piece
  block.spans.push({ start, end: block.text.length, page })
  block.lastPage = page
}

const ENDS_SENTENCE = /[.!?:;]["”')\]]?$/
const ABBREVIATIONS = /\b(?:e\.g|i\.e|etc|vs|approx|Dr|Mr|Mrs|Fig|No|al)\.$/

function splitSentences(text: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = []
  let start = 0
  const boundary = /[.!?]["”')\]]?\s+(?=["“(]?[A-Z0-9])/g
  for (const m of text.matchAll(boundary)) {
    const end = m.index + m[0].trimEnd().length
    if (ABBREVIATIONS.test(text.slice(start, end))) continue
    out.push({ start, end })
    start = m.index + m[0].length
  }
  if (start < text.length) out.push({ start, end: text.length })
  return out
}

const HIDDEN_SECTIONS = /^(about this note|sources|references)$/i

export type ParsedNote = {
  title: string
  disclaimer: string
  pages: Array<ParsedPage>
  chunks: Array<Omit<NoteChunk, 'vector'>>
}

export function parseNoteXml(xml: string): ParsedNote {
  const { items, pages } = readItems(xml)
  items.sort((a, b) => a.page - b.page || a.top - b.top || a.left - b.left)

  let title = ''
  let disclaimer = ''
  let h2 = ''
  let h3 = ''
  let hidden = false
  const blocks: Array<Block | TableRow> = []

  type TableRow = {
    kind: 'table_row'
    headings: Array<string>
    label: string
    cells: Array<{ column: string; text: string }>
    page: number
  }

  let open: Block | null = null
  let lastBody: { page: number; top: number; left: number } | null = null
  const close = () => {
    if (open && open.text) blocks.push(open)
    open = null
  }

  // Body items that share a line (a bold label followed by ordinary text).
  type Line = { page: number; top: number; left: number; parts: Array<Item> }
  const lines: Array<Line | { table: Array<Item>; page: number } | { heading: Item; role: 'h2' | 'h3' | 'title' }> = []
  let tableRun: Array<Item> = []
  const flushTable = () => {
    if (tableRun.length) lines.push({ table: tableRun, page: tableRun[0].page })
    tableRun = []
  }
  for (const item of items) {
    const role = roleOf(item)
    if (role === 'small') continue
    if (role === 'table_head' || role === 'table_cell') {
      if (tableRun.length && tableRun[0].page !== item.page) flushTable()
      tableRun.push(item)
      continue
    }
    flushTable()
    if (role === 'body') {
      const prev = lines.at(-1)
      if (prev && 'parts' in prev && prev.page === item.page && Math.abs(prev.top - item.top) <= 3) {
        prev.parts.push(item)
      } else {
        lines.push({ page: item.page, top: item.top, left: item.left, parts: [item] })
      }
    } else {
      lines.push({ heading: item, role })
    }
  }
  flushTable()

  for (const line of lines) {
    if ('heading' in line) {
      close()
      lastBody = null
      const text = line.heading.text.trim()
      if (line.role === 'title') title = title ? `${title} ${text}` : text
      else if (line.role === 'h2') {
        h2 = text
        h3 = ''
        hidden = HIDDEN_SECTIONS.test(text)
      } else h3 = text
      continue
    }
    const headings = [h2, h3].filter(Boolean)

    if ('table' in line) {
      close()
      lastBody = null
      if (!hidden) blocks.push(...parseTable(line.table, headings))
      continue
    }

    const text = line.parts.map((p) => p.text).join('')
    if (hidden) {
      if (/^about this note$/i.test(h2)) disclaimer = `${disclaimer} ${text}`.trim()
      continue
    }

    const kind = line.left >= 95 ? 'bullet' : 'paragraph'
    // A new passage starts after a visibly larger gap than a wrapped line, or
    // when the indentation changes. Across a page break the two are joined
    // only when the first clearly stops mid-sentence and the second clearly
    // continues it.
    let continues = false
    if (open && lastBody) {
      if (lastBody.page === line.page) {
        continues = line.top - lastBody.top <= 27 && Math.abs(line.left - lastBody.left) <= 10 && open.kind === kind
      } else {
        continues =
          open.kind === kind &&
          !ENDS_SENTENCE.test(open.text) &&
          /^[a-z0-9]/.test(text.trim()) &&
          !line.parts[0].bold
      }
    }
    if (!continues) {
      close()
      open = { kind, headings, leadIn: null, text: '', spans: [], firstPage: line.page, lastPage: line.page }
      // A bold opening that ends in a full stop or colon is a label for the
      // passage. Bold text that runs straight into the sentence is part of it.
      const first = line.parts[0]
      if (first.bold && line.parts.length > 1 && /[.:]\s*$/.test(first.text)) {
        open.leadIn = first.text.trim()
        appendLine(open, line.parts.slice(1).map((p) => p.text).join(''), line.page)
      } else {
        appendLine(open, text, line.page)
      }
    } else if (open) {
      appendLine(open, text, line.page)
    }
    lastBody = { page: line.page, top: line.top, left: line.left }
  }
  close()

  function parseTable(cells: Array<Item>, headings: Array<string>): Array<TableRow> {
    const head = cells.filter((c) => c.white).sort((a, b) => a.left - b.left)
    if (head.length < 2) return []
    const body = cells.filter((c) => !c.white).sort((a, b) => a.top - b.top || a.left - b.left)
    const columnOf = (c: Item) => {
      let best = 0
      for (const [i, h] of head.entries()) {
        if (Math.abs(c.left - h.left) < Math.abs(c.left - head[best].left)) best = i
      }
      return best
    }
    // A row starts at each first-column line that is not a wrapped
    // continuation of the label above it.
    const starts: Array<number> = []
    let prevLabelTop = -Infinity
    for (const c of body) {
      if (columnOf(c) !== 0) continue
      if (c.top - prevLabelTop > 30) starts.push(c.top)
      prevLabelTop = c.top
    }
    return starts.map((top, i) => {
      const until = starts[i + 1] ?? Infinity
      const mine = body.filter((c) => c.top >= top - 5 && c.top < until - 5)
      const join = (col: number) =>
        mine
          .filter((c) => columnOf(c) === col)
          .map((c) => c.text.trim())
          .join(' ')
          .replace(/\s+/g, ' ')
      // A bare number as a row name ("1") reads better with its column
      // header in front ("Grade 1").
      const name = join(0)
      return {
        kind: 'table_row' as const,
        headings,
        label: /^\d+$/.test(name) ? `${head[0].text.trim()} ${name}` : name,
        cells: head.slice(1).map((h, k) => ({ column: h.text.trim(), text: join(k + 1) })),
        page: mine[0]?.page ?? cells[0].page,
      }
    })
  }

  let sentenceCount = 0
  const nextSentenceId = () => `s${++sentenceCount}`
  const chunks = blocks.map((b, i): Omit<NoteChunk, 'vector'> => {
    const id = `c${String(i + 1).padStart(3, '0')}`
    if (b.kind === 'table_row') {
      const filled = b.cells.filter((c) => c.text)
      const sentences: Array<NoteSentence> = filled.map((c) => ({
        id: nextSentenceId(),
        text: c.text,
        pages: [b.page],
        column: c.column,
      }))
      return {
        id,
        kind: 'table_row',
        headings: b.headings,
        leadIn: b.label,
        text: filled.map((c) => `${c.column}: ${c.text}`).join('. '),
        pages: [b.page],
        sentences,
      }
    }
    const sentences: Array<NoteSentence> = splitSentences(b.text).map((s) => ({
      id: nextSentenceId(),
      text: b.text.slice(s.start, s.end),
      pages: [
        ...new Set(b.spans.filter((sp) => sp.start < s.end && sp.end > s.start).map((sp) => sp.page)),
      ],
    }))
    return {
      id,
      kind: b.kind,
      headings: b.headings,
      leadIn: b.leadIn,
      text: b.text,
      pages: [...new Set(b.spans.map((sp) => sp.page))],
      sentences,
    }
  })

  return { title, disclaimer, pages, chunks }
}
