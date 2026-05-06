# Performance baselines

Run the internal performance harness from the repository root:

```bash
bun run perf:baseline
```

Save a timestamped JSON snapshot for future comparison:

```bash
bun run perf:baseline:save
```

The harness reports:

- `mean/op` and `p95/op` timing across repeated rounds.
- `heap Δ/op`: heap growth before the post-case GC sweep, a proxy for transient allocation pressure.
- `retained Δ/op` and `retained obj/op`: heap/object growth after `gcAndSweep()`, a proxy for retained memory.

The streaming cases append deltas to a growing string and call `parseDocument(content, previous)` after each delta. That matches the current API and keeps the focus on whether structural sharing avoids re-render churn while new content arrives.

## Current baseline

Captured with `bun run perf:baseline` on May 6, 2026.

| group | case | mean/op | p95/op | heap Δ/op | retained Δ/op | retained obj/op |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| document | `parseDocument:kitchen-sink` | 49.67 µs | 63.14 µs | 104.1 B | 26.0 B | 0.092 |
| document | `parseDocument:reuse-unchanged` | 50.44 µs | 53.85 µs | 32.5 B | 9.5 B | 0.047 |
| inline | `parseInlines:kitchen-sink` | 14.79 µs | 16.02 µs | 13.7 B | 1.2 B | 0.006 |
| inline | `hasUnclosedCodeSpan` | 74 ns | 76 ns | 0.0 B | 0.1 B | 0.001 |
| inline | `normalizeReferenceLabel` | 150 ns | 172 ns | 0.0 B | 0.0 B | 0.000 |
| streaming | `stream:96-byte-chunks` | 102.76 ms | 108.34 ms | 94.95 KiB | -15.09 KiB | -147.280 |
| streaming | `stream:line-chunks` | 506.08 ms | 515.03 ms | 191.04 KiB | -15.23 KiB | -108.310 |
| streaming | `stream:final-block-trickle` | 12.31 ms | 12.65 ms | 2.85 KiB | 58.3 B | 0.623 |
| react | `renderToStaticMarkup:GetDown` | 176.62 µs | 367.22 µs | 458.8 B | 166.7 B | 0.246 |
