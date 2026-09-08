import { expect, test } from "bun:test";

import { YazioApiClient } from "../src/yazio-api";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("authenticates with the Swagger-required form body and reuses the token", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/oauth/token")) {
      expect(init?.headers instanceof Headers ? init.headers.get("content-type") : undefined).toBe("application/x-www-form-urlencoded");
      expect(String(init?.body)).toMatch(/grant_type=password/);
      return jsonResponse({ access_token: "access-1", refresh_token: "refresh-1", token_type: "bearer", expires_in: 3600 });
    }
    expect(init?.headers instanceof Headers ? init.headers.get("authorization") : undefined).toBe("Bearer access-1");
    return jsonResponse({ email: "user@example.com", first_name: "Test", last_name: "User" });
  };

  const api = new YazioApiClient({ username: "user@example.com", password: "secret", fetch });
  await api.getUser();
  await api.getUser();

  expect(calls.filter(({ url }) => url.endsWith("/oauth/token")).length).toBe(1);
  expect(calls.filter(({ url }) => url.endsWith("/user")).length).toBe(2);
});

test("uses exact public API paths and payload shapes for mutations", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/oauth/token")) {
      return jsonResponse({ access_token: "access-1", token_type: "bearer", expires_in: 3600 });
    }
    return new Response(null, { status: 204 });
  };

  const api = new YazioApiClient({ username: "user@example.com", password: "secret", fetch });
  await api.addConsumedItem({
    product_id: "product-1",
    date: "2026-01-02",
    daytime: "dinner",
    amount: 150,
    serving: null,
    serving_quantity: null,
  });
  await api.removeConsumedItem("item-1");
  await api.addWaterIntake({ date: "2026-01-02 12:00:00", water_intake: 750 });

  const mutations = calls.filter(({ init }) => init?.method && init.method !== "POST" || init?.method === "POST").slice(1);
  const add = mutations.find(({ url, init }) => url.endsWith("/user/consumed-items") && initMethod(init) === "POST");
  expect(add).toBeDefined();
  expect(add?.init?.headers instanceof Headers ? add.init.headers.get("content-type") : undefined).toBe("application/json");
  const addBody = JSON.parse(String(add?.init?.body)) as { products: Array<Record<string, unknown>> };
  expect(addBody.products[0]?.product_id).toBe("product-1");
  expect(addBody.products[0]?.date).toBe("2026-01-02");
  expect(addBody.products[0]?.daytime).toBe("dinner");
  expect(typeof addBody.products[0]?.id).toBe("string");

  const remove = calls.find(({ init, url }) => url.endsWith("/user/consumed-items") && initMethod(init) === "DELETE");
  expect(JSON.parse(String(remove?.init?.body))).toEqual(["item-1"]);
  const water = calls.find(({ init, url }) => url.endsWith("/user/water-intake") && initMethod(init) === "POST");
  expect(JSON.parse(String(water?.init?.body))).toEqual([{ date: "2026-01-02 12:00:00", water_intake: 750 }]);
});

test("adds a quick-add simple product with estimated nutrients", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/oauth/token")) {
      return jsonResponse({ access_token: "access-1", token_type: "bearer", expires_in: 3600 });
    }
    return new Response(null, { status: 204 });
  };

  const api = new YazioApiClient({ username: "user@example.com", password: "secret", fetch });
  const id = await api.addSimpleProduct({
    name: "Homemade sandwich",
    date: "2026-01-02 12:00:00",
    daytime: "lunch",
    energy: 520,
    carb: 48,
    protein: 27,
    fat: 22,
  });

  const call = calls.find(({ url, init }) => url.endsWith("/user/consumed-items") && initMethod(init) === "POST");
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  expect(call).toBeDefined();
  expect(JSON.parse(String(call?.init?.body))).toEqual({
    products: [],
    recipe_portions: [],
    simple_products: [{
      id,
      date: "2026-01-02 12:00:00",
      daytime: "lunch",
      type: "simple_product",
      name: "Homemade sandwich",
      nutrients: {
        "energy.energy": 520,
        "nutrient.carb": 48,
        "nutrient.protein": 27,
        "nutrient.fat": 22,
      },
    }],
  });
});

test("encodes search filters and refreshes once after a 401", async () => {
  const calls: string[] = [];
  const tokenBodies: string[] = [];
  let searchRequests = 0;
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push(`${url} ${init?.headers instanceof Headers ? init.headers.get("authorization") ?? "" : ""}`);
    if (url.endsWith("/oauth/token")) {
      const body = String(init?.body);
      tokenBodies.push(body);
      if (body.includes("grant_type=refresh_token")) {
        return jsonResponse({ access_token: "access-2", refresh_token: "refresh-2", token_type: "bearer", expires_in: 3600 });
      }
      return jsonResponse({ access_token: "access-1", refresh_token: "refresh-1", token_type: "bearer", expires_in: 3600 });
    }
    if (url.includes("/user?")) return jsonResponse({});
    if (url.includes("/products/search")) {
      searchRequests += 1;
      if (searchRequests === 1) return jsonResponse({ error: "expired" }, 401);
      return jsonResponse([]);
    }
    return jsonResponse({});
  };

  const api = new YazioApiClient({ username: "user@example.com", password: "secret", fetch });
  await api.searchProducts({ query: "ice cream", sex: "female", countries: ["DE", "US"], locales: ["de_DE"] });
  expect(calls.some((call) => call.includes("query=ice+cream") && call.includes("countries=DE%2CUS") && call.includes("locales=de_DE"))).toBe(true);
  expect(calls.filter((call) => call.includes("/products/search")).map((call) => call.split(" ").at(-1))).toEqual([
    "access-1",
    "access-2",
  ]);
  expect(tokenBodies.length).toBe(2);
  expect(tokenBodies[0] ?? "").toMatch(/grant_type=password/);
  expect(tokenBodies[1] ?? "").toMatch(/grant_type=refresh_token/);
});

