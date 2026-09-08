import { expect, test } from "bun:test";

import {
  AddConsumedItemInputSchema,
  AddConsumedItemsInputSchema,
  AddWaterIntakesInputSchema,
  RemoveConsumedItemsInputSchema,
} from "../src/schemas";
import { YazioApiClient } from "../src/yazio-api";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function tokenRequestBody(init?: RequestInit): Record<string, string> {
  return JSON.parse(String(init?.body)) as Record<string, string>;
}

test("requires a timestamp for regular diary writes", () => {
  const input = {
    product_id: "product-1",
    date: "2026-01-02 09:00:00",
    daytime: "breakfast" as const,
    amount: 200,
  };

  expect(AddConsumedItemInputSchema.safeParse(input).success).toBe(true);
  expect(AddConsumedItemInputSchema.safeParse({ ...input, date: "2026-01-02" }).success).toBe(false);
});

test("validates non-empty bulk diary mutation inputs", () => {
  const item = {
    product_id: "product-1",
    date: "2026-01-02 09:00:00",
    daytime: "breakfast" as const,
    amount: 200,
  };

  expect(AddConsumedItemsInputSchema.safeParse({ items: [item] }).success).toBe(true);
  expect(AddConsumedItemsInputSchema.safeParse({ items: [] }).success).toBe(false);
  expect(RemoveConsumedItemsInputSchema.safeParse({
    items: [
      { itemId: "item-1", bucket: "products" },
      { itemId: "item-2", bucket: "simple_products" },
    ],
  }).success).toBe(true);
  expect(RemoveConsumedItemsInputSchema.safeParse({
    items: [
      { itemId: "item-1", bucket: "products" },
      { itemId: "item-1", bucket: "products" },
    ],
  }).success).toBe(false);
  expect(RemoveConsumedItemsInputSchema.safeParse({
    items: [{ itemId: "item-1", bucket: "products" }],
  }).success).toBe(true);
  expect(AddWaterIntakesInputSchema.safeParse({
    entries: [{ date: "2026-01-02 08:00:00", water_intake: 500 }],
  }).success).toBe(true);
  expect(AddWaterIntakesInputSchema.safeParse({ entries: [] }).success).toBe(false);
});

test("authenticates with the v22 JSON body and reuses the token", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/oauth/token")) {
      expect(init?.headers instanceof Headers ? init.headers.get("content-type") : undefined).toBe("application/json");
      expect(init?.headers instanceof Headers ? init.headers.get("user-agent") : undefined).toContain("YAZIO/");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        grant_type: "password",
        username: "user@example.com",
        password: "secret",
      });
      expect(JSON.parse(String(init?.body)).client_id).toBeString();
      expect(JSON.parse(String(init?.body)).client_secret).toBeString();
      return jsonResponse({ access_token: "access-1", refresh_token: "refresh-1", token_type: "bearer", expires_in: 3600 });
    }
    expect(init?.headers instanceof Headers ? init.headers.get("authorization") : undefined).toBe("Bearer access-1");
    return jsonResponse({ email: "user@example.com", first_name: "Test", last_name: "User" });
  };

  const api = new YazioApiClient({ username: "user@example.com", password: "secret", fetch });
  await api.getUser();
  await api.getUser();

  expect(calls.filter(({ url }) => url.endsWith("/oauth/token")).length).toBe(1);
  expect(calls.find(({ url }) => url.endsWith("/oauth/token"))?.url).toContain("/v22/oauth/token");
  expect(calls.filter(({ url }) => url.endsWith("/user")).length).toBe(2);
});

test("uses exact v22 API paths and payload shapes for mutations", async () => {
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
    date: "2026-01-02 19:30:00",
    daytime: "dinner",
    amount: 150,
    serving: null,
    serving_quantity: null,
  });
  await api.removeConsumedItem("item-1", "products");
  await api.addWaterIntake({ date: "2026-01-02 12:00:00", water_intake: 750 });

  const mutations = calls.filter(({ init }) => init?.method && init.method !== "POST" || init?.method === "POST").slice(1);
  const add = mutations.find(({ url, init }) => url.endsWith("/user/consumed-items") && initMethod(init) === "POST");
  expect(add).toBeDefined();
  expect(add?.init?.headers instanceof Headers ? add.init.headers.get("content-type") : undefined).toBe("application/json");
  const addBody = JSON.parse(String(add?.init?.body)) as { products: Array<Record<string, unknown>> };
  expect(addBody.products[0]?.product_id).toBe("product-1");
  expect(addBody.products[0]?.date).toBe("2026-01-02 19:30:00");
  expect(addBody.products[0]?.daytime).toBe("dinner");
  expect(typeof addBody.products[0]?.id).toBe("string");

  const remove = calls.find(({ init, url }) => url.endsWith("/user/consumed-items") && initMethod(init) === "DELETE");
  expect(JSON.parse(String(remove?.init?.body))).toEqual({ products: "item-1" });
  const water = calls.find(({ init, url }) => url.endsWith("/user/water-intake") && initMethod(init) === "POST");
  expect(JSON.parse(String(water?.init?.body))).toEqual([{ date: "2026-01-02 12:00:00", water_intake: 750 }]);
});

