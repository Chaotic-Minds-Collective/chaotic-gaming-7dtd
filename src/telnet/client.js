import net from "node:net";

export const READ_ONLY_COMMANDS = new Set(["gettime", "listplayers", "listplayerids", "version"]);

function waitForText(socket, predicate, timeoutMs) {
  return new Promise((resolve, reject) => {
    let collected = "";
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    };
    const onData = (chunk) => {
      collected += chunk.toString("utf8");
      if (predicate(collected)) {
        cleanup();
        resolve(collected);
      }
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new Error("7DTD Telnet connection closed unexpectedly."));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for the 7DTD Telnet server."));
    }, timeoutMs);

    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

function cleanCommandOutput(output) {
  return output
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/^Logon successful\.\s*$/gim, "")
    .replace(/^\*{3} Connected with 7DTD server\.\s*$/gim, "")
    .replace(/^Press 'help' to get a list of all commands\.\s*$/gim, "")
    .trim();
}

function collectCommandOutput(socket, command, { quietMs, timeoutMs, maxOutputBytes }) {
  return new Promise((resolve, reject) => {
    let output = "";
    let quietTimer;
    const cleanup = () => {
      clearTimeout(quietTimer);
      clearTimeout(hardTimer);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    };
    const finish = () => {
      cleanup();
      resolve(cleanCommandOutput(output));
    };
    const onData = (chunk) => {
      output += chunk.toString("utf8");
      if (Buffer.byteLength(output, "utf8") > maxOutputBytes) {
        cleanup();
        reject(new Error("7DTD Telnet response exceeded the configured size limit."));
        return;
      }
      const cleaned = cleanCommandOutput(output);
      if (cleaned) {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(finish, quietMs);
      }
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => finish();
    const hardTimer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for the 7DTD command response."));
    }, timeoutMs);

    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
    socket.write(`${command}\n`, (error) => {
      if (error) {
        cleanup();
        reject(error);
      }
    });
    quietTimer = setTimeout(finish, timeoutMs);
  });
}

export class SevenDaysTelnetClient {
  constructor({
    host,
    port = 8081,
    password,
    connectTimeoutMs = 5_000,
    commandTimeoutMs = 8_000,
    quietMs = 350,
    maxOutputBytes = 256_000,
  }) {
    if (!host || typeof host !== "string") throw new TypeError("A Telnet host is required.");
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new TypeError("Telnet port must be between 1 and 65535.");
    if (typeof password !== "string" || password.length === 0) {
      throw new TypeError("A non-empty Telnet password is required for remote administration.");
    }
    this.options = { host, port, password, connectTimeoutMs, commandTimeoutMs, quietMs, maxOutputBytes };
  }

  async execute(command) {
    if (!READ_ONLY_COMMANDS.has(command)) {
      throw new Error("Only explicitly allowlisted read-only commands are enabled in this adapter.");
    }

    const { host, port, password, connectTimeoutMs, commandTimeoutMs, quietMs, maxOutputBytes } = this.options;
    const socket = net.createConnection({ host, port });
    socket.setEncoding("utf8");
    socket.setNoDelay(true);

    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          socket.destroy();
          reject(new Error("Timed out connecting to the 7DTD Telnet interface."));
        }, connectTimeoutMs);
        socket.once("connect", () => {
          clearTimeout(timer);
          resolve();
        });
        socket.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
      });

      await waitForText(socket, (text) => /please enter password:/i.test(text), connectTimeoutMs);
      socket.write(`${password}\n`);

      const authentication = await waitForText(
        socket,
        (text) => /password incorrect|too many failed login attempts/i.test(text)
          || (/logon successful\./i.test(text) && /press 'help' to get a list of all commands/i.test(text)),
        commandTimeoutMs
      );
      if (!/logon successful\./i.test(authentication)) {
        throw new Error("7DTD Telnet authentication failed.");
      }

      return await collectCommandOutput(socket, command, {
        quietMs,
        timeoutMs: commandTimeoutMs,
        maxOutputBytes,
      });
    } finally {
      if (!socket.destroyed) {
        socket.write("exit\n");
        socket.end();
      }
    }
  }
}
