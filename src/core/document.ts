import type {
  BlockQuoteBlock,
  CodeBlock,
  HeadingBlock,
  HtmlBlock,
  ListBlock,
  MarkdownBlockNode,
  ParagraphBlock,
  ParsedDocument,
  TableBlock,
  TableCell,
  ThematicBreakBlock,
} from "./ast";
import { hasUnclosedCodeSpan, normalizeReferenceLabel, parseInlines, type LinkReferenceDefinition } from "./inlines";

interface SourceLine {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

interface ReuseIndex {
  readonly byFingerprint: Map<string, MarkdownBlockNode[]>;
}

type LinkReferenceDefinitions = ReadonlyMap<string, LinkReferenceDefinition>;

export function parseDocument(content: string, previous?: ParsedDocument | null): ParsedDocument {
  const normalized = normalizeSource(content);
  const reuse = previous ? buildReuseIndex(previous) : null;
  const lines = splitLines(normalized);
  const references = collectLinkReferenceDefinitions(lines);
  const blocks: MarkdownBlockNode[] = [];

  let lineIndex = 0;
  while (lineIndex < lines.length) {
    const line = lines[lineIndex]!;
    if (isBlank(line.text)) {
      lineIndex += 1;
      continue;
    }

    if (parseLinkReferenceDefinitionLine(line.text) || isHtmlCommentLine(line.text)) {
      lineIndex += 1;
      continue;
    }

    const htmlBlock = parseHtmlBlock(lines, lineIndex, reuse);
    if (htmlBlock) {
      blocks.push(htmlBlock.block);
      lineIndex = htmlBlock.nextLine;
      continue;
    }

    const blockQuote = parseBlockQuote(lines, lineIndex, reuse);
    if (blockQuote) {
      blocks.push(blockQuote.block);
      lineIndex = blockQuote.nextLine;
      continue;
    }

    const fencedCode = parseFencedCode(lines, lineIndex, reuse);
    if (fencedCode) {
      blocks.push(fencedCode.block);
      lineIndex = fencedCode.nextLine;
      continue;
    }

    const indentedCode = parseIndentedCode(lines, lineIndex, reuse);
    if (indentedCode) {
      blocks.push(indentedCode.block);
      lineIndex = indentedCode.nextLine;
      continue;
    }

    const thematicBreak = parseThematicBreak(line, reuse);
    if (thematicBreak) {
      blocks.push(thematicBreak);
      lineIndex += 1;
      continue;
    }

    const table = parseTable(lines, lineIndex, reuse, references);
    if (table) {
      blocks.push(table.block);
      lineIndex = table.nextLine;
      continue;
    }

    const list = parseList(lines, lineIndex, reuse, references);
    if (list) {
      blocks.push(list.block);
      lineIndex = list.nextLine;
      continue;
    }

    const atxHeading = parseAtxHeading(line, reuse, references);
    if (atxHeading) {
      blocks.push(atxHeading);
      lineIndex += 1;
      continue;
    }

    const paragraph = parseParagraph(lines, lineIndex, reuse, references);
    if (paragraph) {
      blocks.push(paragraph.block);
      lineIndex = paragraph.nextLine;
      continue;
    }

    lineIndex += 1;
  }

  return { content: normalized, blocks };
}

function parseHtmlBlock(
  lines: readonly SourceLine[],
  startLine: number,
  reuse: ReuseIndex | null,
): { block: HtmlBlock; nextLine: number } | null {
  const first = stripUpToThreeSpaces(lines[startLine]!.text);
  if (/^<hr\s*\/?>$/i.test(first.trim())) {
    const raw = lines[startLine]!.text;
    const block: HtmlBlock = {
      id: blockId("html", lines[startLine]!.start, raw),
      kind: "html",
      raw,
      start: lines[startLine]!.start,
      end: lines[startLine]!.end,
      tag: "hr",
      innerHtml: "",
    };
    return { block: reuseBlock(block, reuse), nextLine: startLine + 1 };
  }

  if (first.trim() !== "<div>") return null;

  const inner: string[] = [];
  let nextLine = startLine + 1;
  let end = lines[startLine]!.end;

  while (nextLine < lines.length) {
    const line = lines[nextLine]!;
    if (stripUpToThreeSpaces(line.text).trim() === "</div>") {
      end = line.end;
      nextLine += 1;
      const raw = sourceSlice(lines, startLine, nextLine);
      const block: HtmlBlock = {
        id: blockId("html", lines[startLine]!.start, raw),
        kind: "html",
        raw,
        start: lines[startLine]!.start,
        end,
        tag: "div",
        innerHtml: inner.length === 0 ? "" : `\n${inner.join("\n")}\n`,
        ...(lines[nextLine] && isBlank(lines[nextLine]!.text) ? { trailingNewline: true } : null),
      };
      return { block: reuseBlock(block, reuse), nextLine };
    }
    inner.push(line.text);
    end = line.end;
    nextLine += 1;
  }

  return null;
}

function parseBlockQuote(
  lines: readonly SourceLine[],
  startLine: number,
  reuse: ReuseIndex | null,
): { block: BlockQuoteBlock; nextLine: number } | null {
  if (!isBlockQuoteLine(lines[startLine]!.text)) return null;

  const parts: string[] = [];
  let nextLine = startLine;
  let end = lines[startLine]!.end;

  while (nextLine < lines.length) {
    const line = lines[nextLine]!;
    if (isBlockQuoteLine(line.text)) {
      parts.push(stripBlockQuoteMarker(line.text));
      end = line.end;
      nextLine += 1;
      continue;
    }

    if (!isBlank(line.text)) {
      parts.push(stripUpToThreeSpaces(line.text));
      end = line.end;
      nextLine += 1;
      continue;
    }

    break;
  }

  const raw = sourceSlice(lines, startLine, nextLine);
  const childDocument = parseDocument(parts.join("\n"));
  const block: BlockQuoteBlock = {
    id: blockId("blockquote", lines[startLine]!.start, raw),
    kind: "blockquote",
    raw,
    start: lines[startLine]!.start,
    end,
    blocks: childDocument.blocks,
  };
  return { block: reuseBlock(block, reuse), nextLine };
}

function isBlockQuoteLine(line: string): boolean {
  return /^ {0,3}>/.test(line);
}

function stripBlockQuoteMarker(line: string): string {
  return line.replace(/^ {0,3}> ?/, "");
}

function parseFencedCode(
  lines: readonly SourceLine[],
  startLine: number,
  reuse: ReuseIndex | null,
): { block: CodeBlock; nextLine: number } | null {
  const first = lines[startLine]!;
  const opener = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(first.text);
  if (!opener) return null;

  const indent = opener[1]!.length;
  const marker = opener[2]!;
  const fence = marker[0]!;
  const info = opener[3]!.trim();
  if (fence === "`" && info.includes("`")) return null;
  if (startLine === lines.length - 1 && info === "") return null;

  const parts: string[] = [];
  let nextLine = startLine + 1;
  let end = first.end;
  let closed = false;

  while (nextLine < lines.length) {
    const line = lines[nextLine]!;
    const closing = new RegExp(`^ {0,3}${escapeRegExp(fence)}{${marker.length},}[ \\t]*$`).test(line.text);
    if (closing) {
      end = line.end;
      nextLine += 1;
      closed = true;
      break;
    }
    parts.push(stripCodeFenceIndent(line.text, indent));
    end = line.end;
    nextLine += 1;
  }

  const raw = sourceSlice(lines, startLine, closed ? nextLine : lines.length);
  const language = info === "" ? undefined : info.split(/\s+/)[0];
  const text = parts.length === 0 ? "" : `${parts.join("\n")}\n`;
  const block: CodeBlock = {
    id: blockId("code", first.start, raw),
    kind: "code",
    raw,
    start: first.start,
    end,
    text,
    ...(language ? { language } : null),
  };
  return { block: reuseBlock(block, reuse), nextLine };
}

function collectLinkReferenceDefinitions(lines: readonly SourceLine[]): LinkReferenceDefinitions {
  const definitions = new Map<string, LinkReferenceDefinition>();
  for (const line of lines) {
    const parsed = parseLinkReferenceDefinitionLine(line.text);
    if (!parsed) continue;
    const label = normalizeReferenceLabel(parsed.label);
    if (label && !definitions.has(label)) definitions.set(label, parsed.definition);
  }
  return definitions;
}

function parseLinkReferenceDefinitionLine(
  line: string,
): { label: string; definition: LinkReferenceDefinition } | null {
  const match = /^ {0,3}\[([^\]]+)\]:[ \t]*(.*)$/.exec(line);
  if (!match) return null;
  const body = parseLinkReferenceDefinitionBody(match[2] ?? "");
  return body ? { label: match[1]!, definition: body } : null;
}

