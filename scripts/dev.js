import { createServer } from "node:http";
import worker from "../out/telegram-bot.js";

globalThis.env = {
  config: JSON.parse(process.env.CONFIG || "{}"),
  EC_URL: process.env.EC_URL,
};

const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, "http://localhost");
    const init = { method: incoming.method, headers: incoming.headers };
    if (!["GET", "HEAD"].includes(incoming.method)) {
      init.body = incoming;
      init.duplex = "half";
    }
    const response = await worker.fetch(new Request(url, init));
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500);
    outgoing.end("Internal Server Error");
  }
});

server.listen(8787, "127.0.0.1", () => {
  console.log(`Telegram bot dev server: http://127.0.0.1:${server.address().port}`);
});
