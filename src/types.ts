export interface YazioToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  expires_at: number;
}

export interface YazioProduct {
  id?: string;
  name: string;
  is_verified: boolean;
  is_private?: boolean;
  is_deleted?: boolean;
  has_ean?: boolean;
  category?: string;
  producer: string | null;
  nutrients: Record<string, number>;
  updated_at?: string;
  servings: Array<{ serving: string; amount: number }>;
  base_unit: string;
  eans?: string[];
  language?: string;
  countries?: string[];
}

export interface YazioProductSearchResult {
  serving: string;
  amount: number;
  name: string;
  is_verified: boolean;
  producer: string | null;
  nutrients: Record<string, number>;
  base_unit: string;
  language?: string;
  countries?: string[];
  score: number;
  product_id: string;
  serving_quantity: number;
}

export interface YazioUserInfo {
  sex: "male" | "female" | "other" | string;
  unit_mass: string;
  unit_energy: string;
  unit_serving: string;
  unit_length: string;
  start_weight: number;
  goal: string;
  diet: {
    name: string;
    carb_percentage: number;
    fat_percentage: number;
    protein_percentage: number;
  } | null;
  email: string;
  premium_type?: string;
  first_name: string | null;
  last_name: string | null;
  city?: string | null;
  country?: string;
  weight_change_per_week?: number;
  body_height: number;
  date_of_birth: string;
  registration_date: string;
  timezone_offset: number;
  unit_glucose?: string;
  food_database_country?: string;
  profile_image?: string | null;
  user_token?: string;
  email_confirmation_status?: string;
  newsletter_opt_in?: boolean;
  login_type?: string;
  siwa_user_id?: string | null;
  uuid?: string;
  reset_date?: string | null;
  activity_degree?: string;
  stripe_customer_id?: string | null;
  language?: string;
  tags?: unknown[];
}

export interface YazioWeightEntry {
  value: number | null;
  date: string;
  id: string;
  external_id: unknown | null;
  gateway: unknown | null;
  source: unknown | null;
}

export interface YazioSuggestedProduct {
  serving: string | null;
  amount: number;
  product_id: string;
  serving_quantity: number | null;
}

export interface YazioDietaryPreferences {
  restriction: unknown | null;
}

export interface YazioExercise {
  date: string;
  id: string;
  name: string;
  external_id: unknown | null;
  gateway: unknown | null;
  source: unknown | null;
  note: unknown | null;
  energy: number;
  distance: number;
  duration: number;
  steps: number;
}

export interface YazioExercises {
  training: YazioExercise[];
  custom_training: YazioExercise[];
  activity?: {
    energy: number;
    distance: number;
    duration: number;
    source: unknown | null;
    gateway: string;
    steps: number;
  };
}

export interface YazioGoals {
  "energy.energy": number;
  "nutrient.carb": number;
  "nutrient.fat": number;
  "nutrient.protein": number;
  "activity.step": number;
  "bodyvalue.weight": number;
  water: number;
}

export interface YazioSettings {
  has_water_tracker: boolean;
  has_diary_tipps: boolean;
  has_meal_reminders: boolean;
  has_usage_reminders: boolean;
  has_weight_reminders: boolean;
  has_water_reminders: boolean;
  consume_activity_calories: boolean;
  has_feelings: boolean;
  has_fasting_tracker_reminders: boolean;
  has_fasting_stage_reminders: boolean;
}

export interface YazioWaterIntake {
  gateway: unknown | null;
  source: unknown | null;
  water_intake: number;
}

export interface YazioDailySummary {
  steps: number;
  activity_energy: number;
  consume_activity_energy: boolean;
  water_intake: number;
  goals: YazioGoals;
  units: {
    unit_mass: string;
    unit_energy: string;
    unit_serving: string;
    unit_length: string;
  };
  meals: Record<
    "breakfast" | "lunch" | "dinner" | "snack",
    {
      nutrients: Record<string, number>;
      energy_goal: number;
    }
  >;
  user: {
    start_weight?: number;
    current_weight?: number;
    goal?: string;
    sex?: string;
  };
  active_fasting_countdown_template_key: unknown | null;
}

export interface YazioConsumedItem {
  type?: string;
  date: string;
  serving: string | null;
  amount: number | null;
  id: string;
  product_id: string;
  serving_quantity: number | null;
  daytime: "breakfast" | "lunch" | "dinner" | "snack";
}

export type ConsumedItemBucket = "products" | "recipe_portions" | "simple_products";

export interface RemoveConsumedItemRequest {
  itemId: string;
  bucket: ConsumedItemBucket;
}

export interface YazioSimpleProduct {
  id: string;
  date: string;
  daytime: "breakfast" | "lunch" | "dinner" | "snack";
  type: "simple_product";
  name: string;
  nutrients: Record<string, number>;
  is_ai_generated?: boolean;
}

export interface YazioConsumedItems {
  products: YazioConsumedItem[];
  recipe_portions: YazioConsumedRecipePortion[];
  simple_products: YazioSimpleProduct[];
}

export interface YazioConsumedRecipePortion {
  id: string;
  date: string;
  daytime: "breakfast" | "lunch" | "dinner" | "snack";
  type?: string;
  recipe_id: string;
  portion_count: number;
}

export interface YazioRecipeServing {
  amount: number;
  serving?: unknown | null;
  producer?: string | null;
  name?: string;
  serving_quantity?: unknown | null;
  base_unit?: string;
  note?: unknown | null;
  product_id?: string;
}

export interface YazioRecipe {
  id: string;
  yazio_id?: unknown;
  locale?: string;
  name: string;
  portion_count: number;
  nutrients: Record<string, number>;
  image?: unknown;
  servings: YazioRecipeServing[];
  instructions: unknown[];
  is_yazio_recipe?: boolean;
  available_since?: unknown;
  is_pro_recipe?: boolean;
}

export interface YazioFavoriteRecipe {
  id?: string;
  recipe_id: string;
  portion_count: number;
  yazio_id?: string | null;
}

export interface YazioFavoriteProduct {
  id?: string;
  product_id: string;
  amount: number;
  serving_quantity: number;
  serving: string;
}

export interface AddConsumedItemRequest {
  product_id: string;
  date: string;
  daytime: "breakfast" | "lunch" | "dinner" | "snack";
  amount: number;
  serving: string | null;
  serving_quantity: number | null;
}

export type AddConsumedItemsRequest = AddConsumedItemRequest[];

export interface AddWaterIntakeRequest {
  date: string;
  water_intake: number;
}

export type AddWaterIntakesRequest = AddWaterIntakeRequest[];

export interface AddSimpleProductRequest {
  name: string;
  date: string;
  daytime: "breakfast" | "lunch" | "dinner" | "snack";
  energy: number;
  carb?: number;
  protein?: number;
  fat?: number;
}