function parseLinkReferenceDefinitionBody(body: string): LinkReferenceDefinition | null {
  const trimmed = body.trim();
  if (trimmed === "") return null;

  if (trimmed.startsWith("<")) {
    const close = trimmed.indexOf(">", 1);
    if (close === -1) return null;
    const href = trimmed.slice(1, close);
    const title = parseReferenceTitle(trimmed.slice(close + 1).trim());
    return title === null ? { href } : { href, title };
  }

  const match = /^(\S+)(?:\s+([\s\S]+))?$/.exec(trimmed);
  if (!match) return null;
  const href = match[1]!.replace(/\\([()])/g, "$1");
  const title = parseReferenceTitle(match[2]?.trim() ?? "");
  return title === null ? { href } : { href, title };
}

function parseReferenceTitle(raw: string): string | null {
  if (raw === "") return null;
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'")) ||
    (raw.startsWith("(") && raw.endsWith(")"))
  ) {
    return raw.slice(1, -1);
  }
  return null;
}

function parseIndentedCode(
  lines: readonly SourceLine[],
  startLine: number,
  reuse: ReuseIndex | null,
): { block: CodeBlock; nextLine: number } | null {
  const first = lines[startLine]!;
  if (!isIndentedCodeLine(first.text)) return null;

  const parts: string[] = [];
  let nextLine = startLine;
  let end = first.end;

  while (nextLine < lines.length) {
    const line = lines[nextLine]!;
    if (!isBlank(line.text) && !isIndentedCodeLine(line.text)) break;
    parts.push(stripCodeIndent(line.text));
    end = line.end;
    nextLine += 1;
  }

  const raw = sourceSlice(lines, startLine, nextLine);
  const text = trimTrailingBlankCodeLines(parts).join("\n") + "\n";
  const id = blockId("code", first.start, raw);
  const block: CodeBlock = { id, kind: "code", raw, start: first.start, end, text };
  return { block: reuseBlock(block, reuse), nextLine };
}

