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
    if (stop && source.startsWith(stop, index)) {
      flushText();
      return { nodes, index: index + stop.length, closed: true };
    }

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

    if (source.startsWith("**", index)) {
      const parsed = parseInlineRange(source, index + 2, end, "**");
      if (parsed.closed && parsed.nodes.length > 0) {
        flushText();
        nodes.push({ kind: "strong", children: parsed.nodes });
        index = parsed.index;
        continue;
      }
    }

    if (source.startsWith("__", index)) {
      const parsed = parseInlineRange(source, index + 2, end, "__");
      if (parsed.closed && parsed.nodes.length > 0) {
        flushText();
        nodes.push({ kind: "strong", children: parsed.nodes });
        index = parsed.index;
        continue;
      }
    }

    if (char === "*" || char === "_") {
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
