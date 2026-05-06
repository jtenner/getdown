import type {
  CodeBlock,
  HeadingBlock,
  MarkdownBlockNode,
  ParagraphBlock,
  ParsedDocument,
  ThematicBreakBlock,
} from "./ast";
import { hasUnclosedCodeSpan, parseInlines } from "./inlines";

interface SourceLine {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

interface ReuseIndex {
  readonly byFingerprint: Map<string, MarkdownBlockNode[]>;
}

export function parseDocument(content: string, previous?: ParsedDocument | null): ParsedDocument {
  const normalized = normalizeSource(content);
  const reuse = previous ? buildReuseIndex(previous) : null;
  const lines = splitLines(normalized);
  const blocks: MarkdownBlockNode[] = [];

  let lineIndex = 0;
  while (lineIndex < lines.length) {
    const line = lines[lineIndex]!;
    if (isBlank(line.text)) {
      lineIndex += 1;
      continue;
    }

    const indentedCode = parseIndentedCode(lines, lineIndex, reuse);
    if (indentedCode) {
      blocks.push(indentedCode.block);
      lineIndex = indentedCode.nextLine;
      continue;
    }

    const atxHeading = parseAtxHeading(line, reuse);
    if (atxHeading) {
      blocks.push(atxHeading);
      lineIndex += 1;
      continue;
    }

    const thematicBreak = parseThematicBreak(line, reuse);
    if (thematicBreak) {
      blocks.push(thematicBreak);
      lineIndex += 1;
      continue;
    }

    const paragraph = parseParagraph(lines, lineIndex, reuse);
    if (paragraph) {
      blocks.push(paragraph.block);
      lineIndex = paragraph.nextLine;
      continue;
    }

    lineIndex += 1;
  }

  return { content: normalized, blocks };
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

function parseAtxHeading(line: SourceLine, reuse: ReuseIndex | null): HeadingBlock | null {
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
    children: parseInlines(body),
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
        parseAtxHeading(line, null) ||
        parseThematicBreak(line, null) ||
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
        children: parseInlines(text),
      };
      return { block: reuseBlock(block, reuse), nextLine: nextLine + 1 };
    }
  }

  const text = parts.join("\n").trim();
  if (text.length === 0) return null;

  const raw = sourceSlice(lines, startLine, nextLine);
  const block: ParagraphBlock = {
    id: blockId("paragraph", lines[startLine]!.start, raw),
    kind: "paragraph",
    raw,
    start: lines[startLine]!.start,
    end,
    text,
    children: parseInlines(text),
  };
  return { block: reuseBlock(block, reuse), nextLine };
}

function parseSetextDelimiter(line: string): HeadingBlock["level"] | null {
  const trimmed = stripUpToThreeSpaces(line).trim();
  if (/^=+$/.test(trimmed)) return 1;
  if (/^-+$/.test(trimmed)) return 2;
  return null;
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

function isIndentedCodeLine(line: string): boolean {
  return line.startsWith("    ") || line.startsWith("\t");
}

function stripCodeIndent(line: string): string {
  if (line.startsWith("\t")) return line.slice(1);
  if (line.startsWith("    ")) return line.slice(4);
  return line;
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
