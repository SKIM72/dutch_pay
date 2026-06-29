import {
  corsHeaders,
  isAllowedOrigin,
} from "../_shared/cors.ts";

const GEMINI_MODEL = Deno.env.get("GEMINI_RECEIPT_MODEL") ||
  "gemini-2.5-flash";
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_COMBINED_IMAGE_BYTES = 9 * 1024 * 1024;
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
const PROVIDER_TIMEOUT_MS = 40_000;
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

function validateBase64Image(
  imageValue: unknown,
  mimeValue: unknown,
  required: boolean,
) {
  const imageBase64 = cleanText(imageValue, 9_000_000);
  const mimeType = cleanText(mimeValue, 40).toLowerCase();
  if (!imageBase64) {
    if (required) {
      throw new ApiError(400, "INVALID_IMAGE", "A supported image is required.");
    }
    return { imageBase64: "", mimeType: "", estimatedBytes: 0 };
  }
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
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
  return { imageBase64, mimeType, estimatedBytes };
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
  const primaryImage = validateBase64Image(
    body.imageBase64,
    body.mimeType,
    true,
  );
  const enhancedImage = validateBase64Image(
    body.enhancedImageBase64,
    body.enhancedMimeType,
    false,
  );
  if (
    primaryImage.estimatedBytes + enhancedImage.estimatedBytes >
      MAX_COMBINED_IMAGE_BYTES
  ) {
    throw new ApiError(413, "IMAGE_TOO_LARGE", "The images are too large.");
  }

  const fallbackCurrency = cleanText(body.fallbackCurrency, 3).toUpperCase();
  const currentLocalDateCandidate = cleanText(body.currentLocalDate, 10);
  return {
    imageBase64: primaryImage.imageBase64,
    mimeType: primaryImage.mimeType,
    enhancedImageBase64: enhancedImage.imageBase64,
    enhancedMimeType: enhancedImage.mimeType,
    locale: ["ko", "ja", "en"].includes(String(body.locale))
      ? String(body.locale)
      : "ko",
    timezone: cleanText(body.timezone, 80) || "Asia/Seoul",
    currentLocalDate: /^\d{4}-\d{2}-\d{2}$/.test(currentLocalDateCandidate)
      ? currentLocalDateCandidate
      : new Date().toISOString().slice(0, 10),
    fallbackCurrency: SUPPORTED_CURRENCIES.has(fallbackCurrency)
      ? fallbackCurrency
      : "JPY",
  };
}