interface ParsedListMarker {
  readonly indent: number;
  readonly ordered: boolean;
  readonly marker: string;
  readonly number?: number;
  readonly text: string;
}

interface MutableListItem {
  text: string;
  children: readonly import("./ast").InlineNode[];
  task?: "checked" | "unchecked";
  blocks?: MarkdownBlockNode[];
}

function parseList(
  lines: readonly SourceLine[],
  startLine: number,
  reuse: ReuseIndex | null,
  references: LinkReferenceDefinitions,
): { block: ListBlock; nextLine: number } | null {
  const parsed = parseListAt(lines, startLine, reuse, references);
  return parsed ? { block: parsed.block, nextLine: parsed.nextLine } : null;
}

function parseListAt(
  lines: readonly SourceLine[],
  startLine: number,
  reuse: ReuseIndex | null,
  references: LinkReferenceDefinitions,
): { block: ListBlock; nextLine: number; end: number } | null {
  const firstMarker = parseListMarker(lines[startLine]!.text);
  if (!firstMarker) return null;

  const items: MutableListItem[] = [];
  let nextLine = startLine;
  let end = lines[startLine]!.end;
  let loose = false;
  let pendingBlank = false;

  while (nextLine < lines.length) {
    const line = lines[nextLine]!;
    const marker = parseListMarker(line.text);

    if (marker) {
      if (isSameListLevel(marker, firstMarker) && marker.ordered === firstMarker.ordered && marker.marker === firstMarker.marker) {
        if (pendingBlank) pendingBlank = false;
        items.push(createListItem(marker.text, references));
        end = line.end;
        nextLine += 1;
        continue;
      }

      if (marker.indent > firstMarker.indent + 1 && items.length > 0) {
        const nested = parseListAt(lines, nextLine, reuse, references);
        if (!nested) break;
        const current = items[items.length - 1]!;
        current.blocks = [...(current.blocks ?? []), nested.block];
        end = nested.end;
        nextLine = nested.nextLine;
        pendingBlank = false;
        continue;
      }
    }

    if (items.length > 0 && isBlank(line.text)) {
      if (!blankBelongsToList(lines, nextLine, firstMarker)) break;
      loose = true;
      pendingBlank = true;
      end = line.end;
      nextLine += 1;
      continue;
    }

    if (!isBlank(line.text) && items.length > 0 && leadingSpaces(line.text) > firstMarker.indent) {
      const current = items[items.length - 1]!;
      if (pendingBlank) {
        const continuationBlock = collectListContinuationBlock(lines, nextLine, firstMarker);
        const childDocument = parseDocument(continuationBlock.text);
        current.blocks = [...(current.blocks ?? []), ...childDocument.blocks];
        end = continuationBlock.end;
        nextLine = continuationBlock.nextLine;
        pendingBlank = false;
        continue;
      }

      const continuation = stripListContinuationIndent(line.text, firstMarker.indent);
      if (isBlockQuoteLine(continuation)) {
        const childDocument = parseDocument(continuation);
        current.blocks = [...(current.blocks ?? []), ...childDocument.blocks];
      } else if (isFencedCodeOpener(continuation) || isIndentedCodeLine(continuation)) {
        const continuationBlock = collectListContinuationBlock(lines, nextLine, firstMarker);
        const childDocument = parseDocument(continuationBlock.text);
        current.blocks = [...(current.blocks ?? []), ...childDocument.blocks];
        end = continuationBlock.end;
        nextLine = continuationBlock.nextLine;
        continue;
      } else {
        current.text = current.text ? `${current.text}\n${continuation}` : continuation;
        current.children = parseInlines(current.text, references);
      }
      end = line.end;
      nextLine += 1;
      continue;
    }

    break;
  }

  const raw = sourceSlice(lines, startLine, nextLine);
  const block: ListBlock = {
    id: blockId("list", lines[startLine]!.start, raw),
    kind: "list",
    raw,
    start: lines[startLine]!.start,
    end,
    ordered: firstMarker.ordered,
    marker: firstMarker.marker,
    ...(firstMarker.ordered && firstMarker.number !== 1 ? { startNumber: firstMarker.number } : null),
    items: items.map((item) => finalizeListItem(item, loose, references)),
  };
  return { block: reuseBlock(block, reuse), nextLine, end };
}

