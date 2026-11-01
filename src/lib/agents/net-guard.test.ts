import { describe, expect, it } from "vitest";
import { checkAgentUrl, isPublicAddress } from "./net-guard";

describe("isPublicAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254", "224.0.0.1", "not-an-ip"])(
    "blocks %s",
    (ip) => expect(isPublicAddress(ip)).toBe(false),
  );
  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "76.76.21.21"])("allows %s", (ip) => expect(isPublicAddress(ip)).toBe(true));
});

describe("checkAgentUrl", () => {
  it("accepts a public https endpoint", () => {
    expect(checkAgentUrl("https://agents.example.com/v1/run").ok).toBe(true);
  });
  it.each([
    "http://agents.example.com",
    "https://user:pw@agents.example.com",
    "https://agents.example.com:8443/run",
    "https://localhost/run",
    "https://metadata.google.internal/computeMetadata",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/",
    "https://intranet/",
    "file:///etc/passwd",
    "javascript:alert(1)",
  ])("rejects %s", (u) => expect(checkAgentUrl(u).ok).toBe(false));
});