function normalizeConfidence(value: unknown): number {
  return Math.max(0, Math.min(1, Number(value) || 0));
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

  const rawFieldConfidence =
    raw.field_confidence && typeof raw.field_confidence === "object" &&
      !Array.isArray(raw.field_confidence)
      ? raw.field_confidence as Record<string, unknown>
      : {};
  const fieldConfidence = {
    amount: normalizeConfidence(rawFieldConfidence.amount),
    merchant: normalizeConfidence(rawFieldConfidence.merchant),
    purchasedAt: normalizeConfidence(rawFieldConfidence.purchased_at),
  };
  const amountCandidates = Array.isArray(raw.amount_candidates)
    ? raw.amount_candidates.map((candidate) => {
      if (!candidate || typeof candidate !== "object" ||
        Array.isArray(candidate)) return null;
      const typedCandidate = candidate as Record<string, unknown>;
      const candidateAmount = Number(typedCandidate.amount);
      if (
        !Number.isFinite(candidateAmount) || candidateAmount <= 0 ||
        candidateAmount > 1_000_000_000
      ) return null;
      const kind = cleanText(typedCandidate.kind, 16);
      return {
        label: cleanText(typedCandidate.label, 80),
        amount: candidateAmount,
        kind: [
            "final",
            "subtotal",
            "tax",
            "cash",
            "change",
            "unknown",
          ].includes(kind)
          ? kind
          : "unknown",
      };
    }).filter(Boolean).slice(0, 10)
    : [];
  const totalEvidence = cleanText(raw.total_evidence, 120);
  const merchantEvidence = cleanText(raw.merchant_evidence, 120);
  const dateEvidence = cleanText(raw.date_evidence, 120);
  const validAmount = Number.isFinite(amount) && amount > 0 &&
    amount <= 1_000_000_000;
  const amountMatchesCandidate = !validAmount || amountCandidates.length === 0 ||
    amountCandidates.some((candidate) =>
      candidate && Math.abs(candidate.amount - amount) < 0.01
    );
  if (validAmount && !totalEvidence) {
    warnings.unshift("The final amount has no visible text evidence.");
  }
  if (!amountMatchesCandidate) {
    warnings.unshift("The final amount does not match a visible candidate.");
  }
  let confidence = normalizeConfidence(raw.confidence);
  if (fieldConfidence.amount) {
    confidence = confidence
      ? Math.min(confidence, fieldConfidence.amount)
      : fieldConfidence.amount;
  }
  if ((validAmount && !totalEvidence) || !amountMatchesCandidate) {
    confidence *= 0.72;
  }

  return {
    amount: validAmount ? amount : 0,
    currency,
    name: cleanText(raw.item_name, 100),
    merchantName: cleanText(raw.merchant_name, 100),
    purchasedAt: normalizeDate(raw.purchased_at),
    language: ["ko", "ja", "en"].includes(String(raw.language))
      ? String(raw.language)
      : "unknown",
    confidence,
    fieldConfidence,
    evidence: {
      total: totalEvidence,
      merchant: merchantEvidence,
      purchasedAt: dateEvidence,
    },
    amountCandidates,
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
    "Analyze this Korean or Japanese receipt and extract only text and numbers visibly supported by the supplied image views.",
    "Image 1 is the natural-color corrected receipt. Image 2, when present, is a grayscale high-contrast view of the same receipt. Compare both views; do not treat them as separate receipts.",
    "Read the entire receipt from top to bottom before choosing values.",
    "The user needs one expense entry, not every line item.",
    "List every plausible amount in amount_candidates with its exact nearby label and classify it.",
    "total_amount must be the final amount actually paid. Strong final-total labels include 합계, 총액, 결제금액, 승인금액, 받으실 금액, 合計, 合計金額, お買上合計, お支払, ご利用金額, 現計.",
    "Never choose values labeled 소계, 공급가액, 부가세, 세금, 小計, 税, 消費税, 内税, お預り, 預り, 현금받음, 거스름돈, お釣り, 釣銭, points, balance, or change as the final total.",
    "total_evidence must quote the short visible label and amount used for total_amount. If no visible evidence exists, use total_amount 0.",
    "merchant_name and merchant_evidence must reproduce a visible store or merchant name. Do not invent or translate a merchant.",
    "item_name should normally equal the visible merchant_name. Only use a different label when that exact useful description is visibly printed. Never append a guessed category or placeholder word.",
    "purchased_at must be local time in YYYY-MM-DDTHH:mm. If only a date is visible, use 12:00. If no date is visible, return an empty string.",
    "For Japanese era dates, convert only when the era and year are clearly visible: Reiwa year N equals 2018 + N. Do not infer a missing year from context.",
    `Today in the user's locale is ${input.currentLocalDate}. User interface locale: ${input.locale}. User timezone: ${input.timezone}. Expected currency when the symbol is unclear: ${input.fallbackCurrency}.`,
    "Do not guess unreadable values. Use an empty string or zero and explain uncertainty in warnings.",
  ].join("\n");
  const imageParts: Array<Record<string, unknown>> = [
    { text: "Image 1: natural-color corrected receipt." },
    {
      inlineData: {
        mimeType: input.mimeType,
        data: input.imageBase64,
      },
    },
  ];
  if (input.enhancedImageBase64) {
    imageParts.push(
      { text: "Image 2: grayscale high-contrast view of the same receipt." },
      {
        inlineData: {
          mimeType: input.enhancedMimeType,
          data: input.enhancedImageBase64,
        },
      },
    );
  }

  const providerController = new AbortController();
  const providerTimeout = setTimeout(
    () => providerController.abort(),
    PROVIDER_TIMEOUT_MS,
  );
  let providerResponse: Response;
  try {
    providerResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        signal: providerController.signal,
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
            ...imageParts,
          ],
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              merchant_name: {
                type: "STRING",
                description: "Exact visible merchant name, or empty.",
              },
              merchant_evidence: {
                type: "STRING",
                description: "Short exact visible text supporting merchant_name.",
              },
              item_name: {
                type: "STRING",
                description: "Visible merchant name or exact useful printed description.",
              },
              total_amount: {
                type: "NUMBER",
                description: "Final amount actually paid, or 0 when unsupported.",
              },
              total_evidence: {
                type: "STRING",
                description: "Exact nearby final-total label and amount.",
              },
              amount_candidates: {
                type: "ARRAY",
                description: "All plausible visible monetary totals and their labels.",
                items: {
                  type: "OBJECT",
                  properties: {
                    label: { type: "STRING" },
                    amount: { type: "NUMBER" },
                    kind: {
                      type: "STRING",
                      enum: [
                        "final",
                        "subtotal",
                        "tax",
                        "cash",
                        "change",
                        "unknown",
                      ],
                    },
                  },
                  required: ["label", "amount", "kind"],
                },
              },
              currency: {
                type: "STRING",
                enum: Array.from(SUPPORTED_CURRENCIES),
              },
              purchased_at: {
                type: "STRING",
                description: "Local purchase time in YYYY-MM-DDTHH:mm, or empty.",
              },
              date_evidence: {
                type: "STRING",
                description: "Exact visible date/time text supporting purchased_at.",
              },
              language: {
                type: "STRING",
                enum: ["ko", "ja", "en", "unknown"],
              },
              confidence: {
                type: "NUMBER",
                description: "Overall evidence-based confidence from 0 to 1.",
              },
              field_confidence: {
                type: "OBJECT",
                properties: {
                  amount: { type: "NUMBER" },
                  merchant: { type: "NUMBER" },
                  purchased_at: { type: "NUMBER" },
                },
                required: ["amount", "merchant", "purchased_at"],
              },
              warnings: {
                type: "ARRAY",
                items: { type: "STRING" },
              },
            },
            required: [
              "merchant_name",
              "merchant_evidence",
              "item_name",
              "total_amount",
              "total_evidence",
              "amount_candidates",
              "currency",
              "purchased_at",
              "date_evidence",
              "language",
              "confidence",
              "field_confidence",
              "warnings",
            ],
          },
        },
        }),
      },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(504, "OCR_TIMEOUT", "Receipt OCR timed out.");
    }
    throw error;
  } finally {
    clearTimeout(providerTimeout);
  }

  if (!providerResponse.ok) {
    const providerStatus = providerResponse.status;
    const providerBody = await providerResponse.text();
    console.error(
      "Gemini receipt scan failed",
      providerStatus,
      providerBody,
    );
    if (providerStatus === 429) {
      throw new ApiError(
        429,
        "OCR_RATE_LIMITED",
        "Receipt OCR quota was exceeded.",
      );
    }
    if (providerStatus === 401 || providerStatus === 403) {
      throw new ApiError(
        503,
        "OCR_PROVIDER_AUTH",
        "Receipt OCR provider authentication failed.",
      );
    }
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
