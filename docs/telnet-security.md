# 7DTD Telnet Security

The built-in Telnet interface is a privileged server console, not an internet-facing public API.

- Keep Telnet bound to loopback or a private management network.
- Set a strong unique Telnet password.
- Do not expose the Telnet port to the public internet.
- Prefer VPN/private networking over public port forwarding.
- Store Telnet and Core credentials in the host's secret environment, never in Git.
- The current adapter intentionally supports only read-only commands.
- A future write-command capability must have a separate permission model, command allowlist, audit trail and explicit authorization boundary.

The adapter does not change serverconfig.xml or firewall settings. Operators must configure these manually after review.