function createListItem(rawText: string, references: LinkReferenceDefinitions): MutableListItem {
  const task = parseTaskMarker(rawText);
  const text = task ? task.text : rawText;
  const childDocument = parseDocument(text);
  const blockContent = childDocument.blocks.length === 1 && childDocument.blocks[0]?.kind === "heading";
  return {
    text: blockContent ? "" : text,
    children: blockContent ? [] : parseInlines(text, references),
    ...(task ? { task: task.checked ? "checked" : "unchecked" } : null),
    ...(blockContent ? { blocks: [...childDocument.blocks] } : null),
  };
}

function finalizeListItem(
  item: MutableListItem,
  loose: boolean,
  references: LinkReferenceDefinitions,
): ListBlock["items"][number] {
  if (!loose) {
    return {
      text: item.text,
      children: item.children,
      ...(item.task ? { task: item.task } : null),
      ...(item.blocks ? { blocks: item.blocks } : null),
    };
  }

  const blocks: MarkdownBlockNode[] = [];
  if (item.text.length > 0) blocks.push(createListParagraphBlock(item.text, references));
  blocks.push(...(item.blocks ?? []));
  return {
    text: "",
    children: [],
    ...(item.task ? { task: item.task } : null),
    ...(blocks.length > 0 ? { blocks } : null),
  };
}

function createListParagraphBlock(text: string, references: LinkReferenceDefinitions): ParagraphBlock {
  return {
    id: blockId("paragraph", 0, text),
    kind: "paragraph",
    raw: text,
    start: 0,
    end: text.length,
    text,
    children: parseInlines(text, references),
  };
}

function blankBelongsToList(lines: readonly SourceLine[], blankLine: number, firstMarker: ParsedListMarker): boolean {
  let nextLine = blankLine + 1;
  while (nextLine < lines.length && isBlank(lines[nextLine]!.text)) nextLine += 1;
  const next = lines[nextLine];
  if (!next) return false;
  const marker = parseListMarker(next.text);
  if (marker && isSameListLevel(marker, firstMarker) && marker.ordered === firstMarker.ordered && marker.marker === firstMarker.marker) {
    return true;
  }
  return leadingSpaces(next.text) > firstMarker.indent;
}

