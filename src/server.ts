import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import {
  AddConsumedItemInputSchema,
  AddWaterIntakeInputSchema,
  GetDailySummaryInputSchema,
  GetDietaryPreferencesInputSchema,
  GetFoodEntriesInputSchema,
  GetProductInputSchema,
  GetUserExercisesInputSchema,
  GetUserGoalsInputSchema,
  GetUserInfoInputSchema,
  GetUserSettingsInputSchema,
  GetUserSuggestedProductsInputSchema,
  GetUserWeightInputSchema,
  GetWaterIntakeInputSchema,
  RemoveConsumedItemInputSchema,
  SearchProductsInputSchema,
  type AddConsumedItemInput,
  type AddWaterIntakeInput,
  type GetDailySummaryInput,
  type GetFoodEntriesInput,
  type GetProductInput,
  type GetUserExercisesInput,
  type GetUserGoalsInput,
  type GetUserSuggestedProductsInput,
  type GetUserWeightInput,
  type GetWaterIntakeInput,
  type RemoveConsumedItemInput,
  type SearchProductsInput,
} from "./schemas";
import { YazioApiClient } from "./yazio-api";

export const SERVER_NAME = "yazio-mcp";
export const SERVER_VERSION = "1.0.0";

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  return JSON.stringify(value, null, 2);
}

function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

