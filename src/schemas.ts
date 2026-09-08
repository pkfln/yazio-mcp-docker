import { z } from "zod";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

function isCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isCalendarDateTime(value: string): boolean {
  const [date, time] = value.split(" ");
  if (!date || !time || !isCalendarDate(date)) return false;
  const [hours, minutes, seconds] = time.split(":").map(Number);
  return (
    Number.isInteger(hours) &&
    Number.isInteger(minutes) &&
    Number.isInteger(seconds) &&
    hours >= 0 &&
    hours < 24 &&
    minutes >= 0 &&
    minutes < 60 &&
    seconds >= 0 &&
    seconds < 60
  );
}

export const DaytimeSchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);

/** YAZIO's API uses an ISO calendar date for query parameters. */
export const DateStringSchema = z
  .string()
  .regex(DATE_PATTERN, "Date must use YYYY-MM-DD format")
  .refine(isCalendarDate, "Date must be a valid calendar date")
  .describe("Date in YYYY-MM-DD format");

/** Product and consumed-item IDs are opaque API identifiers (usually UUIDs). */
export const ProductIdSchema = z
  .string()
  .trim()
  .min(1, "ID must not be empty")
  .describe("YAZIO product or item identifier");
export const ItemIdSchema = ProductIdSchema.describe("Consumed-item identifier");
export const ServingTypeSchema = z
  .string()
  .trim()
  .min(1)
  .describe("Serving type such as portion, gram, glass, cup, slice, or piece");

export const DateInputSchema = z.object({
  date: DateStringSchema,
});

export const OptionalDateInputSchema = z.object({
  date: DateStringSchema.optional(),
});

export const EmptyInputSchema = z.object({});

export const DateTimeStringSchema = z
  .string()
  .regex(DATETIME_PATTERN, "Use YYYY-MM-DD HH:mm:ss format")
  .refine(isCalendarDateTime, "Timestamp must be a valid calendar date and time")
  .describe("Timestamp in YYYY-MM-DD HH:mm:ss format");

export const SearchProductsInputSchema = z.object({
  query: z.string().trim().min(1).describe("Search query"),
  sex: z.enum(["male", "female"]).default("male").describe("User sex"),
  countries: z
    .array(z.string().regex(/^[A-Za-z]{2}$/, "Use ISO 3166-1 alpha-2 codes"))
    .min(1)
    .default(["US"])
    .describe("Product country codes, for example [\"US\", \"DE\"]"),
  locales: z
    .array(z.string().min(2))
    .min(1)
    .default(["en_US"])
    .describe("Product locale codes, for example [\"en_US\", \"de_DE\"]"),
});

export const GetProductInputSchema = z.object({
  id: ProductIdSchema.describe("Product ID to get details for"),
});

export const GetUserSuggestedProductsInputSchema = z.object({
  date: DateStringSchema.optional(),
  daytime: DaytimeSchema.default("breakfast").describe("Meal slot"),
  // Kept for compatibility with the previous server. YAZIO's suggested
  // products endpoint does not use these fields.
  query: z.string().trim().min(1).optional().describe("Compatibility field; ignored by YAZIO"),
  limit: z.number().int().positive().optional().describe("Compatibility field; ignored by YAZIO"),
});

export const AddConsumedItemInputSchema = z.object({
  product_id: ProductIdSchema.describe("Product ID from search_products"),
  date: DateTimeStringSchema.describe("Timestamp when the food was consumed in YYYY-MM-DD HH:mm:ss format"),
  daytime: DaytimeSchema.describe("Meal slot"),
  amount: z.number().positive().describe("Amount in the product base unit (g or ml)"),
  serving: ServingTypeSchema.nullable().optional(),
  serving_quantity: z.number().positive().nullable().optional(),
});

export const AddConsumedItemsInputSchema = z.object({
  items: z
    .array(AddConsumedItemInputSchema)
    .min(1)
    .describe("Regular YAZIO products to add to the diary in one request"),
});

