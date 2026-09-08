import { expect, test } from "bun:test";

import { verifyYazioLogin, type YazioLoginProbe } from "../src/startup";

test("verifies login before startup continues", async () => {
  let calls = 0;
  const api: YazioLoginProbe = {
    async getUser() {
      calls += 1;
      return { email: "user@example.com" };
    },
  };

  await verifyYazioLogin(api);

  expect(calls).toBe(1);
});

test("fails startup when login fails", async () => {
  const api: YazioLoginProbe = {
    async getUser() {
      throw new Error("invalid credentials");
    },
  };

  await expect(verifyYazioLogin(api)).rejects.toThrow("YAZIO login failed: invalid credentials");
});
