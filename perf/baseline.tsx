import { mkdir } from "node:fs/promises";
import { gcAndSweep, heapStats, memoryUsage } from "bun:jsc";
import { renderToStaticMarkup } from "react-dom/server";
import { parseDocument } from "../src/core/document";
import { hasUnclosedCodeSpan, normalizeReferenceLabel, parseInlines } from "../src/core/inlines";
import { GetDown } from "../src/index";

interface BenchmarkCase {
  readonly name: string;
  readonly group: string;
  readonly description: string;
  readonly iterations: number;
  readonly rounds?: number;
  readonly warmup?: number;
  run(): unknown;
}

interface BenchmarkResult {
  readonly name: string;
  readonly group: string;
  readonly description: string;
  readonly iterations: number;
  readonly rounds: number;
  readonly ops: number;
  readonly meanNs: number;
  readonly medianNs: number;
  readonly p95Ns: number;
  readonly minNs: number;
  readonly maxNs: number;
  readonly beforeHeapBytes: number;
  readonly afterHeapBytes: number;
  readonly afterGcHeapBytes: number;
  readonly heapDeltaBytesPerOp: number;
  readonly retainedHeapBytesPerOp: number;
  readonly objectDeltaPerOp: number;
  readonly retainedObjectDeltaPerOp: number;
  readonly currentMemoryDeltaBytesPerOp: number;
  readonly peakMemoryBytes: number;
}

const comprehensiveMarkdown = [
  "# Performance kitchen sink",
  "Paragraph with *emphasis*, **strong**, ~~deleted~~, `code`, &copy;, a hard break  \nand a [reference link][docs].",
  "> Quote with **inline** content\n> and a second line",
  "1. ordered item\n2. second item\n   - nested bullet\n   - [x] completed task\n   - [ ] pending task",
  "| Feature | Cost |\n| :-- | --: |\n| tables | `medium` |\n| links | [docs][] |",
  "```ts\nconst value = 42;\nconsole.log(value);\n```",
  "    indented code\n    keeps whitespace",
  "<div>\n<span class=\"token\">raw html</span>\n</div>",
  "***",
  "[docs]: https://example.com/docs \"Docs\"",
].join("\n\n");

const inlineKitchenSink = [
  "Escapes: \\*literal\\* and entities &lt;&amp;&gt;.",
  "Emphasis: *one* **two** ***three*** _four_ __five__ ~~six~~.",
  "Links: [inline](https://example.com \"title\"), <https://example.com>, www.example.com, user@example.com.",
  "Images: ![alt *text*](https://example.com/image.png \"image\").",
  "HTML: <span class=\"tag\">nested **content**</span> and <br />.",
  "Code: `short` and `` code with ` tick ``.",
].join("\n");

const linkReferenceLabel = "  Docs\tFor   Streaming\nMarkdown  ";
const codeSpanProbe = "Alpha `open code span with **formatting** that has not closed yet";
const streamingDocument = makeStreamingMarkdown(72);
const streamingDeltas = chunk(streamingDocument, 96);
const lineStreamingDeltas = streamingDocument.split(/(?<=\n)/);
const stablePrefix = makeStreamingMarkdown(32) + "\n\n";
const finalParagraphDeltas = chunk(
  "The final paragraph arrives in a trickle with *optimistic emphasis*, `optimistic code`, and a trailing [link](https://example.com).",
  8,
);
const previouslyParsedComprehensive = parseDocument(comprehensiveMarkdown);

let sink: unknown;

