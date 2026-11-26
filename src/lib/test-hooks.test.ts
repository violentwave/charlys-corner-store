// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { testHooksEnabled } from "./test-hooks";

afterEach(() => vi.unstubAllEnvs());

const env = (vars: Record<string, string | undefined>) => {
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
};

describe("testHooksEnabled", () => {
  const local = { EMAIL_DRIVER: "console", ENABLE_TEST_HOOKS: "1" };

  it("is on only with the console driver, the flag, and a local database", () => {
    env({ ...local, DATABASE_URL: "postgres://postgres:postgres@localhost:5432/charly" });
    expect(testHooksEnabled()).toBe(true);
    env({ ...local, DATABASE_URL: "postgres://u:p@127.0.0.1:5433/charly" });
    expect(testHooksEnabled()).toBe(true);
  });

  it("stays off for a remote database even if the other two are set", () => {
    env({ ...local, DATABASE_URL: "postgres://u:p@dpg-abc123.oregon-postgres.render.com/charly" });
    expect(testHooksEnabled()).toBe(false);
  });

  it("stays off without the flag or with the real email driver", () => {
    env({ ...local, ENABLE_TEST_HOOKS: "0", DATABASE_URL: "postgres://u:p@localhost/charly" });
    expect(testHooksEnabled()).toBe(false);
    env({ ...local, EMAIL_DRIVER: "resend", DATABASE_URL: "postgres://u:p@localhost/charly" });
    expect(testHooksEnabled()).toBe(false);
  });
});
