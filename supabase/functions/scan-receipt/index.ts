import {
  corsHeaders,
  isAllowedOrigin,
} from "../_shared/cors.ts";

const GEMINI_MODEL = Deno.env.get("GEMINI_RECEIPT_MODEL") ||
  "gemini-2.5-flash";
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const SUPPORTED_CURRENCIES = new Set([
  "JPY",
  "KRW",
  "USD",
  "CNY",
  "GBP",
  "CAD",
  "AUD",
  "HKD",
  "TWD",
]);
const REQUESTS_PER_MINUTE = 8;
const requestWindows = new Map<string, number[]>();

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function jsonResponse(
  request: Request,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim()
    .slice(0, maxLength);
}

function normalizeDate(value: unknown): string {
  const date = cleanText(value, 32).replace(" ", "T");
  const match = date.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/,
  );
  if (!match) return "";
  const [, year, month, day, hour, minute] = match;
  const timestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day) ||
    parsed.getUTCHours() !== Number(hour) ||
    parsed.getUTCMinutes() !== Number(minute)
  ) return "";
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function parseGeminiJson(text: string): Record<string, unknown> {
  const normalized = text.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed = JSON.parse(normalized);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ApiError(502, "OCR_NO_RESULT", "Invalid OCR response.");
  }
  return parsed as Record<string, unknown>;
}

async function authenticate(request: Request): Promise<string> {
  const authorization = request.headers.get("authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!authorization?.startsWith("Bearer ") || !supabaseUrl || !anonKey) {
    throw new ApiError(401, "UNAUTHORIZED", "Authentication is required.");
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      "Authorization": authorization,
      "apikey": anonKey,
    },
  });
  if (!response.ok) {
    throw new ApiError(401, "UNAUTHORIZED", "Authentication is required.");
  }
  const user = await response.json();
  if (!user?.id) {
    throw new ApiError(401, "UNAUTHORIZED", "Authentication is required.");
  }
  return String(user.id);
}

function enforceRateLimit(userId: string): void {
  const now = Date.now();
  const windowStart = now - 60_000;
  const recent = (requestWindows.get(userId) || []).filter((time) =>
    time > windowStart
  );
  if (recent.length >= REQUESTS_PER_MINUTE) {
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Too many receipt scans. Try again shortly.",
    );
  }
  recent.push(now);
  requestWindows.set(userId, recent);
}

function validateRequestBody(body: Record<string, unknown>) {
  const imageBase64 = cleanText(body.imageBase64, 9_000_000);
  const mimeType = cleanText(body.mimeType, 40).toLowerCase();
  if (!imageBase64 || !SUPPORTED_MIME_TYPES.has(mimeType)) {
    throw new ApiError(400, "INVALID_IMAGE", "A supported image is required.");
  }

  const padding = imageBase64.endsWith("==")
    ? 2
    : imageBase64.endsWith("=")
    ? 1
    : 0;
  const estimatedBytes = Math.floor((imageBase64.length * 3) / 4) - padding;
  if (estimatedBytes <= 0 || estimatedBytes > MAX_IMAGE_BYTES) {
    throw new ApiError(413, "IMAGE_TOO_LARGE", "The image is too large.");
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) {
    throw new ApiError(400, "INVALID_IMAGE", "The image payload is invalid.");
  }

  const fallbackCurrency = cleanText(body.fallbackCurrency, 3).toUpperCase();
  return {
    imageBase64,
    mimeType,
    locale: ["ko", "ja", "en"].includes(String(body.locale))
      ? String(body.locale)
      : "ko",
    timezone: cleanText(body.timezone, 80) || "Asia/Seoul",
    fallbackCurrency: SUPPORTED_CURRENCIES.has(fallbackCurrency)
      ? fallbackCurrency
      : "JPY",
  };
}

