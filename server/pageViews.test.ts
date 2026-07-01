import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the db module so tests don't need a real database connection
vi.mock("./db", () => ({
  incrementPageViews: vi.fn(),
  getPageViews: vi.fn(),
}));

import { incrementPageViews, getPageViews } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("pageViews router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("increment: calls incrementPageViews and returns count", async () => {
    (incrementPageViews as ReturnType<typeof vi.fn>).mockResolvedValue(42);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.pageViews.increment();

    expect(incrementPageViews).toHaveBeenCalledOnce();
    expect(result).toEqual({ count: 42 });
  });

  it("get: calls getPageViews and returns count", async () => {
    (getPageViews as ReturnType<typeof vi.fn>).mockResolvedValue(100);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.pageViews.get();

    expect(getPageViews).toHaveBeenCalledOnce();
    expect(result).toEqual({ count: 100 });
  });

  it("increment: returns 0 when db returns 0 (no db available)", async () => {
    (incrementPageViews as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.pageViews.increment();

    expect(result).toEqual({ count: 0 });
  });

  it("get: returns 0 when db returns 0 (no db available)", async () => {
    (getPageViews as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.pageViews.get();

    expect(result).toEqual({ count: 0 });
  });

  it("increment: handles large view counts correctly", async () => {
    (incrementPageViews as ReturnType<typeof vi.fn>).mockResolvedValue(999999);

    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.pageViews.increment();

    expect(result).toEqual({ count: 999999 });
  });
});