function collectListContinuationBlock(
  lines: readonly SourceLine[],
  startLine: number,
  firstMarker: ParsedListMarker,
): { text: string; nextLine: number; end: number } {
  const parts: string[] = [];
  let nextLine = startLine;
  let end = lines[startLine]!.end;

  while (nextLine < lines.length) {
    const line = lines[nextLine]!;
    const marker = parseListMarker(line.text);
    if (marker && isSameListLevel(marker, firstMarker)) break;
    if (!isBlank(line.text) && leadingSpaces(line.text) <= firstMarker.indent) break;

    parts.push(isBlank(line.text) ? "" : stripListContinuationIndent(line.text, firstMarker.indent));
    end = line.end;
    nextLine += 1;
  }

  return { text: parts.join("\n"), nextLine, end };
}

function isSameListLevel(marker: ParsedListMarker, firstMarker: ParsedListMarker): boolean {
  return marker.indent >= firstMarker.indent && marker.indent <= firstMarker.indent + 1;
}

function parseListMarker(line: string): ParsedListMarker | null {
  const unordered = /^( *)([-+*])(?:[ \t]+(.*)|[ \t]*)$/.exec(line);
  if (unordered && unordered[1]!.length <= 3) {
    if (unordered[2] === "*" && unordered[3] === undefined) return null;
    return { indent: unordered[1]!.length, ordered: false, marker: unordered[2]!, text: unordered[3] ?? "" };
  }

  const ordered = /^( *)(\d{1,9})([.)])(?:[ \t]+(.*)|[ \t]*)$/.exec(line);
  if (ordered && ordered[1]!.length <= 3) {
    return {
      indent: ordered[1]!.length,
      ordered: true,
      marker: ordered[3]!,
      number: Number.parseInt(ordered[2]!, 10),
      text: ordered[4] ?? "",
    };
  }

  return null;
}

function leadingSpaces(line: string): number {
  return /^ */.exec(line)?.[0].length ?? 0;
}

function stripListContinuationIndent(line: string, listIndent: number): string {
  return line.slice(Math.min(line.length, listIndent + 2));
}

function parseTaskMarker(text: string): { checked: boolean; text: string } | null {
  const match = /^\[([ xX])\] (.*)$/.exec(text);
  if (!match) return null;
  return { checked: match[1]!.toLowerCase() === "x", text: match[2]! };
}

