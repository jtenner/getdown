import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GetDown } from "../src/index";

describe("GetDown", () => {
  test("exposes a single component that accepts markdown content", () => {
    const html = renderToStaticMarkup(<GetDown content="# Hello" />);

    expect(html).toBe("");
  });
});