const benchmarks: readonly BenchmarkCase[] = [
  {
    group: "document",
    name: "parseDocument:kitchen-sink",
    description: "Full parse that exercises headings, paragraphs, references, lists, tables, code, block quotes, HTML, and thematic breaks.",
    iterations: 1_000,
    run: () => parseDocument(comprehensiveMarkdown),
  },
  {
    group: "document",
    name: "parseDocument:reuse-unchanged",
    description: "Reparse identical content with a previous ParsedDocument to baseline structural-sharing overhead.",
    iterations: 2_000,
    run: () => parseDocument(comprehensiveMarkdown, previouslyParsedComprehensive),
  },
  {
    group: "inline",
    name: "parseInlines:kitchen-sink",
    description: "Inline parser coverage for escaping, entities, emphasis, links, autolinks, images, HTML spans, hard breaks, and code spans.",
    iterations: 15_000,
    run: () => parseInlines(inlineKitchenSink),
  },
  {
    group: "inline",
    name: "hasUnclosedCodeSpan",
    description: "Streaming helper used when a paragraph may continue across blank lines while a code span is open.",
    iterations: 150_000,
    run: () => hasUnclosedCodeSpan(codeSpanProbe),
  },
  {
    group: "inline",
    name: "normalizeReferenceLabel",
    description: "Reference definition/link label normalization micro-baseline.",
    iterations: 200_000,
    run: () => normalizeReferenceLabel(linkReferenceLabel),
  },
  {
    group: "streaming",
    name: "stream:96-byte-chunks",
    description: "Append small deltas and parse the growing content with the previous ParsedDocument after every delta.",
    iterations: 15,
    rounds: 5,
    run: () => parseStreamingDeltas(streamingDeltas),
  },
  {
    group: "streaming",
    name: "stream:line-chunks",
    description: "Append line-sized deltas, approximating token streaming that flushes around newlines.",
    iterations: 20,
    rounds: 5,
    run: () => parseStreamingDeltas(lineStreamingDeltas),
  },
  {
    group: "streaming",
    name: "stream:final-block-trickle",
    description: "Large stable prefix plus tiny updates to the final block; unchanged leading blocks should be reused.",
    iterations: 80,
    rounds: 5,
    run: () => parseFinalBlockTrickle(),
  },
  {
    group: "react",
    name: "renderToStaticMarkup:GetDown",
    description: "Server-render the comprehensive document through the public React component.",
    iterations: 300,
    run: () => renderToStaticMarkup(<GetDown content={comprehensiveMarkdown} />),
  },
];

const shouldSave = process.argv.includes("--save");
const jsonOnly = process.argv.includes("--json");
const results = benchmarks.map(runBenchmark);

if (jsonOnly) {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
} else {
  printSummary(results);
}

if (shouldSave) {
  const path = await saveBaseline(results);
  if (!jsonOnly) console.log(`\nSaved baseline to ${path}`);
}

function runBenchmark(benchmark: BenchmarkCase): BenchmarkResult {
  const rounds = benchmark.rounds ?? 7;
  const warmup = benchmark.warmup ?? Math.max(5, Math.min(benchmark.iterations, 100));

  for (let index = 0; index < warmup; index += 1) sink = benchmark.run();
  gcAndSweep();

  const beforeHeap = heapStats();
  const beforeMemory = memoryUsage();
  const samples: number[] = [];

  for (let round = 0; round < rounds; round += 1) {
    const start = Bun.nanoseconds();
    for (let index = 0; index < benchmark.iterations; index += 1) sink = benchmark.run();
    const elapsed = Bun.nanoseconds() - start;
    samples.push(elapsed / benchmark.iterations);
  }

  const afterHeap = heapStats();
  const afterMemory = memoryUsage();
  gcAndSweep();
  const afterGcHeap = heapStats();

  const ops = benchmark.iterations * rounds;
  const sorted = [...samples].sort((left, right) => left - right);
  const meanNs = samples.reduce((total, value) => total + value, 0) / samples.length;

  return {
    name: benchmark.name,
    group: benchmark.group,
    description: benchmark.description,
    iterations: benchmark.iterations,
    rounds,
    ops,
    meanNs,
    medianNs: percentile(sorted, 0.5),
    p95Ns: percentile(sorted, 0.95),
    minNs: sorted[0] ?? 0,
    maxNs: sorted[sorted.length - 1] ?? 0,
    beforeHeapBytes: beforeHeap.heapSize,
    afterHeapBytes: afterHeap.heapSize,
    afterGcHeapBytes: afterGcHeap.heapSize,
    heapDeltaBytesPerOp: (afterHeap.heapSize - beforeHeap.heapSize) / ops,
    retainedHeapBytesPerOp: (afterGcHeap.heapSize - beforeHeap.heapSize) / ops,
    objectDeltaPerOp: (afterHeap.objectCount - beforeHeap.objectCount) / ops,
    retainedObjectDeltaPerOp: (afterGcHeap.objectCount - beforeHeap.objectCount) / ops,
    currentMemoryDeltaBytesPerOp: (afterMemory.current - beforeMemory.current) / ops,
    peakMemoryBytes: afterMemory.peak,
  };
}