test("uses the documented v22 payloads for bulk diary mutations", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/oauth/token")) {
      return jsonResponse({ access_token: "access-1", token_type: "bearer", expires_in: 3600 });
    }
    return jsonResponse({ ok: true });
  };

  const api = new YazioApiClient({ username: "user@example.com", password: "secret", fetch });
  const added = await api.addConsumedItems([
    {
      product_id: "product-1",
      date: "2026-01-02 08:30:00",
      daytime: "breakfast",
      amount: 100,
      serving: "gram",
      serving_quantity: 100,
    },
    {
      product_id: "product-2",
      date: "2026-01-02 19:30:00",
      daytime: "dinner",
      amount: 150,
      serving: null,
      serving_quantity: null,
    },
  ]);
  const removed = await api.removeConsumedItems([
    { itemId: "item-1", bucket: "products" },
    { itemId: "item-2", bucket: "simple_products" },
  ]);
  await api.addWaterIntakes([
    { date: "2026-01-02 08:00:00", water_intake: 500 },
    { date: "2026-01-02 12:00:00", water_intake: 750 },
  ]);

  const add = calls.find(({ url, init }) => url.endsWith("/user/consumed-items") && initMethod(init) === "POST");
  expect(add).toBeDefined();
  const addBody = JSON.parse(String(add?.init?.body)) as {
    products: Array<Record<string, unknown>>;
    recipe_portions: unknown[];
    simple_products: unknown[];
  };
  expect(addBody.recipe_portions).toEqual([]);
  expect(addBody.simple_products).toEqual([]);
  expect(addBody.products).toHaveLength(2);
  expect(added.ids).toHaveLength(2);
  expect(addBody.products.map((product) => product.id)).toEqual(added.ids);
  expect(addBody.products.map((product) => product.date)).toEqual([
    "2026-01-02 08:30:00",
    "2026-01-02 19:30:00",
  ]);

  const removes = calls.filter(({ url, init }) => url.endsWith("/user/consumed-items") && initMethod(init) === "DELETE");
  expect(removes).toHaveLength(2);
  expect(removes.map(({ init }) => JSON.parse(String(init?.body)))).toEqual([
    { products: "item-1" },
    { simple_products: "item-2" },
  ]);
  expect(removed.removed).toEqual([
    { itemId: "item-1", bucket: "products" },
    { itemId: "item-2", bucket: "simple_products" },
  ]);
  const water = calls.find(({ url, init }) => url.endsWith("/user/water-intake") && initMethod(init) === "POST");
  expect(JSON.parse(String(water?.init?.body))).toEqual([
    { date: "2026-01-02 08:00:00", water_intake: 500 },
    { date: "2026-01-02 12:00:00", water_intake: 750 },
  ]);
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
      if (tokenRequestBody(init).grant_type === "refresh_token") {
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
  expect(tokenRequestBody({ body: tokenBodies[0] }).grant_type).toBe("password");
  expect(tokenRequestBody({ body: tokenBodies[1] }).grant_type).toBe("refresh_token");
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
      if (tokenRequestBody(init).grant_type === "refresh_token") {
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
    date: "2026-01-02 19:30:00",
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
  expect(tokenRequestBody({ body: tokenBodies[1] }).refresh_token).toBe("refresh-1");
});

test("retains a refresh token when a rotated token response omits it", async () => {
  const tokenBodies: string[] = [];
  let userCalls = 0;
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.endsWith("/oauth/token")) {
      const body = String(init?.body);
      tokenBodies.push(body);
      if (tokenRequestBody(init).grant_type === "refresh_token") {
        const refreshCount = tokenBodies.filter((value) => tokenRequestBody({ body: value }).grant_type === "refresh_token").length;
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
  expect(tokenRequestBody({ body: tokenBodies[1] }).grant_type).toBe("refresh_token");
  expect(tokenRequestBody({ body: tokenBodies[2] }).grant_type).toBe("refresh_token");
  expect(tokenRequestBody({ body: tokenBodies[2] }).refresh_token).toBe("refresh-1");
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
      if (tokenRequestBody(init).grant_type === "refresh_token") {
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
  expect(tokenRequestBody({ body: tokenBodies[1] }).grant_type).toBe("refresh_token");
});

test("reads v22 saved recipes, custom products, and favorites", async () => {
  const urls: string[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith("/oauth/token")) {
      return jsonResponse({ access_token: "access-1", token_type: "bearer", expires_in: 3600 });
    }
    if (url.endsWith("/user/recipes")) return jsonResponse(["recipe-1"]);
    if (url.endsWith("/recipes/recipe-1")) return jsonResponse({
      id: "recipe-1",
      name: "Overnight oats",
      portion_count: 2,
      nutrients: { "energy.energy": 400 },
      servings: [],
      instructions: [],
    });
    if (url.endsWith("/user/products")) return jsonResponse(["product-1"]);
    if (url.endsWith("/user/favorites/recipe")) return jsonResponse([{ recipe_id: "recipe-1", portion_count: 1 }]);
    if (url.endsWith("/user/favorites/product")) return jsonResponse([{ product_id: "product-1", amount: 100, serving_quantity: 1, serving: "gram" }]);
    return jsonResponse({});
  };

  const api = new YazioApiClient({ username: "user@example.com", password: "secret", fetch });
  await expect(api.getUserRecipes()).resolves.toEqual(["recipe-1"]);
  await expect(api.getRecipe("recipe-1")).resolves.toMatchObject({ id: "recipe-1", name: "Overnight oats" });
  await expect(api.getUserProducts()).resolves.toEqual(["product-1"]);
  await expect(api.getFavoriteRecipes()).resolves.toEqual([{ recipe_id: "recipe-1", portion_count: 1 }]);
  await expect(api.getFavoriteProducts()).resolves.toEqual([{ product_id: "product-1", amount: 100, serving_quantity: 1, serving: "gram" }]);

  expect(urls.filter((url) => !url.endsWith("/oauth/token")).every((url) => url.includes("/v22/"))).toBe(true);
});

function initMethod(init?: RequestInit): string | undefined {
  return init?.method;
}
