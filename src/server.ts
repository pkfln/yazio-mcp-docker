import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import {
  AddConsumedItemInputSchema,
  AddConsumedItemsInputSchema,
  AddSimpleProductInputSchema,
  AddWaterIntakeInputSchema,
  AddWaterIntakesInputSchema,
  GetDailySummaryInputSchema,
  GetDietaryPreferencesInputSchema,
  GetFavoriteProductsInputSchema,
  GetFavoriteRecipesInputSchema,
  GetFoodEntriesInputSchema,
  GetProductInputSchema,
  GetRecipeInputSchema,
  GetUserExercisesInputSchema,
  GetUserGoalsInputSchema,
  GetUserInfoInputSchema,
  GetUserProductsInputSchema,
  GetUserRecipesInputSchema,
  GetUserSettingsInputSchema,
  GetUserSuggestedProductsInputSchema,
  GetUserWeightInputSchema,
  GetWaterIntakeInputSchema,
  RemoveConsumedItemInputSchema,
  RemoveConsumedItemsInputSchema,
  SearchProductsInputSchema,
  type AddConsumedItemInput,
  type AddConsumedItemsInput,
  type AddSimpleProductInput,
  type AddWaterIntakeInput,
  type AddWaterIntakesInput,
  type GetDailySummaryInput,
  type GetFavoriteProductsInput,
  type GetFavoriteRecipesInput,
  type GetFoodEntriesInput,
  type GetProductInput,
  type GetRecipeInput,
  type GetUserExercisesInput,
  type GetUserGoalsInput,
  type GetUserProductsInput,
  type GetUserRecipesInput,
  type GetUserSuggestedProductsInput,
  type GetUserWeightInput,
  type GetWaterIntakeInput,
  type RemoveConsumedItemInput,
  type RemoveConsumedItemsInput,
  type SearchProductsInput,
} from "./schemas";
import { YazioApiClient } from "./yazio-api";

