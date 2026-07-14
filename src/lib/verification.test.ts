import { describe, expect, it } from "vitest";
import { isWithinCooldown } from "@/lib/verification";

describe("isWithinCooldown", () => {
  const now = new Date("2026-07-14T12:00:00Z");

  it("is true for a token created seconds ago", () => {
    // created now → expires = now + 24 h
    const expires = new Date(now.getTime() + 24 * 3_600_000);
    expect(isWithinCooldown(expires, 24, now)).toBe(true);
  });

  it("is false once the cooldown has elapsed", () => {
    // created 2 min ago → expires = now + 24 h − 2 min
    const expires = new Date(now.getTime() + 24 * 3_600_000 - 2 * 60_000);
    expect(isWithinCooldown(expires, 24, now)).toBe(false);
  });

  it("works for the 1-hour reset TTL", () => {
    const expires = new Date(now.getTime() + 3_600_000 - 30_000); // created 30 s ago
    expect(isWithinCooldown(expires, 1, now)).toBe(true);
  });
});