test("replays a mutation with the refreshed token after a 401", async () => {
  const mutationCalls: Array<{ authorization: string | null; body: string }> = [];
  const tokenBodies: string[] = [];
  let mutationCount = 0;
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.endsWith("/oauth/token")) {
      const body = String(init?.body);
      tokenBodies.push(body);
      if (body.includes("grant_type=refresh_token")) {
        return jsonResponse({ access_token: "access-2", refresh_token: "refresh-2", token_type: "bearer", expires_in: 3600 });
      }
      return jsonResponse({ access_token: "access-1", refresh_token: "refresh-1", token_type: "bearer", expires_in: 3600 });
    }
    if (url.endsWith("/user/consumed-items") && init?.method === "POST") {
      mutationCount += 1;
      mutationCalls.push({
        authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
        body: String(init.body),
      });
      if (mutationCount === 1) return jsonResponse({ error: "expired" }, 401);
      return jsonResponse({ ok: true });
    }
    return jsonResponse({});
  };

  const api = new YazioApiClient({ username: "user@example.com", password: "secret", fetch });
  await api.addConsumedItem({
    product_id: "product-1",
    date: "2026-01-02",
    daytime: "dinner",
    amount: 150,
    serving: null,
    serving_quantity: null,
  });

  expect(mutationCalls.map(({ authorization }) => authorization)).toEqual([
    "Bearer access-1",
    "Bearer access-2",
  ]);
  expect(mutationCalls[0]?.body).toBe(mutationCalls[1]?.body);
  expect(tokenBodies).toHaveLength(2);
  expect(tokenBodies[1] ?? "").toMatch(/refresh_token=refresh-1/);
});

test("retains a refresh token when a rotated token response omits it", async () => {
  const tokenBodies: string[] = [];
  let userCalls = 0;
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.endsWith("/oauth/token")) {
      const body = String(init?.body);
      tokenBodies.push(body);
      if (body.includes("grant_type=refresh_token")) {
        const refreshCount = tokenBodies.filter((value) => value.includes("grant_type=refresh_token")).length;
        return refreshCount === 1
          ? jsonResponse({ access_token: "access-2", token_type: "bearer", expires_in: 3600 })
          : jsonResponse({ access_token: "access-3", token_type: "bearer", expires_in: 3600 });
      }
      return jsonResponse({ access_token: "access-1", refresh_token: "refresh-1", token_type: "bearer", expires_in: 3600 });
    }
    userCalls += 1;
    if (userCalls === 1 || userCalls === 3) return jsonResponse({ error: "expired" }, 401);
    return jsonResponse({ email: "user@example.com" });
  };

  const api = new YazioApiClient({ username: "user@example.com", password: "secret", fetch });
  await api.getUser();
  await api.getUser();

  expect(tokenBodies).toHaveLength(3);
  expect(tokenBodies[1] ?? "").toMatch(/grant_type=refresh_token/);
  expect(tokenBodies[2] ?? "").toMatch(/grant_type=refresh_token/);
  expect(tokenBodies[2] ?? "").toMatch(/refresh_token=refresh-1/);
});

test("refreshes before a known token expiry", async () => {
  let now = 1_000_000;
  const tokenBodies: string[] = [];
  const authorizations: string[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.endsWith("/oauth/token")) {
      const body = String(init?.body);
      tokenBodies.push(body);
      if (body.includes("grant_type=refresh_token")) {
        return jsonResponse({ access_token: "access-2", refresh_token: "refresh-2", token_type: "bearer", expires_in: 3600 });
      }
      return jsonResponse({ access_token: "access-1", refresh_token: "refresh-1", token_type: "bearer", expires_in: 60 });
    }
    authorizations.push(init?.headers instanceof Headers ? init.headers.get("authorization") ?? "" : "");
    return jsonResponse({ email: "user@example.com" });
  };

  const api = new YazioApiClient({ username: "user@example.com", password: "secret", fetch, now: () => now });
  await api.getUser();
  now += 31_000;
  await api.getUser();

  expect(authorizations).toEqual(["Bearer access-1", "Bearer access-2"]);
  expect(tokenBodies).toHaveLength(2);
  expect(tokenBodies[1] ?? "").toMatch(/grant_type=refresh_token/);
});

function initMethod(init?: RequestInit): string | undefined {
  return init?.method;
}