export const SERVER_NAME = "yazio-mcp";
export const SERVER_VERSION = "0.2.0";

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
      instructions: [
        "For diary workflows involving multiple dates, handle each requested date individually.",
        "Before changing or deleting an entry, read the affected date and retain the original fields needed to identify or recreate it. Treat opaque IDs as references, not as names.",
        "For destructive deletions, ensure the target is explicit and confirmed; do not guess when several entries match.",
        "After every mutation, read the affected date again and verify the result. If an unambiguous discrepancy was caused by the mutation, correct it using the captured original or intended values; otherwise report the discrepancy instead of guessing.",
        "When reporting results, resolve product and consumed-item IDs into names and relevant details whenever the API provides enough information.",
        "User-created recipe and product collections return opaque IDs. Resolve recipe IDs with get_recipe and product IDs with get_product before reporting names, nutrients, or serving details.",
        "Prefer an existing YAZIO product: search the product database before using a quick-add simple product. Use a simple product only when no suitable match exists or the user explicitly requests an estimate.",
        "Regular product diary writes require a full YYYY-MM-DD HH:mm:ss timestamp. When copying an entry, preserve its source time-of-day and change only the target calendar date; never use a date-only value for a write.",
        "For multiple regular products, use add_user_consumed_items with one complete item per product and verify every generated consumed-item ID after the write.",
        "A v22 diary deletion is bucket-specific: preserve whether each ID belongs to products, recipe_portions, or simple_products. Before deletion, read the affected diary date, retain a backup of every selected entry, confirm the complete target set, and then use remove_user_consumed_item or remove_user_consumed_items with the matching bucket.",
        "For multiple water entries, calculate each cumulative water_intake value in chronological order and use add_user_water_intakes only after verifying those totals.",
      ].join(" "),
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
      description: "Get all diary food entries, including quick-add simple products, for a date (YYYY-MM-DD).",
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
      description: "Get full nutrition and serving details for a YAZIO database or user-created product ID.",
      inputSchema: GetProductInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    }, async (args: GetProductInput) => this.run(async () => dataResult(`Product details for ID \"${args.id}\"`, await this.api.getProduct(args.id))) as Promise<CallToolResult>);

    this.server.registerTool("get_user_recipes", {
      description: "List IDs of recipes saved in the user's YAZIO account. Resolve each ID with get_recipe before presenting recipe details.",
      inputSchema: GetUserRecipesInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    }, async (_args: GetUserRecipesInput) => this.run(async () => dataResult("User recipe IDs", await this.api.getUserRecipes())) as Promise<CallToolResult>);

    this.server.registerTool("get_recipe", {
      description: "Get full details for a YAZIO recipe, including portions, nutrients, ingredients, and instructions.",
      inputSchema: GetRecipeInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    }, async (args: GetRecipeInput) => this.run(async () => dataResult(`Recipe details for ID \"${args.id}\"`, await this.api.getRecipe(args.id))) as Promise<CallToolResult>);

    this.server.registerTool("get_user_products", {
      description: "List IDs of custom products created in the user's YAZIO account. Resolve each ID with get_product before presenting details.",
      inputSchema: GetUserProductsInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    }, async (_args: GetUserProductsInput) => this.run(async () => dataResult("User product IDs", await this.api.getUserProducts())) as Promise<CallToolResult>);

    this.server.registerTool("get_user_favorite_recipes", {
      description: "List recipes saved as favorites by the user, including their recipe IDs and portion counts.",
      inputSchema: GetFavoriteRecipesInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    }, async (_args: GetFavoriteRecipesInput) => this.run(async () => dataResult("Favorite recipes", await this.api.getFavoriteRecipes())) as Promise<CallToolResult>);

    this.server.registerTool("get_user_favorite_products", {
      description: "List products saved as favorites by the user, including product IDs and serving quantities.",
      inputSchema: GetFavoriteProductsInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    }, async (_args: GetFavoriteProductsInput) => this.run(async () => dataResult("Favorite products", await this.api.getFavoriteProducts())) as Promise<CallToolResult>);

    this.server.registerTool("add_user_consumed_item", {
      description: "Add one food product to the diary with a full YYYY-MM-DD HH:mm:ss timestamp. Search for the product first and provide amount in g or ml.",
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

    this.server.registerTool("add_user_consumed_items", {
      description: "Add multiple regular YAZIO food products to the diary in one request. Search products first and provide a full timestamp for every item.",
      inputSchema: AddConsumedItemsInputSchema,
      annotations: { readOnlyHint: false, idempotentHint: false },
    }, async (args: AddConsumedItemsInput) => this.run(async () => {
      const result = await this.api.addConsumedItems(args.items.map((item) => ({
        product_id: item.product_id,
        date: item.date,
        daytime: item.daytime,
        amount: item.amount,
        serving: item.serving ?? null,
        serving_quantity: item.serving_quantity ?? null,
      })));
      return dataResult(`Successfully added ${result.ids.length} consumed items`, {
        consumed_item_ids: result.ids,
        api_response: result.response,
      });
    }) as Promise<CallToolResult>);

    this.server.registerTool("add_user_simple_product", {
      description: "Quick-add a food entry with estimated nutrition values after product search finds no suitable match, or when the user explicitly requests an estimate.",
      inputSchema: AddSimpleProductInputSchema,
      annotations: { readOnlyHint: false, idempotentHint: false },
    }, async (args: AddSimpleProductInput) => this.run(async () => {
      const id = await this.api.addSimpleProduct(args);
      return textResult(`Successfully added quick-add food entry "${args.name}" with ID: ${id}`);
    }) as Promise<CallToolResult>);

    this.server.registerTool("remove_user_consumed_item", {
      description: "Remove one diary entry by its consumed-item ID and v22 collection (products, recipe_portions, or simple_products). Retrieve diary entries first to identify both.",
      inputSchema: RemoveConsumedItemInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    }, async (args: RemoveConsumedItemInput) => this.run(async () => {
      const result = await this.api.removeConsumedItem(args.itemId, args.bucket);
      return dataResult(`Successfully removed ${args.bucket} diary item with ID: ${args.itemId}`, result);
    }) as Promise<CallToolResult>);

    this.server.registerTool("remove_user_consumed_items", {
      description: "Remove multiple diary entries by their consumed-item IDs and v22 collections. Retrieve and confirm every target first; the server sends one documented delete per entry.",
      inputSchema: RemoveConsumedItemsInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    }, async (args: RemoveConsumedItemsInput) => this.run(async () => {
      const result = await this.api.removeConsumedItems(args.items);
      return dataResult(`Successfully removed ${result.removed.length} consumed items`, {
        consumed_items: result.removed,
        api_responses: result.responses,
      });
    }) as Promise<CallToolResult>);

    this.server.registerTool("add_user_water_intake", {
      description: "Log a cumulative water-intake value. Read the current total first, add the new amount, then submit the new total.",
      inputSchema: AddWaterIntakeInputSchema,
      annotations: { readOnlyHint: false, idempotentHint: false },
    }, async (args: AddWaterIntakeInput) => this.run(async () => {
      await this.api.addWaterIntake(args);
      return textResult("Successfully logged water intake entry.");
    }) as Promise<CallToolResult>);

    this.server.registerTool("add_user_water_intakes", {
      description: "Log multiple cumulative water-intake values in one request. Read the current total first and provide cumulative values in chronological order.",
      inputSchema: AddWaterIntakesInputSchema,
      annotations: { readOnlyHint: false, idempotentHint: false },
    }, async (args: AddWaterIntakesInput) => this.run(async () => {
      await this.api.addWaterIntakes(args.entries);
      return dataResult(`Successfully logged ${args.entries.length} water intake entries`, {
        entries: args.entries,
      });
    }) as Promise<CallToolResult>);
  }

  private registerPrompts(): void {
    this.server.registerPrompt("add_food_item", {
      title: "Add Food Item to Log",
      description: "Guide for adding a food item to the user's consumption log.",
    }, async () => ({ messages: [{ role: "user", content: { type: "text", text: [
      "To add a food item to the user's consumption log, follow this workflow:",
      "1. Search first: call search_products with a query such as chicken breast, apple, or pasta. You may provide sex, countries, and locales when useful. Never invent a product_id.",
      "2. Clarify the product: if multiple results match, ask the user which exact product they want before continuing.",
      "3. Inspect product details: call get_product with the selected product_id. Use its servings and base_unit to understand the available serving types (for example portion, gram, piece, or cup) and whether the product is measured in grams (g) or millilitres (ml).",
      "4. Clarify the quantity: if the user did not provide a serving type and quantity or a base-unit amount, ask which serving from the product details and how much they want to add. If the user gave a base-unit amount, use that directly.",
      "5. Confirm the change with the user before writing to the diary. Adding an item is a mutating action.",
      "6. Call add_user_consumed_item with product_id from search_products, date in YYYY-MM-DD HH:mm:ss format, daytime (breakfast, lunch, dinner, or snack), and a positive amount in the product's base unit. For multiple regular products in one confirmed request, use add_user_consumed_items with one complete item per product. When copying an entry, preserve its source time-of-day and replace only the calendar date. When using a serving, provide serving and serving_quantity together; when using a base-unit amount directly, those serving fields may be omitted.",
      "Serving arithmetic: amount must be the base-unit amount, not the number of servings. For example, two apples at 100 g each means serving=piece, serving_quantity=2, amount=200; 200 g of chicken means amount=200 without a serving. A base unit such as g or ml can also be used as the serving when the product exposes it.",
      "7. Verify the write: call get_user_consumed_items for the target calendar date, resolve the new entry's product_id into its product name when needed, and confirm the full timestamp, meal slot, amount, and serving are correct. If the result is wrong, correct it immediately using the captured values.",
      "For multiple dates, complete and verify one date at a time. Do not guess product IDs, serving sizes, dates, or meal slots. Ask a follow-up question whenever the product, serving, or quantity is ambiguous.",
    ].join("\n\n") } }] }));

    this.server.registerPrompt("quick_add_food", {
      title: "Quick Add Food from Estimate",
      description: "Guide for logging food with estimated nutrition when no YAZIO product ID is available.",
    }, async () => ({ messages: [{ role: "user", content: { type: "text", text: [
      "Use quick-add only as a fallback. First call search_products using the food or meal description, including useful country and locale filters. If a suitable database product exists, use get_product and the normal add_user_consumed_item flow instead; do not create a simple product.",
      "Continue with this workflow only when no suitable product match exists or the user explicitly requests an estimate. A photo or free-text description alone is not a reason to skip the product search.",
      "1. Estimate a concise name, energy in kilocalories, and—when possible—carbohydrates, protein, and fat in grams. State the portion and preparation assumptions clearly.",
      "2. If the estimate, portion, date, time, or meal slot is ambiguous, ask a follow-up question. Do not invent a date or timestamp. Tell the user the estimates before writing and obtain confirmation because this is a mutating action.",
      "3. Call add_user_simple_product with name, date in YYYY-MM-DD HH:mm:ss format, daytime (breakfast, lunch, dinner, or snack), energy, and any estimated carb, protein, and fat values.",
      "4. Verify the write by calling get_user_consumed_items for the calendar date. Locate the new simple_products entry by its generated ID or name and confirm its timestamp, meal slot, and nutrients. If the result is wrong, explain the discrepancy; if correction requires deletion, confirm that removal before using remove_user_consumed_item with bucket simple_products, then recreate it with corrected values and verify again.",
      "For multiple dates, complete and verify one date at a time. Keep the generated ID so the quick-add entry can be removed if the user corrects the estimate.",
    ].join("\n\n") } }] }));

    this.server.registerPrompt("remove_food_item", {
      title: "Remove Food Item from Log",
      description: "Guide for removing a food item from the user's consumption log.",
    }, async () => ({ messages: [{ role: "user", content: { type: "text", text: [
      "To remove a food item from the user's consumption log, follow this workflow:",
      "1. Retrieve the diary: call get_user_consumed_items with the relevant date in YYYY-MM-DD format.",
      "2. Identify the exact entry using its id, product_id, name, date, daytime, amount, serving, and other product details. The consumed-item id is the id field, not product_id.",
      "   Keep the collection containing the ID: regular entries are in products, recipe portions are in recipe_portions, and quick-add entries are in simple_products.",
      "3. If multiple entries match, ask the user to clarify which one should be removed. Do not guess.",
      "4. Keep the original product_id or recipe_id, date, daytime, amount or portion_count, serving, and serving_quantity in context so the entry can be recreated if verification finds a mistake.",
      "5. Tell the user which entry will be deleted and confirm the destructive change before continuing.",
      "6. Call remove_user_consumed_item with itemId and its bucket. If several exact entries are confirmed, use remove_user_consumed_items with items containing one itemId/bucket object per selected entry. Never send a bare ID array.",
      "7. Verify the deletion by calling get_user_consumed_items for the same date and resolving the remaining entries into names. If the wrong item was removed, recreate the original entry immediately from the captured fields and verify again.",
    ].join("\n\n") } }] }));

    this.server.registerPrompt("add_water_intake", {
      title: "Add Water Intake to Log",
      description: "Guide for adding water intake entries to the user's log.",
    }, async () => ({ messages: [{ role: "user", content: { type: "text", text: [
      "To add water intake to the user's log, follow this workflow:",
      "1. Read the current total first: call get_user_water_intake for the relevant date in YYYY-MM-DD format. The response contains cumulative water_intake in millilitres.",
      "2. Add the user's new amount in millilitres to the current cumulative water_intake. Submit the total, not only the incremental amount.",
      "3. Confirm the timestamp uses YYYY-MM-DD HH:mm:ss and that the resulting cumulative value is non-negative.",
      "4. Confirm the log change with the user, then call add_user_water_intake with one object containing date and the new cumulative water_intake. For multiple entries, calculate each cumulative total in chronological order and call add_user_water_intakes with an entries array. The server sends the array required by the YAZIO API.",
      "Example: if the current total is 500 ml and the user adds 250 ml, submit { date: \"2025-12-18 12:00:00\", water_intake: 750 }.",
      "5. Verify the write by calling get_user_water_intake for the same day and confirm the cumulative value. If it is wrong, immediately submit the intended cumulative value and verify again.",
      "Never submit only the new amount, and do not skip the initial read because another entry may have changed the total. For multiple dates, read, update, and verify each date separately.",
    ].join("\n\n") } }] }));
  }
}

export function createYazioMcpServer(api = new YazioApiClient()): McpServer {
  return new YazioMcpServer(api).server;
}
