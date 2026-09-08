import { randomUUID } from "node:crypto";

import type {
  AddConsumedItemRequest,
  AddWaterIntakeRequest,
  YazioConsumedItems,
  YazioDailySummary,
  YazioDietaryPreferences,
  YazioExercises,
  YazioGoals,
  YazioProduct,
  YazioProductSearchResult,
  YazioSettings,
  YazioSuggestedProduct,
  YazioToken,
  YazioUserInfo,
  YazioWaterIntake,
  YazioWeightEntry,
} from "./types";

export const YAZIO_BASE_URL = "https://yzapi.yazio.com/v15";

const DEFAULT_TOKEN_LIFETIME_SECONDS = 172800;
const TOKEN_REFRESH_SKEW_MS = 30000;
export const YAZIO_CLIENT_ID = "1_4hiybetvfksgw40o0sog4s884kwc840wwso8go4k8c04goo4c";
export const YAZIO_CLIENT_SECRET = "6rok2m65xuskgkgogw40wkkk8sw0osg84s8cggsc4woos4s8o";

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface YazioApiClientOptions {
  baseUrl?: string;
  username?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  fetch?: FetchLike;
  now?: () => number;
}

export class YazioApiError extends Error {
  readonly status?: number;
  readonly details?: unknown;

  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = "YazioApiError";
    this.status = status;
    this.details = details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function payloadMessage(payload: unknown): string {
  if (typeof payload === "string") return payload.trim().slice(0, 500);
  if (payload === undefined || payload === null) return "";
  try {
    return JSON.stringify(payload).slice(0, 500);
  } catch {
    return String(payload);
  }
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getLocalDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Normalize a Date or ISO-like value to the date-only format YAZIO accepts. */
export function formatYazioDate(value?: string | Date): string {
  if (value === undefined) return getLocalDate();
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("Invalid date");
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${value.getFullYear()}-${month}-${day}`;
  }

  const dateOnly = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    throw new Error(`Invalid YAZIO date: ${value}`);
  }
  const [year, month, day] = dateOnly.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`Invalid YAZIO date: ${value}`);
  }
  return dateOnly;
}

function normalizeToken(
  payload: unknown,
  now: () => number,
  previousRefreshToken?: string,
): YazioToken {
  if (!isRecord(payload) || typeof payload.access_token !== "string") {
    throw new YazioApiError("YAZIO returned an invalid OAuth token response", 502, payload);
  }
  const rawExpiresIn = payload.expires_in;
  const parsedExpiresIn = typeof rawExpiresIn === "number"
    ? rawExpiresIn
    : typeof rawExpiresIn === "string"
      ? Number(rawExpiresIn)
      : Number.NaN;
  const expiresIn = Number.isFinite(parsedExpiresIn) && parsedExpiresIn >= 0
    ? parsedExpiresIn
    : DEFAULT_TOKEN_LIFETIME_SECONDS;
  const refreshToken = typeof payload.refresh_token === "string" && payload.refresh_token.length > 0
    ? payload.refresh_token
    : previousRefreshToken;
  return {
    access_token: payload.access_token,
    token_type: typeof payload.token_type === "string" ? payload.token_type : "bearer",
    expires_in: expiresIn,
    refresh_token: refreshToken,
    expires_at: now() + expiresIn * 1000,
  };
}

export class YazioApiClient {
  private readonly baseUrl: string;
  private readonly username?: string;
  private readonly password?: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly fetchFn: FetchLike;
  private readonly now: () => number;
  private token: YazioToken | null = null;
  private authPromise: Promise<YazioToken> | undefined;

  constructor(options: YazioApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.YAZIO_API_BASE_URL ?? YAZIO_BASE_URL).replace(/\/$/, "");
    this.username = options.username ?? process.env.YAZIO_USERNAME;
    this.password = options.password ?? process.env.YAZIO_PASSWORD;
    this.clientId = options.clientId ?? process.env.YAZIO_CLIENT_ID ?? YAZIO_CLIENT_ID;
    this.clientSecret = options.clientSecret ?? process.env.YAZIO_CLIENT_SECRET ?? YAZIO_CLIENT_SECRET;
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? Date.now;

    const accessToken = options.accessToken ?? process.env.YAZIO_ACCESS_TOKEN;
    const refreshToken = options.refreshToken ?? process.env.YAZIO_REFRESH_TOKEN;
    const configuredExpiry = process.env.YAZIO_TOKEN_EXPIRES_AT ? Number(process.env.YAZIO_TOKEN_EXPIRES_AT) : undefined;
    const tokenExpiresAt = options.tokenExpiresAt ?? (Number.isFinite(configuredExpiry) ? configuredExpiry : undefined);
    if (accessToken) {
      this.token = {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "bearer",
        expires_in: Math.max(0, Math.floor(((tokenExpiresAt ?? this.now() + 3600000) - this.now()) / 1000)),
        expires_at: tokenExpiresAt ?? this.now() + 3600000,
      };
    }
  }

  private url(path: string): string {
    return path.startsWith("http") ? path : `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  }

  private async requestToken(
    values: Record<string, string>,
    formEncoded: boolean,
    previousRefreshToken?: string,
  ): Promise<YazioToken> {
    const headers = new Headers({ Accept: "application/json" });
    let body: string;
    if (formEncoded) {
      headers.set("Content-Type", "application/x-www-form-urlencoded");
      body = new URLSearchParams(values).toString();
    } else {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(values);
    }

    const response = await this.fetchFn(this.url("/oauth/token"), {
      method: "POST",
      headers,
      body,
    });
    const payload = await readResponseBody(response);
    if (!response.ok) {
      throw new YazioApiError(
        `YAZIO authentication failed (${response.status} ${response.statusText})${payloadMessage(payload) ? `: ${payloadMessage(payload)}` : ""}`,
        response.status,
        payload,
      );
    }
    return normalizeToken(payload, this.now, previousRefreshToken);
  }

  private async authenticate(): Promise<YazioToken> {
    if (this.authPromise) return this.authPromise;

    this.authPromise = (async () => {
      if (this.token?.refresh_token) {
        const previousRefreshToken = this.token.refresh_token;
        try {
          const refreshed = await this.requestToken({
            client_id: this.clientId,
            client_secret: this.clientSecret,
            grant_type: "refresh_token",
            refresh_token: previousRefreshToken,
          }, true, previousRefreshToken);
          this.token = refreshed;
          return refreshed;
        } catch (error) {
          if (!this.username || !this.password || !(error instanceof YazioApiError) || ![400, 401, 422].includes(error.status ?? 0)) {
            throw error;
          }
        }
      }

      if (!this.username || !this.password) {
        throw new Error(
          "YAZIO_USERNAME and YAZIO_PASSWORD are required (or provide a valid YAZIO_ACCESS_TOKEN).",
        );
      }

      const values = {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        username: this.username,
        password: this.password,
        grant_type: "password",
      };
      try {
        this.token = await this.requestToken(values, true);
      } catch (error) {
        // A few historical YAZIO deployments accepted JSON despite the public
        // Swagger contract. Keep a narrowly scoped fallback for those servers.
        if (error instanceof YazioApiError && [400, 415, 422].includes(error.status ?? 0)) {
          this.token = await this.requestToken(values, false);
        } else {
          throw error;
        }
      }
      return this.token;
    })().finally(() => {
      this.authPromise = undefined;
    });

    return this.authPromise;
  }

  private hasFreshToken(token: YazioToken | null): token is YazioToken {
    return token !== null && token.expires_at > this.now() + TOKEN_REFRESH_SKEW_MS;
  }

  private async accessToken(): Promise<string> {
    if (this.hasFreshToken(this.token)) return this.token.access_token;
    return (await this.authenticate()).access_token;
  }

  private async recoverFromUnauthorized(failedAccessToken: string): Promise<void> {
    // Another in-flight request may already have rotated the token. Reuse a
    // fresh replacement instead of refreshing again and potentially rotating
    // the refresh token a second time.
    if (this.token?.access_token === failedAccessToken) {
      this.token = { ...this.token, expires_at: 0 };
    }
    if (!this.hasFreshToken(this.token)) await this.authenticate();
  }

  private async request<T>(path: string, init: RequestInit = {}, retryAuth = true): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    const accessToken = await this.accessToken();
    headers.set("Authorization", `Bearer ${accessToken}`);

    const response = await this.fetchFn(this.url(path), { ...init, headers });
    if (response.status === 401 && retryAuth) {
      await this.recoverFromUnauthorized(accessToken);
      return this.request<T>(path, init, false);
    }

    const payload = await readResponseBody(response);
    if (!response.ok) {
      const detail = payloadMessage(payload);
      throw new YazioApiError(
        `YAZIO request failed for ${path} (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`,
        response.status,
        payload,
      );
    }
    return payload as T;
  }

