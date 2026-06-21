import { describe, it, expect, vi } from "vitest";
import { withRetry, DbTimeoutError } from "@/lib/db/with-timeout";

describe("withRetry — stale-connection recovery", () => {
  it("returns the first attempt's value when it resolves in time", async () => {
    const make = vi.fn(async () => "ok");
    const result = await withRetry(make, { attempts: 2, timeoutMs: 50, label: "t" });
    expect(result).toBe("ok");
    expect(make).toHaveBeenCalledTimes(1); // no retry needed
  });

  it("retries on a fresh call when the first attempt hangs past the timeout", async () => {
    let call = 0;
    // Attempt 1 simulates a stale connection: a promise that never settles
    // within the timeout. Attempt 2 (the "fresh connection") resolves fast.
    const make = vi.fn(() => {
      call += 1;
      if (call === 1) return new Promise<string>(() => {}); // hangs forever
      return Promise.resolve("recovered");
    });
    const result = await withRetry(make, { attempts: 2, timeoutMs: [20, 50], label: "dashboard" });
    expect(result).toBe("recovered");
    expect(make).toHaveBeenCalledTimes(2); // first hung → retried
  });

  it("re-invokes the factory each attempt (does not re-await the same promise)", async () => {
    // A factory that builds a NEW promise per call is essential — otherwise the
    // retry would just await the same stuck query again.
    const promises: Array<{ resolved: boolean }> = [];
    const make = vi.fn(() => {
      const handle = { resolved: false };
      promises.push(handle);
      if (promises.length === 1) return new Promise<string>(() => {});
      return Promise.resolve("second-promise");
    });
    await withRetry(make, { attempts: 2, timeoutMs: 20 });
    expect(promises.length).toBe(2); // two distinct promises created
  });

  it("throws the last error when every attempt fails", async () => {
    const make = vi.fn(() => new Promise<string>(() => {})); // always hangs
    await expect(
      withRetry(make, { attempts: 2, timeoutMs: 20, label: "always-stale" }),
    ).rejects.toBeInstanceOf(DbTimeoutError);
    expect(make).toHaveBeenCalledTimes(2);
  });

  it("propagates a real (non-timeout) error and still retries", async () => {
    let call = 0;
    const make = vi.fn(() => {
      call += 1;
      if (call === 1) return Promise.reject(new Error("connection reset"));
      return Promise.resolve("ok-after-error");
    });
    const result = await withRetry(make, { attempts: 2, timeoutMs: 50 });
    expect(result).toBe("ok-after-error");
    expect(make).toHaveBeenCalledTimes(2);
  });
});
