import { expect, test } from "bun:test";
import { readSse } from "./sse";

test("découpe les évènements même coupés entre deux morceaux", async () => {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(enc.encode('data: {"delta":"Bo"}\n\ndata: {"del'));
      c.enqueue(enc.encode('ta":"njour"}\n\ndata: {"done":true}\n\n'));
      c.close();
    },
  });
  const got: any[] = [];
  await readSse(stream, (e) => got.push(e));
  expect(got).toEqual([{ delta: "Bo" }, { delta: "njour" }, { done: true }]);
});