  private async requestJson<T>(path: string, method: "POST" | "DELETE", body: unknown): Promise<T> {
    return this.request<T>(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async getUser(): Promise<YazioUserInfo> {
    return this.request<YazioUserInfo>("/user");
  }

  async getConsumedItems(date: string): Promise<YazioConsumedItems> {
    return this.request<YazioConsumedItems>(`/user/consumed-items?date=${encodeURIComponent(formatYazioDate(date))}`);
  }

  async addConsumedItem(input: AddConsumedItemRequest): Promise<unknown> {
    return this.requestJson("/user/consumed-items", "POST", {
      recipe_portions: [],
      simple_products: [],
      products: [{
        id: randomUUID(),
        product_id: input.product_id,
        date: formatYazioDate(input.date),
        daytime: input.daytime,
        amount: input.amount,
        serving: input.serving,
        serving_quantity: input.serving_quantity,
      }],
    });
  }

  async removeConsumedItem(itemId: string): Promise<unknown> {
    return this.requestJson("/user/consumed-items", "DELETE", [itemId]);
  }

  async getDailySummary(date: string): Promise<YazioDailySummary> {
    return this.request<YazioDailySummary>(`/user/widgets/daily-summary?date=${encodeURIComponent(formatYazioDate(date))}`);
  }

  async getWaterIntake(date: string): Promise<YazioWaterIntake> {
    return this.request<YazioWaterIntake>(`/user/water-intake?date=${encodeURIComponent(formatYazioDate(date))}`);
  }

  async addWaterIntake(input: AddWaterIntakeRequest): Promise<unknown> {
    return this.requestJson("/user/water-intake", "POST", [input]);
  }

  async searchProducts(options: {
    query: string;
    sex: "male" | "female";
    countries: string[];
    locales: string[];
  }): Promise<YazioProductSearchResult[]> {
    const params = new URLSearchParams({
      query: options.query,
      sex: options.sex,
      countries: options.countries.join(","),
      locales: options.locales.join(","),
    });
    return this.request<YazioProductSearchResult[]>(`/products/search?${params.toString()}`);
  }

  async getProduct(id: string): Promise<YazioProduct | null> {
    const product = await this.request<YazioProduct | null>(`/products/${encodeURIComponent(id)}`);
    return product ? { ...product, id: product.id ?? id } : null;
  }

  async getExercises(date?: string): Promise<YazioExercises> {
    return this.request<YazioExercises>(`/user/exercises?date=${encodeURIComponent(formatYazioDate(date))}`);
  }

  async getSettings(): Promise<YazioSettings> {
    return this.request<YazioSettings>("/user/settings");
  }

  async getSuggestedProducts(date: string | undefined, daytime: "breakfast" | "lunch" | "dinner" | "snack"): Promise<YazioSuggestedProduct[]> {
    const params = new URLSearchParams({ date: formatYazioDate(date), daytime });
    return this.request<YazioSuggestedProduct[]>(`/user/products/suggested?${params.toString()}`);
  }

  async getDietaryPreferences(): Promise<YazioDietaryPreferences> {
    return this.request<YazioDietaryPreferences>("/user/dietary-preferences");
  }

  async getGoals(date?: string): Promise<YazioGoals> {
    return this.request<YazioGoals>(`/user/goals/unmodified?date=${encodeURIComponent(formatYazioDate(date))}`);
  }

  async getWeight(date?: string): Promise<YazioWeightEntry | null> {
    return this.request<YazioWeightEntry | null>(`/user/bodyvalues/weight/last?date=${encodeURIComponent(formatYazioDate(date))}`);
  }
}
