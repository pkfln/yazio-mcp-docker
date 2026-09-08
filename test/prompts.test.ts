import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createYazioMcpServer } from "../src/server";
import type { YazioApiClient } from "../src/yazio-api";

test("exposes the reference MCP prompts and quick-add guidance", async () => {
  const server = createYazioMcpServer({} as YazioApiClient);
  const client = new Client({ name: "prompt-parity-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    expect(client.getServerVersion()).toEqual({ name: "yazio-mcp", version: "0.2.0" });
    expect(client.getInstructions()).toContain("verify the result");
    expect(client.getInstructions()).toContain("Prefer an existing YAZIO product");

    const listed = await client.listPrompts();
    expect(listed.prompts.map(({ name }) => name)).toEqual([
      "add_food_item",
      "quick_add_food",
      "remove_food_item",
      "add_water_intake",
    ]);
    const tools = await client.listTools();
    expect(tools.tools.map(({ name }) => name)).toContain("add_user_simple_product");
    expect(tools.tools.map(({ name }) => name)).toContain("add_user_consumed_items");
    expect(tools.tools.map(({ name }) => name)).toContain("remove_user_consumed_items");
    expect(tools.tools.map(({ name }) => name)).toContain("add_user_water_intakes");

    const addFood = await client.getPrompt({ name: "add_food_item" });
    const quickAdd = await client.getPrompt({ name: "quick_add_food" });
    const removeFood = await client.getPrompt({ name: "remove_food_item" });
    const addWater = await client.getPrompt({ name: "add_water_intake" });
    const text = (result: typeof addFood) => result.messages[0]?.content.type === "text"
      ? result.messages[0].content.text
      : "";

    expect(text(addFood)).toContain("search_products");
    expect(text(addFood)).toContain("get_product");
    expect(text(addFood)).toContain("serving_quantity");
    expect(text(addFood)).toContain("YYYY-MM-DD HH:mm:ss");
    expect(text(addFood)).toContain("preserve its source time-of-day");
    expect(text(addFood)).toContain("add_user_consumed_items");
    expect(text(quickAdd)).toContain("add_user_simple_product");
    expect(text(quickAdd)).toContain("search_products");
    expect(text(quickAdd)).toContain("only as a fallback");
    expect(text(quickAdd)).toContain("estimated carb");
    expect(text(removeFood)).toContain("get_user_consumed_items");
    expect(text(removeFood)).toContain("itemId");
    expect(text(removeFood)).toContain("remove_user_consumed_items");
    expect(text(addWater)).toContain("cumulative water_intake");
    expect(text(addWater)).toContain("YYYY-MM-DD HH:mm:ss");
    expect(text(addWater)).toContain("add_user_water_intakes");
  } finally {
    await client.close();
    await server.close();
  }
});