function normalizeResult(
  raw: Record<string, unknown>,
  fallbackCurrency: string,
) {
  const amount = Number(raw.total_amount);
  const currencyCandidate = cleanText(raw.currency, 3).toUpperCase();
  const currency = SUPPORTED_CURRENCIES.has(currencyCandidate)
    ? currencyCandidate
    : fallbackCurrency;
  const warnings = Array.isArray(raw.warnings)
    ? raw.warnings.map((warning) => cleanText(warning, 160)).filter(Boolean)
      .slice(0, 5)
    : [];
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
    warnings.unshift("Grand total could not be identified reliably.");
  }

  return {
    amount: Number.isFinite(amount) && amount > 0 &&
        amount <= 1_000_000_000
      ? amount
      : 0,
    currency,
    name: cleanText(raw.item_name, 100),
    merchantName: cleanText(raw.merchant_name, 100),
    purchasedAt: normalizeDate(raw.purchased_at),
    language: ["ko", "ja", "en"].includes(String(raw.language))
      ? String(raw.language)
      : "unknown",
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)),
    warnings,
  };
}

async function scanReceipt(request: Request): Promise<Response> {
  const userId = await authenticate(request);
  enforceRateLimit(userId);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    throw new ApiError(
      503,
      "OCR_NOT_CONFIGURED",
      "Receipt OCR is not configured.",
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsedBody: unknown = await request.json();
    if (
      !parsedBody || typeof parsedBody !== "object" ||
      Array.isArray(parsedBody)
    ) {
      throw new Error("INVALID_BODY");
    }
    body = parsedBody as Record<string, unknown>;
  } catch {
    throw new ApiError(400, "INVALID_REQUEST", "JSON body is required.");
  }
  const input = validateRequestBody(body);

  const prompt = [
    "Analyze this Korean or Japanese receipt and extract only evidence visible in the image.",
    "The user needs one expense entry, not every line item.",
    "total_amount must be the final amount actually paid. Exclude subtotal, tax-only values, points, cash received, and change.",
    "item_name should be a short useful Korean or Japanese expense label. Prefer the merchant name plus a short category when clear.",
    "purchased_at must be local time in YYYY-MM-DDTHH:mm. If only a date is visible, use 12:00. If no date is visible, return an empty string.",
    `User interface locale: ${input.locale}. User timezone: ${input.timezone}. Expected currency when the symbol is unclear: ${input.fallbackCurrency}.`,
    "Do not guess unreadable values. Use an empty string or zero and explain uncertainty in warnings.",
  ].join("\n");

  const providerResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text:
              "You are a precise receipt OCR system specializing in Korean and Japanese receipts. Never invent missing text.",
          }],
        },
        contents: [{
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: input.mimeType,
                data: input.imageBase64,
              },
            },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              merchant_name: { type: "STRING" },
              item_name: { type: "STRING" },
              total_amount: { type: "NUMBER" },
              currency: {
                type: "STRING",
                enum: Array.from(SUPPORTED_CURRENCIES),
              },
              purchased_at: { type: "STRING" },
              language: {
                type: "STRING",
                enum: ["ko", "ja", "en", "unknown"],
              },
              confidence: { type: "NUMBER" },
              warnings: {
                type: "ARRAY",
                items: { type: "STRING" },
              },
            },
            required: [
              "merchant_name",
              "item_name",
              "total_amount",
              "currency",
              "purchased_at",
              "language",
              "confidence",
              "warnings",
            ],
          },
        },
      }),
    },
  );

  if (!providerResponse.ok) {
    console.error(
      "Gemini receipt scan failed",
      providerResponse.status,
      await providerResponse.text(),
    );
    throw new ApiError(502, "OCR_PROVIDER_ERROR", "OCR provider failed.");
  }

  const providerPayload = await providerResponse.json();
  const text = providerPayload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new ApiError(422, "OCR_NO_RESULT", "No receipt result was found.");
  }
  const result = normalizeResult(
    parseGeminiJson(String(text)),
    input.fallbackCurrency,
  );
  return jsonResponse(request, {
    result,
    meta: { model: GEMINI_MODEL, stored: false },
  });
}

Deno.serve(async (request) => {
  if (!isAllowedOrigin(request)) {
    return jsonResponse(request, {
      code: "ORIGIN_NOT_ALLOWED",
      message: "Origin is not allowed.",
    }, 403);
  }
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, {
      code: "METHOD_NOT_ALLOWED",
      message: "Only POST is supported.",
    }, 405);
  }

  try {
    return await scanReceipt(request);
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonResponse(request, {
        code: error.code,
        message: error.message,
      }, error.status);
    }
    console.error("Unexpected receipt scan error", error);
    return jsonResponse(request, {
      code: "INTERNAL_ERROR",
      message: "Unexpected receipt scan error.",
    }, 500);
  }
});
