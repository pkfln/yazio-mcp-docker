import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createYazioMcpServer } from "../src/server";
import type { YazioApiClient } from "../src/yazio-api";

function resultText(result: unknown): string {
  if (typeof result !== "object" || result === null) return "";
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  const block = content.find((item): item is { type: "text"; text: string } => (
    typeof item === "object" && item !== null &&
    (item as { type?: unknown }).type === "text" &&
    typeof (item as { text?: unknown }).text === "string"
  ));
  return block?.text ?? "";
}

test("redacts sensitive profile fields from get_user", async () => {
  const server = createYazioMcpServer({
    async getUser() {
      return {
        email: "user@example.com",
        user_token: "secret-token",
        siwa_user_id: "provider-id",
        stripe_customer_id: "cus_secret",
        login_type: "apple",
        uuid: "account-uuid",
        first_name: "Test",
        country: "CH",
      };
    },
  } as unknown as YazioApiClient);
  const client = new Client({ name: "server-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({ name: "get_user", arguments: {} });
    const text = resultText(result);
    expect(text).toContain("first_name");
    expect(text).not.toContain("user@example.com");
    expect(text).not.toContain("secret-token");
    expect(text).not.toContain("provider-id");
    expect(text).not.toContain("cus_secret");
    expect(text).not.toContain("login_type");
    expect(text).not.toContain("account-uuid");
  } finally {
    await client.close();
    await server.close();
  }
});

test("applies suggested-product limits locally without pretending query is supported", async () => {
  const server = createYazioMcpServer({
    async getSuggestedProducts() {
      return [
        { product_id: "product-1", serving: null, amount: 1, serving_quantity: null },
        { product_id: "product-2", serving: null, amount: 1, serving_quantity: null },
        { product_id: "product-3", serving: null, amount: 1, serving_quantity: null },
      ];
    },
  } as unknown as YazioApiClient);
  const client = new Client({ name: "server-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const limited = await client.callTool({
      name: "get_user_suggested_products",
      arguments: { date: "2026-09-08", daytime: "breakfast", limit: 2 },
    });
    expect(JSON.parse(resultText(limited).replace("Product suggestions:\n\n", ""))).toHaveLength(2);

    const tools = await client.listTools();
    const suggestionTool = tools.tools.find(({ name }) => name === "get_user_suggested_products");
    expect(JSON.stringify(suggestionTool?.inputSchema)).not.toContain("query");
  } finally {
    await client.close();
    await server.close();
  }
});