function dataResult(label: string, data: unknown): CallToolResult {
  return textResult(`${label}:\n\n${stringify(data)}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorResult(error: unknown): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: `YAZIO request failed: ${errorMessage(error)}` }],
  };
}

export class YazioMcpServer {
  readonly server: McpServer;
  readonly api: YazioApiClient;

  constructor(api = new YazioApiClient()) {
    this.api = api;
    this.server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, {
      instructions: "Use the read-only YAZIO tools to inspect nutrition data. Confirm before using tools that change the diary or water log.",
    });
    this.registerTools();
    this.registerPrompts();
  }

  private async run<T>(handler: () => Promise<T>): Promise<T | CallToolResult> {
    try {
      return await handler();
    } catch (error) {
      return errorResult(error);
    }
  }

  private registerTools(): void {
    this.server.registerTool("get_user", {
      description: "Get YAZIO user profile information.",
      inputSchema: GetUserInfoInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    }, async () => this.run(async () => dataResult("User info", await this.api.getUser())) as Promise<CallToolResult>);

    this.server.registerTool("get_user_consumed_items", {
      description: "Get all diary food entries for a date (YYYY-MM-DD).",
      inputSchema: GetFoodEntriesInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    }, async (args: GetFoodEntriesInput) => this.run(async () => dataResult(`Food entries for ${args.date}`, await this.api.getConsumedItems(args.date))) as Promise<CallToolResult>);

    this.server.registerTool("get_user_dietary_preferences", {
      description: "Get the user's dietary restriction and preferences.",
      inputSchema: GetDietaryPreferencesInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    }, async () => this.run(async () => dataResult("Dietary preferences", await this.api.getDietaryPreferences())) as Promise<CallToolResult>);

    this.server.registerTool("get_user_exercises", {
      description: "Get exercises for a date. If omitted, YAZIO's current local date is used.",
      inputSchema: GetUserExercisesInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    }, async (args: GetUserExercisesInput) => this.run(async () => dataResult("User exercises", await this.api.getExercises(args.date))) as Promise<CallToolResult>);

    this.server.registerTool("get_user_goals", {
      description: "Get calorie, macro, water, step, and weight goals for a date.",
      inputSchema: GetUserGoalsInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    }, async (args: GetUserGoalsInput) => this.run(async () => dataResult("User goals", await this.api.getGoals(args.date))) as Promise<CallToolResult>);

    this.server.registerTool("get_user_settings", {
      description: "Get YAZIO tracker, reminder, and feature settings.",
      inputSchema: GetUserSettingsInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    }, async () => this.run(async () => dataResult("User settings", await this.api.getSettings())) as Promise<CallToolResult>);

    this.server.registerTool("get_user_suggested_products", {
      description: "Get products YAZIO suggests for a meal slot and date.",
      inputSchema: GetUserSuggestedProductsInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    }, async (args: GetUserSuggestedProductsInput) => this.run(async () => dataResult("Product suggestions", await this.api.getSuggestedProducts(args.date, args.daytime))) as Promise<CallToolResult>);

    this.server.registerTool("get_user_water_intake", {
      description: "Get water intake for a date (the API returns a cumulative value).",
      inputSchema: GetWaterIntakeInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    }, async (args: GetWaterIntakeInput) => this.run(async () => dataResult(`Water intake for ${args.date}`, await this.api.getWaterIntake(args.date))) as Promise<CallToolResult>);

    this.server.registerTool("get_user_weight", {
      description: "Get the most recent weight entry on or before a date.",
      inputSchema: GetUserWeightInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    }, async (args: GetUserWeightInput) => this.run(async () => dataResult("User weight data", await this.api.getWeight(args.date))) as Promise<CallToolResult>);

    this.server.registerTool("get_user_daily_summary", {
      description: "Get daily nutrition totals, goals, meals, and activity for a date.",
      inputSchema: GetDailySummaryInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    }, async (args: GetDailySummaryInput) => this.run(async () => dataResult(`Daily summary for ${args.date}`, await this.api.getDailySummary(args.date))) as Promise<CallToolResult>);

    this.server.registerTool("search_products", {
      description: "Search YAZIO's food database by name, with optional sex, country, and locale filters.",
      inputSchema: SearchProductsInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    }, async (args: SearchProductsInput) => this.run(async () => {
      const products = await this.api.searchProducts(args);
      return { ...dataResult("Products", products), structuredContent: { products } };
    }) as Promise<CallToolResult>);

    this.server.registerTool("get_product", {
      description: "Get full nutrition and serving details for a product ID.",
      inputSchema: GetProductInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    }, async (args: GetProductInput) => this.run(async () => dataResult(`Product details for ID \"${args.id}\"`, await this.api.getProduct(args.id))) as Promise<CallToolResult>);

    this.server.registerTool("add_user_consumed_item", {
      description: "Add one food product to the diary. Search for the product first and provide amount in g or ml.",
      inputSchema: AddConsumedItemInputSchema,
      annotations: { readOnlyHint: false, idempotentHint: false },
    }, async (args: AddConsumedItemInput) => this.run(async () => {
      await this.api.addConsumedItem({
        product_id: args.product_id,
        date: args.date,
        daytime: args.daytime,
        amount: args.amount,
        serving: args.serving ?? null,
        serving_quantity: args.serving_quantity ?? null,
      });
      return textResult("Successfully added consumed item.");
    }) as Promise<CallToolResult>);

    this.server.registerTool("remove_user_consumed_item", {
      description: "Remove a diary entry by its consumed-item ID. Retrieve diary entries first to identify the ID.",
      inputSchema: RemoveConsumedItemInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    }, async (args: RemoveConsumedItemInput) => this.run(async () => {
      const result = await this.api.removeConsumedItem(args.itemId);
      return dataResult(`Successfully removed consumed item with ID: ${args.itemId}`, result);
    }) as Promise<CallToolResult>);

    this.server.registerTool("add_user_water_intake", {
      description: "Log a cumulative water-intake value. Read the current total first, add the new amount, then submit the new total.",
      inputSchema: AddWaterIntakeInputSchema,
      annotations: { readOnlyHint: false, idempotentHint: false },
    }, async (args: AddWaterIntakeInput) => this.run(async () => {
      await this.api.addWaterIntake(args);
      return textResult("Successfully logged water intake entry.");
    }) as Promise<CallToolResult>);
  }

  private registerPrompts(): void {
    this.server.registerPrompt("add_food_item", {
      title: "Add Food Item to Log",
      description: "Guide for safely adding a food item to the user's consumption log.",
    }, async () => ({ messages: [{ role: "user", content: { type: "text", text: [
      "To add food, search_products first, then get_product to confirm servings and base unit.",
      "Ask the user to choose when multiple products match. Call add_user_consumed_item with product_id, YYYY-MM-DD date, daytime, and amount in g/ml.",
      "If a serving is used, send the serving type, serving_quantity, and the equivalent base-unit amount. Never guess a product ID.",
    ].join("\n\n") } }] }));

    this.server.registerPrompt("remove_food_item", {
      title: "Remove Food Item from Log",
      description: "Guide for removing a food item from the user's consumption log.",
    }, async () => ({ messages: [{ role: "user", content: { type: "text", text: [
      "Call get_user_consumed_items for the relevant date, identify the exact entry and its id, then call remove_user_consumed_item with itemId.",
      "The consumed-item id is different from product_id. Ask for clarification if more than one entry matches.",
    ].join("\n\n") } }] }));

    this.server.registerPrompt("add_water_intake", {
      title: "Add Water Intake to Log",
      description: "Guide for adding cumulative water intake to the user's log.",
    }, async () => ({ messages: [{ role: "user", content: { type: "text", text: [
      "Call get_user_water_intake for the date first. Add the user's new millilitre amount to the returned cumulative water_intake.",
      "Call add_user_water_intake with the new cumulative value and a YYYY-MM-DD HH:mm:ss timestamp. Do not send only the incremental amount.",
    ].join("\n\n") } }] }));
  }
}

export function createYazioMcpServer(api = new YazioApiClient()): McpServer {
  return new YazioMcpServer(api).server;
}