function parseStreamingDeltas(deltas: readonly string[]): number {
  let content = "";
  let previous = null as ReturnType<typeof parseDocument> | null;
  let reusedBlocks = 0;

  for (const delta of deltas) {
    content += delta;
    const next = parseDocument(content, previous);
    if (previous) {
      const max = Math.min(previous.blocks.length, next.blocks.length);
      for (let index = 0; index < max; index += 1) {
        if (previous.blocks[index] === next.blocks[index]) reusedBlocks += 1;
      }
    }
    previous = next;
  }

  return reusedBlocks;
}

function parseFinalBlockTrickle(): number {
  let content = stablePrefix;
  let previous = parseDocument(content);
  let reusedLeadingBlocks = 0;

  for (const delta of finalParagraphDeltas) {
    content += delta;
    const next = parseDocument(content, previous);
    const stableBlockCount = Math.min(previous.blocks.length - 1, next.blocks.length - 1);
    for (let index = 0; index < stableBlockCount; index += 1) {
      if (previous.blocks[index] === next.blocks[index]) reusedLeadingBlocks += 1;
    }
    previous = next;
  }

  return reusedLeadingBlocks;
}

function makeStreamingMarkdown(sections: number): string {
  const parts: string[] = [];

  for (let index = 0; index < sections; index += 1) {
    parts.push(
      `## Section ${index + 1}`,
      `Paragraph ${index + 1} with *emphasis*, **strong**, a [link](https://example.com/${index}), and \`code-${index}\`.`,
      `- item ${index + 1}.1\n- [${index % 2 === 0 ? "x" : " "}] task ${index + 1}.2\n  - nested ${index + 1}.3`,
    );

    if (index % 6 === 0) {
      parts.push(`| A | B |\n| -- | --: |\n| ${index} | ${index * 2} |`);
    }

    if (index % 9 === 0) {
      parts.push(`> quoted ${index}\n> with **formatting**`);
    }
  }

  return parts.join("\n\n");
}

function chunk(value: string, size: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += size) chunks.push(value.slice(index, index + size));
  return chunks;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index] ?? 0;
}

function printSummary(results: readonly BenchmarkResult[]): void {
  console.log("get-down internal performance baseline\n");
  console.log("Run with `bun run perf:baseline:save` to store JSON under perf/baselines/.\n");

  const rows = results.map((result) => [
    result.group,
    result.name,
    formatDuration(result.meanNs),
    formatDuration(result.p95Ns),
    formatBytes(result.heapDeltaBytesPerOp),
    formatBytes(result.retainedHeapBytesPerOp),
    result.retainedObjectDeltaPerOp.toFixed(3),
  ]);

  printTable([
    "group",
    "case",
    "mean/op",
    "p95/op",
    "heap Δ/op",
    "retained Δ/op",
    "retained obj/op",
  ], rows);

  console.log("\nNotes:");
  console.log("- heap Δ/op is measured before the post-case GC sweep, so it approximates transient allocation pressure.");
  console.log("- retained Δ/op and retained obj/op are measured after gcAndSweep(); small negative values are normal noise.");
  console.log("- streaming cases include string concatenation plus parseDocument(content, previous), matching the growing-content API.");
  void sink;
}

function printTable(headers: readonly string[], rows: readonly (readonly string[])[]): void {
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)));
  const formatRow = (row: readonly string[]) => row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join("  ");
  console.log(formatRow(headers));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) console.log(formatRow(row));
}

function formatDuration(ns: number): string {
  if (Math.abs(ns) >= 1_000_000) return `${(ns / 1_000_000).toFixed(2)} ms`;
  if (Math.abs(ns) >= 1_000) return `${(ns / 1_000).toFixed(2)} µs`;
  return `${ns.toFixed(0)} ns`;
}

function formatBytes(bytes: number): string {
  const sign = bytes < 0 ? "-" : "";
  const abs = Math.abs(bytes);
  if (abs >= 1024 * 1024) return `${sign}${(abs / 1024 / 1024).toFixed(2)} MiB`;
  if (abs >= 1024) return `${sign}${(abs / 1024).toFixed(2)} KiB`;
  return `${bytes.toFixed(1)} B`;
}

async function saveBaseline(results: readonly BenchmarkResult[]): Promise<string> {
  const directory = "perf/baselines";
  await mkdir(directory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${directory}/${timestamp}.json`;
  await Bun.write(
    path,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        runtime: {
          bun: Bun.version,
          platform: process.platform,
          arch: process.arch,
        },
        results,
      },
      null,
      2,
    ) + "\n",
  );
  return path;
}
