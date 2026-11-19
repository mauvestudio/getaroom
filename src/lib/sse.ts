/** Lit un flux SSE `data: {json}` renvoyé par le relais et appelle `onEvent` pour chaque évènement. */
export async function readSse(body: ReadableStream<Uint8Array>, onEvent: (e: any) => void): Promise<void> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue;
        try { onEvent(JSON.parse(line.slice(5).trim())); } catch { /* évènement illisible */ }
      }
    }
  }
}
