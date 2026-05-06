import type { InlineNode } from "./ast";

const escapablePunctuation = new Set(
  Array.from('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'),
);

const namedEntities: Record<string, string> = {
  amp: "&",
  copy: "©",
  gt: ">",
  lt: "<",
  quot: '"',
  apos: "'",
};

export function parseInlines(source: string): readonly InlineNode[] {
  return parseInlineRange(source, 0, source.length).nodes;
}

export function hasUnclosedCodeSpan(source: string): boolean {
  let openerLength: number | null = null;
  let index = 0;

  while (index < source.length) {
    if (source[index] !== "`") {
      index += 1;
      continue;
    }

    const length = countRun(source, index, "`");
    if (openerLength === null) openerLength = length;
    else if (openerLength === length) openerLength = null;
    index += length;
  }

  return openerLength !== null;
}

function parseInlineRange(
  source: string,
  start: number,
  end: number,
  stop?: string,
): { nodes: InlineNode[]; index: number; closed: boolean } {
  const nodes: InlineNode[] = [];
  let text = "";
  let index = start;

  function flushText() {
    if (text.length > 0) {
      const previous = nodes[nodes.length - 1];
      if (previous?.kind === "text") {
        nodes[nodes.length - 1] = { kind: "text", value: previous.value + text };
      } else {
        nodes.push({ kind: "text", value: text });
      }
      text = "";
    }
  }

  while (index < end) {
    const char = source[index]!;

    if (char === "\\") {
      const next = source[index + 1];
      if (next === "\n") {
        flushText();
        nodes.push({ kind: "break" });
        text += "\n";
        index += 2;
        continue;
      }
      if (next && escapablePunctuation.has(next)) {
        text += next;
        index += 2;
        continue;
      }
      text += char;
      index += 1;
      continue;
    }

    if (char === "&") {
      const decoded = decodeEntityAt(source, index);
      if (decoded) {
        text += decoded.value;
        index = decoded.index;
        continue;
      }
    }

    if (char === "\n") {
      if (text.endsWith("  ")) {
        text = text.replace(/ {2,}$/, "");
        flushText();
        nodes.push({ kind: "break" });
        text += "\n";
      } else {
        text += "\n";
      }
      index += 1;
      continue;
    }

    if (char === "`") {
      const codeSpan = parseCodeSpanAt(source, index, end);
      if (codeSpan) {
        flushText();
        nodes.push({ kind: "code", value: codeSpan.value });
        index = codeSpan.index;
        continue;
      }
      const markerLength = countRun(source, index, "`");
      text += source.slice(index, index + markerLength);
      index += markerLength;
      continue;
    }

    if (char === "[") {
      const link = parseInlineLinkAt(source, index, end);
      if (link) {
        flushText();
        nodes.push({
          kind: "link",
          href: link.href,
          title: link.title,
          children: parseInlines(link.label),
        });
        index = link.index;
        continue;
      }
    }

    if (source.startsWith("~~", index) && canOpenDelimiter(source, index, "~~")) {
      const parsed = parseInlineRange(source, index + 2, end, "~~");
      if (parsed.closed && parsed.nodes.length > 0) {
        flushText();
        nodes.push({ kind: "delete", children: parsed.nodes });
        index = parsed.index;
        continue;
      }
    }

    if (source.startsWith("**", index) && canOpenDelimiter(source, index, "**")) {
      const parsed = parseInlineRange(source, index + 2, end, "**");
      if (parsed.closed && parsed.nodes.length > 0) {
        flushText();
        nodes.push({ kind: "strong", children: parsed.nodes });
        index = parsed.index;
        continue;
      }
    }

    if (source.startsWith("__", index) && canOpenDelimiter(source, index, "__")) {
      const parsed = parseInlineRange(source, index + 2, end, "__");
      if (parsed.closed && parsed.nodes.length > 0) {
        flushText();
        nodes.push({ kind: "strong", children: parsed.nodes });
        index = parsed.index;
        continue;
      }
    }

    if (stop && source.startsWith(stop, index) && canCloseDelimiter(source, index, stop)) {
      flushText();
      return { nodes, index: index + stop.length, closed: true };
    }

    if ((char === "*" || char === "_") && canOpenDelimiter(source, index, char)) {
      const parsed = parseInlineRange(source, index + 1, end, char);
      if (parsed.closed && parsed.nodes.length > 0) {
        flushText();
        nodes.push({ kind: "emphasis", children: parsed.nodes });
        index = parsed.index;
        continue;
      }
    }

    text += char;
    index += 1;
  }

  flushText();
  return { nodes, index, closed: false };
}

function parseInlineLinkAt(
  source: string,
  index: number,
  end: number,
): { label: string; href: string; title?: string; index: number } | null {
  const labelEnd = findClosingBracket(source, index, end);
  if (labelEnd === -1 || source[labelEnd + 1] !== "(") return null;

  const destination = parseLinkDestination(source, labelEnd + 2, end);
  if (!destination) return null;

  return {
    label: source.slice(index + 1, labelEnd),
    href: destination.href,
    title: destination.title,
    index: destination.index,
  };
}