function parseTable(
  lines: readonly SourceLine[],
  startLine: number,
  reuse: ReuseIndex | null,
  references: LinkReferenceDefinitions,
): { block: TableBlock; nextLine: number } | null {
  const delimiterLine = lines[startLine + 1];
  if (!delimiterLine) return null;
  if (!lines[startLine]!.text.includes("|") && !delimiterLine.text.includes("|")) return null;

  const headerTexts = splitTableRow(stripUpToThreeSpaces(lines[startLine]!.text));
  const delimiterCells = splitTableRow(stripUpToThreeSpaces(delimiterLine.text));
  const alignments = delimiterCells.map(parseTableAlignment);
  if (headerTexts.length === 0 || delimiterCells.length === 0 || alignments.some((alignment) => alignment === undefined)) {
    return null;
  }

  const columnCount = headerTexts.length;
  const rows: (readonly TableCell[])[] = [];
  let nextLine = startLine + 2;
  let end = delimiterLine.end;

  while (nextLine < lines.length) {
    const line = lines[nextLine]!;
    const text = stripUpToThreeSpaces(line.text);
    if (isBlank(text) || !text.includes("|")) break;
    rows.push(normalizeTableCells(splitTableRow(text), columnCount, references));
    end = line.end;
    nextLine += 1;
  }

  const raw = sourceSlice(lines, startLine, nextLine);
  const block: TableBlock = {
    id: blockId("table", lines[startLine]!.start, raw),
    kind: "table",
    raw,
    start: lines[startLine]!.start,
    end,
    alignments: Array.from({ length: columnCount }, (_, index) => alignments[index] ?? null),
    header: normalizeTableCells(headerTexts, columnCount, references),
    rows,
  };
  return { block: reuseBlock(block, reuse), nextLine };
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  const source = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const withoutTrailingPipe = source.endsWith("|") && !source.endsWith("\\|") ? source.slice(0, -1) : source;
  const cells: string[] = [];
  let cell = "";
  let escaped = false;

  for (const char of withoutTrailingPipe) {
    if (escaped) {
      cell += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "|") {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += char;
  }
  if (escaped) cell += "\\";
  cells.push(cell.trim());
  return cells;
}

function parseTableAlignment(cell: string): TableBlock["alignments"][number] | undefined {
  const normalized = cell.trim();
  if (!/^:?-+:?$/.test(normalized)) return undefined;
  const left = normalized.startsWith(":");
  const right = normalized.endsWith(":");
  if (left && right) return "center";
  if (left) return "left";
  if (right) return "right";
  return null;
}

function normalizeTableCells(
  cells: readonly string[],
  count: number,
  references: LinkReferenceDefinitions,
): TableBlock["header"] {
  return Array.from({ length: count }, (_, index) => {
    const text = cells[index] ?? "";
    return { text, children: parseInlines(text, references) };
  });
}

function parseAtxHeading(
  line: SourceLine,
  reuse: ReuseIndex | null,
  references: LinkReferenceDefinitions,
): HeadingBlock | null {
  const match = /^( {0,3})(#{1,6})(?:[ \t]+|$)(.*)$/.exec(line.text);
  if (!match) return null;

  const level = match[2]!.length as HeadingBlock["level"];
  const body = match[3]!.replace(/[ \t]+#+[ \t]*$/, "").trim();
  const raw = line.text;
  const id = blockId("heading", line.start, raw);
  const block: HeadingBlock = {
    id,
    kind: "heading",
    raw,
    start: line.start,
    end: line.end,
    level,
    text: body,
    children: parseInlines(body, references),
  };
  return reuseBlock(block, reuse);
}

function parseThematicBreak(line: SourceLine, reuse: ReuseIndex | null): ThematicBreakBlock | null {
  const trimmed = stripUpToThreeSpaces(line.text).trim();
  if (!/^(?:\*\s*){3,}$/.test(trimmed) && !/^(?:-\s*){3,}$/.test(trimmed) && !/^(?:_\s*){3,}$/.test(trimmed)) {
    return null;
  }

  const raw = line.text;
  const block: ThematicBreakBlock = {
    id: blockId("thematicBreak", line.start, raw),
    kind: "thematicBreak",
    raw,
    start: line.start,
    end: line.end,
  };
  return reuseBlock(block, reuse);
}

function parseParagraph(
  lines: readonly SourceLine[],
  startLine: number,
  reuse: ReuseIndex | null,
  references: LinkReferenceDefinitions,
): { block: ParagraphBlock | HeadingBlock; nextLine: number } | null {
  const parts: string[] = [];
  let nextLine = startLine;
  let end = lines[startLine]!.end;

  while (nextLine < lines.length) {
    const line = lines[nextLine]!;
    if (isBlank(line.text)) {
      if (parts.length > 0 && hasUnclosedCodeSpan(parts.join("\n"))) {
        parts.push("");
        end = line.end;
        nextLine += 1;
        continue;
      }
      break;
    }
    if (
      nextLine > startLine &&
      ((nextLine === startLine + 1 && parseSetextDelimiter(line.text)) ||
        parseAtxHeading(line, null, references) ||
        parseThematicBreak(line, null) ||
        isBlockQuoteLine(line.text) ||
        isIndentedCodeLine(line.text))
    ) {
      break;
    }
    parts.push(stripUpToThreeSpaces(line.text));
    end = line.end;
    nextLine += 1;
  }

  if (parts.length === 0) return null;

  if (parts.length === 1 && nextLine < lines.length) {
    const delimiter = parseSetextDelimiter(lines[nextLine]!.text);
    if (delimiter) {
      const raw = sourceSlice(lines, startLine, nextLine + 1);
      const text = parts[0]!.trim();
      const block: HeadingBlock = {
        id: blockId("heading", lines[startLine]!.start, raw),
        kind: "heading",
        raw,
        start: lines[startLine]!.start,
        end: lines[nextLine]!.end,
        level: delimiter,
        text,
        children: parseInlines(text, references),
      };
      return { block: reuseBlock(block, reuse), nextLine: nextLine + 1 };
    }
  }

  const text = normalizeParagraphText(parts.join("\n"));
  if (text.length === 0) return null;

  const raw = sourceSlice(lines, startLine, nextLine);
  const block: ParagraphBlock = {
    id: blockId("paragraph", lines[startLine]!.start, raw),
    kind: "paragraph",
    raw,
    start: lines[startLine]!.start,
    end,
    text,
    children: parseInlines(text, references),
  };
  return { block: reuseBlock(block, reuse), nextLine };
}

function parseSetextDelimiter(line: string): HeadingBlock["level"] | null {
  const trimmed = stripUpToThreeSpaces(line).trim();
  if (/^=+$/.test(trimmed)) return 1;
  if (/^-+$/.test(trimmed)) return 2;
  return null;
}

function normalizeParagraphText(text: string): string {
  const leadingTrimmed = text.replace(/^[ \t]+/, "");
  if (hasTrailingHardBreakBackslash(leadingTrimmed)) return `${leadingTrimmed.replace(/[ \t]*$/, "")}\n`;
  if (/ {2,}$/.test(leadingTrimmed)) return leadingTrimmed.replace(/ {2,}$/, "  \n");
  return leadingTrimmed.trimEnd();
}

function hasTrailingHardBreakBackslash(text: string): boolean {
  const trimmed = text.replace(/[ \t]*$/, "");
  let count = 0;
  for (let index = trimmed.length - 1; index >= 0 && trimmed[index] === "\\"; index -= 1) count += 1;
  return count % 2 === 1;
}

function normalizeSource(content: string): string {
  return content.replace(/\r\n?/g, "\n").replace(/\0/g, "�");
}

function splitLines(source: string): SourceLine[] {
  if (source.length === 0) return [];

  const lines: SourceLine[] = [];
  let start = 0;
  for (let index = 0; index <= source.length; index += 1) {
    if (index === source.length || source[index] === "\n") {
      lines.push({ text: source.slice(start, index), start, end: index });
      start = index + 1;
    }
  }
  return lines;
}

function sourceSlice(lines: readonly SourceLine[], startLine: number, endLine: number): string {
  const start = lines[startLine]!.start;
  const end = lines[endLine - 1]!.end;
  return lines
    .slice(startLine, endLine)
    .map((line) => line.text)
    .join("\n") || `${start}:${end}`;
}

function stripUpToThreeSpaces(line: string): string {
  return line.replace(/^ {0,3}/, "");
}

function isBlank(line: string): boolean {
  return /^[ \t]*$/.test(line);
}

function isHtmlCommentLine(line: string): boolean {
  return /^ {0,3}<!--[\s\S]*-->[ \t]*$/.test(line);
}

function isIndentedCodeLine(line: string): boolean {
  return line.startsWith("    ") || line.startsWith("\t");
}

function isFencedCodeOpener(line: string): boolean {
  return /^( {0,3})(`{3,}|~{3,})/.test(line);
}

function stripCodeIndent(line: string): string {
  if (line.startsWith("\t")) return line.slice(1);
  if (line.startsWith("    ")) return line.slice(4);
  return line;
}

function stripCodeFenceIndent(line: string, indent: number): string {
  let cursor = 0;
  while (cursor < indent && line[cursor] === " ") cursor += 1;
  return line.slice(cursor);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trimTrailingBlankCodeLines(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1] === "") end -= 1;
  return lines.slice(0, end);
}

function blockId(kind: MarkdownBlockNode["kind"], start: number, raw: string): string {
  void raw;
  return `${kind}:${start}`;
}

function buildReuseIndex(previous: ParsedDocument): ReuseIndex {
  const byFingerprint = new Map<string, MarkdownBlockNode[]>();
  for (const block of previous.blocks) {
    const fingerprint = blockFingerprint(block);
    const bucket = byFingerprint.get(fingerprint);
    if (bucket) bucket.push(block);
    else byFingerprint.set(fingerprint, [block]);
  }
  return { byFingerprint };
}

function reuseBlock<T extends MarkdownBlockNode>(block: T, reuse: ReuseIndex | null): T {
  const bucket = reuse?.byFingerprint.get(blockFingerprint(block));
  const previous = bucket?.shift();
  return (previous ?? block) as T;
}

function blockFingerprint(block: MarkdownBlockNode): string {
  return `${block.kind}:${block.start}:${block.raw}`;
}