export const RemoveConsumedItemInputSchema = z.object({
  itemId: ItemIdSchema.describe("ID of the consumed item to remove, not the product ID"),
});

export const RemoveConsumedItemsInputSchema = z.object({
  itemIds: z
    .array(ItemIdSchema)
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, "Consumed-item IDs must be unique")
    .describe("Consumed-item IDs to remove after confirming each exact entry"),
});

export const AddWaterIntakeInputSchema = z.object({
  date: DateTimeStringSchema.describe("Entry timestamp in YYYY-MM-DD HH:mm:ss format"),
  water_intake: z
    .number()
    .nonnegative()
    .describe("Cumulative water intake in millilitres"),
});

export const AddWaterIntakesInputSchema = z.object({
  entries: z
    .array(AddWaterIntakeInputSchema)
    .min(1)
    .describe("Cumulative water-intake entries to submit in one request"),
});

export const AddSimpleProductInputSchema = z.object({
  name: z.string().trim().min(1).describe("Display name for the quick-add food entry"),
  date: DateTimeStringSchema.describe("Entry timestamp in YYYY-MM-DD HH:mm:ss format"),
  daytime: DaytimeSchema.describe("Meal slot"),
  energy: z.number().nonnegative().describe("Estimated energy in kilocalories"),
  carb: z.number().nonnegative().optional().describe("Estimated carbohydrates in grams"),
  protein: z.number().nonnegative().optional().describe("Estimated protein in grams"),
  fat: z.number().nonnegative().optional().describe("Estimated fat in grams"),
});

export const GetFoodEntriesInputSchema = DateInputSchema;
export const GetDailySummaryInputSchema = DateInputSchema;
export const GetUserInfoInputSchema = EmptyInputSchema;
export const GetUserWeightInputSchema = OptionalDateInputSchema;
export const GetWaterIntakeInputSchema = DateInputSchema;
export const GetUserExercisesInputSchema = OptionalDateInputSchema;
export const GetUserSettingsInputSchema = EmptyInputSchema;
export const GetDietaryPreferencesInputSchema = EmptyInputSchema;
export const GetUserGoalsInputSchema = OptionalDateInputSchema;

export type Daytime = z.infer<typeof DaytimeSchema>;
export type GetFoodEntriesInput = z.infer<typeof GetFoodEntriesInputSchema>;
export type GetDailySummaryInput = z.infer<typeof GetDailySummaryInputSchema>;
export type GetUserInfoInput = z.infer<typeof GetUserInfoInputSchema>;
export type GetUserWeightInput = z.infer<typeof GetUserWeightInputSchema>;
export type GetWaterIntakeInput = z.infer<typeof GetWaterIntakeInputSchema>;
export type SearchProductsInput = z.infer<typeof SearchProductsInputSchema>;
export type GetProductInput = z.infer<typeof GetProductInputSchema>;
export type GetUserExercisesInput = z.infer<typeof GetUserExercisesInputSchema>;
export type GetUserSettingsInput = z.infer<typeof GetUserSettingsInputSchema>;
export type GetUserSuggestedProductsInput = z.infer<typeof GetUserSuggestedProductsInputSchema>;
export type AddConsumedItemInput = z.infer<typeof AddConsumedItemInputSchema>;
export type AddConsumedItemsInput = z.infer<typeof AddConsumedItemsInputSchema>;
export type RemoveConsumedItemInput = z.infer<typeof RemoveConsumedItemInputSchema>;
export type RemoveConsumedItemsInput = z.infer<typeof RemoveConsumedItemsInputSchema>;
export type AddWaterIntakeInput = z.infer<typeof AddWaterIntakeInputSchema>;
export type AddWaterIntakesInput = z.infer<typeof AddWaterIntakesInputSchema>;
export type AddSimpleProductInput = z.infer<typeof AddSimpleProductInputSchema>;
export type GetDietaryPreferencesInput = z.infer<typeof GetDietaryPreferencesInputSchema>;
export type GetUserGoalsInput = z.infer<typeof GetUserGoalsInputSchema>;
