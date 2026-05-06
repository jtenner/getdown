import { describe, expect, test } from "bun:test";
import { parseDocument } from "./document";

describe("parseDocument structural sharing", () => {
  test("reuses unchanged leading blocks when content appends to the final block", () => {
    const previous = parseDocument("# Title\n\nHello wor");
    const next = parseDocument("# Title\n\nHello world", previous);

    expect(next.blocks).toHaveLength(2);
    expect(next.blocks[0]).toBe(previous.blocks[0]);
    expect(next.blocks[1]).not.toBe(previous.blocks[1]);
    expect(next.blocks[1]?.id).toBe(previous.blocks[1]?.id);
  });

  test("reuses all blocks when normalized content is unchanged", () => {
    const previous = parseDocument("Alpha\r\n\r\nBeta");
    const next = parseDocument("Alpha\n\nBeta", previous);

    expect(next.blocks[0]).toBe(previous.blocks[0]);
    expect(next.blocks[1]).toBe(previous.blocks[1]);
  });
});
