import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { SevenDaysTelnetClient } from "../src/telnet/client.js";

async function withFakeTelnet(handler, run) {
  const server = net.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await run(address.port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("authenticates to the Telnet prompt and runs an allowlisted read-only command", async () => {
  await withFakeTelnet((socket) => {
    socket.write("Please enter password:\r\n");
    let input = "";
    let authenticated = false;
    let commandSent = false;
    socket.on("data", (chunk) => {
      input += chunk.toString();
      if (!authenticated && input.includes("secret\n")) {
        authenticated = true;
        socket.write("Logon successful.\r\n*** Connected with 7DTD server.\r\nPress 'help' to get a list of all commands.\r\n");
      }
      if (authenticated && !commandSent && input.includes("gettime\n")) {
        commandSent = true;
        setTimeout(() => socket.write("Day 3, 07:00\r\n"), 10);
      }
      if (input.includes("exit\n")) socket.end();
    });
  }, async (port) => {
    const client = new SevenDaysTelnetClient({
      host: "127.0.0.1",
      port,
      password: "secret",
      quietMs: 30,
      commandTimeoutMs: 500,
    });
    const output = await client.execute("gettime");
    assert.match(output, /Day 3, 07:00/);
  });
});

test("rejects a password failure without sending a command", async () => {
  await withFakeTelnet((socket) => {
    socket.write("Please enter password:\r\n");
    socket.on("data", () => socket.write("Password incorrect, please enter password:\r\n"));
  }, async (port) => {
    const client = new SevenDaysTelnetClient({
      host: "127.0.0.1",
      port,
      password: "wrong",
      commandTimeoutMs: 500,
    });
    await assert.rejects(client.execute("gettime"), /authentication failed/i);
  });
});

test("rejects commands outside the read-only allowlist", async () => {
  const client = new SevenDaysTelnetClient({ host: "127.0.0.1", port: 8081, password: "secret" });
  await assert.rejects(client.execute("shutdown"), /allowlisted read-only commands/);
});
