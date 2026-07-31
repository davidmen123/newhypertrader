import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ADMIN_KEY_HEADER, isAdminKeyConfigured, isAdminRequest } from "./_core/adminKey";

const SECRET = "correct-horse-battery-staple";
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.ADMIN_KEY;
  process.env.ADMIN_KEY = SECRET;
});

afterEach(() => {
  if (saved === undefined) delete process.env.ADMIN_KEY;
  else process.env.ADMIN_KEY = saved;
});

describe("isAdminRequest", () => {
  it("accepts the configured key", () => {
    expect(isAdminRequest({ [ADMIN_KEY_HEADER]: SECRET })).toBe(true);
  });

  it("rejects a wrong key", () => {
    expect(isAdminRequest({ [ADMIN_KEY_HEADER]: "nope" })).toBe(false);
  });

  it("rejects a key of the right length but wrong content", () => {
    expect(isAdminRequest({ [ADMIN_KEY_HEADER]: "x".repeat(SECRET.length) })).toBe(false);
  });

  it("rejects a prefix of the real key", () => {
    expect(isAdminRequest({ [ADMIN_KEY_HEADER]: SECRET.slice(0, -1) })).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(isAdminRequest({})).toBe(false);
    expect(isAdminRequest(undefined)).toBe(false);
  });

  it("rejects an empty header", () => {
    expect(isAdminRequest({ [ADMIN_KEY_HEADER]: "" })).toBe(false);
  });

  it("reads the first value when the header arrives repeated", () => {
    expect(isAdminRequest({ [ADMIN_KEY_HEADER]: [SECRET, "nope"] })).toBe(true);
    expect(isAdminRequest({ [ADMIN_KEY_HEADER]: ["nope", SECRET] })).toBe(false);
  });

  it("fails closed when no key is configured, even if one is sent", () => {
    delete process.env.ADMIN_KEY;

    expect(isAdminRequest({ [ADMIN_KEY_HEADER]: SECRET })).toBe(false);
    expect(isAdminRequest({ [ADMIN_KEY_HEADER]: "" })).toBe(false);
  });

  it("treats an empty ADMIN_KEY as unconfigured rather than as a valid empty key", () => {
    process.env.ADMIN_KEY = "";

    expect(isAdminRequest({ [ADMIN_KEY_HEADER]: "" })).toBe(false);
    expect(isAdminKeyConfigured()).toBe(false);
  });
});

describe("isAdminKeyConfigured", () => {
  it("reports whether the deployment has a key", () => {
    expect(isAdminKeyConfigured()).toBe(true);

    delete process.env.ADMIN_KEY;
    expect(isAdminKeyConfigured()).toBe(false);
  });
});
