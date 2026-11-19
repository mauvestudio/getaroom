// Bun accepts WebSocket upgrade headers in its constructor options.
const BunWebSocket = WebSocket as unknown as new (
  url: string,
  options: { headers: Record<string, string> },
) => WebSocket;

export function openPaseoWebSocket(url: string, password?: string, protocols?: string[]): WebSocket {
  if (!password) return new WebSocket(url, protocols);

  // Preserve header authentication for daemons that support it. Passwords
  // with whitespace or Unicode use Paseo's native hello authentication.
  const socket = /^[!-~]+$/.test(password)
    ? new BunWebSocket(url, { headers: { Authorization: `Bearer ${password}` } })
    : new WebSocket(url);
  const send = socket.send.bind(socket);
  let authenticatedHelloSent = false;
  socket.send = (data) => {
    if (!authenticatedHelloSent && typeof data === "string") {
      try {
        const message = JSON.parse(data);
        if (message?.type === "hello") {
          data = JSON.stringify({ ...message, auth: { kind: "password", password } });
          authenticatedHelloSent = true;
        }
      } catch {
        // Forward messages that are not JSON as received.
      }
    }
    send(data);
  };
  return socket;
}