function findClosingBracket(source: string, index: number, end: number): number {
  let depth = 0;
  for (let cursor = index; cursor < end; cursor += 1) {
    const char = source[cursor];
    if (char === "\\") {
      cursor += 1;
      continue;
    }
    if (char === "[") depth += 1;
    else if (char === "]") {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  return -1;
}

function parseLinkDestination(
  source: string,
  index: number,
  end: number,
): { href: string; title?: string; index: number } | null {
  let cursor = index;
  let quote: '"' | "'" | null = null;

  while (cursor < end) {
    const char = source[cursor];
    if (char === "\\") {
      cursor += 2;
      continue;
    }
    if (quote === char) {
      quote = null;
    } else if (quote === null && (char === '"' || char === "'") && /\s/.test(source[cursor - 1] ?? "")) {
      quote = char;
    } else if (char === ")" && quote === null) {
      const parsed = parseLinkBody(source.slice(index, cursor));
      return parsed ? { ...parsed, index: cursor + 1 } : null;
    }
    cursor += 1;
  }

  return null;
}

function parseLinkBody(body: string): { href: string; title?: string } | null {
  const trimmed = body.trim();
  if (trimmed === "") return { href: "" };
  if (trimmed.startsWith("<")) {
    const close = trimmed.indexOf(">");
    if (close === -1) return null;
    const rest = trimmed.slice(close + 1).trim();
    const title = parseOptionalTitle(rest);
    return title === null ? { href: trimmed.slice(1, close) } : { href: trimmed.slice(1, close), title };
  }

  const match = /^(\S+)(?:\s+([\s\S]+))?$/.exec(trimmed);
  if (!match) return null;
  const href = match[1]!.replace(/\\([()])/g, "$1");
  const title = parseOptionalTitle(match[2]?.trim() ?? "");
  return title === null ? { href } : { href, title };
}

function parseOptionalTitle(raw: string): string | null {
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

function parseCodeSpanAt(source: string, index: number, end: number): { value: string; index: number } | null {
  const openerLength = countRun(source, index, "`");
  let cursor = index + openerLength;

  while (cursor < end) {
    if (source[cursor] !== "`") {
      cursor += 1;
      continue;
    }

    const closerLength = countRun(source, cursor, "`");
    if (closerLength === openerLength) {
      const raw = source.slice(index + openerLength, cursor);
      return { value: normalizeCodeSpan(raw), index: cursor + closerLength };
    }
    cursor += closerLength;
  }

  return null;
}

function countRun(source: string, index: number, marker: string): number {
  let length = 0;
  while (source[index + length] === marker) length += 1;
  return length;
}

function normalizeCodeSpan(raw: string): string {
  const normalized = raw.replace(/\n/g, " ");
  if (/^ *$/.test(normalized)) return "";
  if (normalized.startsWith(" ") && normalized.endsWith(" ")) {
    return normalized.slice(1, -1);
  }
  return normalized;
}

function canOpenDelimiter(source: string, index: number, delimiter: string): boolean {
  const next = source[index + delimiter.length];
  if (!next || /\s/.test(next)) return false;

  if (delimiter[0] === "_") {
    const previous = source[index - 1];
    if (previous && isAsciiAlphanumeric(previous) && isAsciiAlphanumeric(next)) return false;
  }

  return true;
}

function canCloseDelimiter(source: string, index: number, delimiter: string): boolean {
  const previous = source[index - 1];
  return !!previous && !/\s/.test(previous) && source.startsWith(delimiter, index);
}

function isAsciiAlphanumeric(value: string): boolean {
  return /^[A-Za-z0-9]$/.test(value);
}

function decodeEntityAt(source: string, index: number): { value: string; index: number } | null {
  const match = /^&(#(?:x[0-9A-Fa-f]+|[0-9]+)|[A-Za-z][A-Za-z0-9]+);/.exec(source.slice(index));
  if (!match) return null;

  const body = match[1]!;
  if (body.startsWith("#x") || body.startsWith("#X")) {
    return decodeCodePoint(body.slice(2), 16, index + match[0].length);
  }
  if (body.startsWith("#")) {
    return decodeCodePoint(body.slice(1), 10, index + match[0].length);
  }

  const value = namedEntities[body];
  return value ? { value, index: index + match[0].length } : null;
}

function decodeCodePoint(raw: string, radix: number, index: number): { value: string; index: number } | null {
  const codePoint = Number.parseInt(raw, radix);
  if (!Number.isFinite(codePoint)) return null;
  try {
    return { value: String.fromCodePoint(codePoint), index };
  } catch {
    return { value: "�", index };
  }
}
