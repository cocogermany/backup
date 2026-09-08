/**
 * Cloudflare Worker for Coco Germany R2 Object Storage & Admin API Gateway
 * 
 * Production-Grade Security & Web Crypto Firebase Token Verification
 */

const FIXED_ALLOWED_ORIGINS = [
  "https://cocogermany.github.io",
  "https://cocogermany.site",
  "https://www.cocogermany.site",
  "https://cocogermany.com",
  "https://www.cocogermany.com",
  "https://cocogermany.netlify.app",
];

const NETLIFY_SUBDOMAIN_REGEX = /^https:\/\/[a-zA-Z0-9-]+\.netlify\.app$/;

const ADMIN_EMAIL = "cocogermany.ytd@gmail.com";
const DEFAULT_SUPABASE_URL = "https://ejpxjizncocktzduyqdb.supabase.co";
const FIREBASE_PROJECT_ID = "cocogermany-ba33f";
const FIREBASE_JWK_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let cachedJwks = null;
let jwksCacheExp = 0;

/**
 * Fetch and cache Google RS256 JWKs for Firebase token signature verification
 */
async function getFirebaseJwks() {
  const now = Date.now();
  if (cachedJwks && now < jwksCacheExp) {
    return cachedJwks;
  }
  try {
    const res = await fetch(FIREBASE_JWK_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching Firebase JWKs`);

    const cacheControl = res.headers.get("cache-control") || "";
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
    const maxAgeSec = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 3600;

    cachedJwks = await res.json();
    jwksCacheExp = now + maxAgeSec * 1000;
    return cachedJwks;
  } catch (err) {
    console.error("Failed to fetch Firebase JWKs:", err);
    return cachedJwks || null;
  }
}

/**
 * Base64URL to Uint8Array helper
 */
function base64UrlToUint8Array(base64Url) {
  let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const raw = atob(base64);
  const array = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    array[i] = raw.charCodeAt(i);
  }
  return array;
}

/**
 * Cryptographically verify Firebase ID token RS256 signature using Web Crypto API
 */
async function verifyFirebaseToken(idToken, env) {
  if (!idToken || typeof idToken !== "string") return null;

  const parts = idToken.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;

  let header, payload;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(headerB64)));
    payload = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(payloadB64)));
  } catch (e) {
    return null;
  }

  if (header.alg !== "RS256" || !header.kid) return null;

  const jwks = await getFirebaseJwks();
  if (!jwks || !Array.isArray(jwks.keys)) return null;

  const targetJwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!targetJwk) return null;

  try {
    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      targetJwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(`${headerB64}.${payloadB64}`);
    const signatureBytes = base64UrlToUint8Array(signatureB64);

    const isValidSig = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      signatureBytes,
      dataBytes
    );

    if (!isValidSig) return null;
  } catch (err) {
    console.error("Crypto verification error:", err);
    return null;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const projectId = env.FIREBASE_PROJECT_ID || FIREBASE_PROJECT_ID;

  if (payload.exp && payload.exp < nowSec) return null;
  if (payload.iss && payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (payload.aud && payload.aud !== projectId) return null;

  return payload;
}

/**
 * Reusable CORS middleware helper
 * Dynamically resolves and returns CORS headers for allowed origins.
 */
function getCORSHeaders(request) {
  const reqOrigin = request && request.headers ? request.headers.get("Origin") : null;

  let matchedOrigin = "https://www.cocogermany.site";
  if (reqOrigin) {
    if (
      FIXED_ALLOWED_ORIGINS.includes(reqOrigin) ||
      NETLIFY_SUBDOMAIN_REGEX.test(reqOrigin) ||
      reqOrigin.startsWith("http://localhost:") ||
      reqOrigin.startsWith("http://127.0.0.1:")
    ) {
      matchedOrigin = reqOrigin;
    }
  }

  return {
    "Access-Control-Allow-Origin": matchedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-File-Name, X-File-Folder",
    "Access-Control-Max-Age": "86400",
  };
}

/**
 * Helper to construct JSON response with CORS headers
 */
function responseJSON(data, status = 200, request = null) {
  const cors = getCORSHeaders(request);
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...cors,
    },
  });
}

/**
 * Helper to compute the local calendar week start date (Monday) in YYYY-MM-DD format
 * using the user's IANA timezone.
 */
function getLocalCalendarWeekStart(dateInput, timezone) {
  let dateObj = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(dateObj.getTime())) {
    dateObj = new Date();
  }

  let ymd = "";
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    ymd = formatter.format(dateObj); // "YYYY-MM-DD"
  } catch (e) {
    ymd = dateObj.toISOString().split("T")[0];
  }

  const [year, month, day] = ymd.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = (utcDate.getUTCDay() + 6) % 7; // Monday = 0, ..., Sunday = 6

  const mondayUtc = new Date(Date.UTC(year, month - 1, day - dayOfWeek));
  const mYear = mondayUtc.getUTCFullYear();
  const mMonth = String(mondayUtc.getUTCMonth() + 1).padStart(2, "0");
  const mDay = String(mondayUtc.getUTCDate()).padStart(2, "0");

  return `${mYear}-${mMonth}-${mDay}`;
}

export default {
  async fetch(request, env) {
    // 1. Preflight OPTIONS request handling for all endpoints
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: getCORSHeaders(request),
      });
    }

    const url = new URL(request.url);
    const cdnBase = (env.PUBLIC_CDN_DOMAIN || url.origin).replace(/\/$/, "");

    try {
      // 2. Admin Material Metadata Upsert (POST /admin/material)
      if (request.method === "POST" && url.pathname === "/admin/material") {
        const authHeader = request.headers.get("Authorization") || "";
        const idToken = authHeader.replace(/^Bearer\s+/i, "").trim();

        if (!idToken) {
          return responseJSON({ error: "Unauthorized: Missing Authorization Bearer token." }, 401, request);
        }

        // Cryptographically verify Firebase ID Token signature & claims
        const tokenPayload = await verifyFirebaseToken(idToken, env);
        if (!tokenPayload) {
          return responseJSON({ error: "Unauthorized: Invalid or unverified Firebase ID token signature." }, 401, request);
        }

        if (tokenPayload.email !== ADMIN_EMAIL) {
          return responseJSON({ error: `Forbidden: User '${tokenPayload.email || "unknown"}' is not authorized as admin.` }, 403, request);
        }

        // Require SUPABASE_SERVICE_ROLE_KEY environment binding (no fallback string in production)
        if (!env.SUPABASE_SERVICE_ROLE_KEY) {
          return responseJSON(
            { error: "Server Configuration Error: SUPABASE_SERVICE_ROLE_KEY environment binding is missing." },
            500,
            request
          );
        }
        const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

        // Parse material JSON body
        const material = await request.json();
        if (!material || !material.id || !material.title) {
          return responseJSON({ error: "Bad Request: Missing required material fields (id, title)." }, 400, request);
        }

        const durationMin = (material.duration_minutes !== undefined && material.duration_minutes !== null && material.duration_minutes !== "")
          ? parseInt(material.duration_minutes || material.durationMinutes, 10)
          : (material.durationMinutes !== undefined && material.durationMinutes !== null && material.durationMinutes !== "" ? parseInt(material.durationMinutes, 10) : null);

        const payload = {
          id: String(material.id).trim(),
          title: String(material.title || "").trim(),
          description: material.description !== undefined && material.description !== null ? String(material.description).trim() : null,
          exam: String(material.exam || "goethe").trim(),
          level: String(material.level || "A1").trim(),
          module: String(material.module === "Grammar" ? "Grammatik" : (material.module || "Lesen")).trim(),
          teil: material.teil !== undefined && material.teil !== null && String(material.teil).trim() !== "" ? String(material.teil).trim() : null,
          material_number: parseInt(material.material_number || material.materialNumber || "1", 10),
          content_path: String(material.content_path || material.contentPath || `${material.level}/${material.id}.json`).trim(),
          difficulty: String(material.difficulty || "Medium").trim(),
          duration_minutes: durationMin && !isNaN(durationMin) && durationMin > 0 ? durationMin : null,
          active: material.active !== undefined ? Boolean(material.active) : true,
        };

        const supabaseUrl = (env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, "");

        // Issue REST request directly to Supabase with Service Role Key
        const supabaseRes = await fetch(`${supabaseUrl}/rest/v1/materials`, {
          method: "POST",
          headers: {
            "apikey": serviceRoleKey,
            "Authorization": `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation",
          },
          body: JSON.stringify([payload]),
        });

        if (!supabaseRes.ok) {
          const errText = await supabaseRes.text();
          return responseJSON({ error: `Supabase database error (${supabaseRes.status}): ${errText}` }, supabaseRes.status, request);
        }

        const supabaseData = await supabaseRes.json();
        return responseJSON(
          {
            success: true,
            message: `Material ${payload.id} successfully saved to Supabase via Worker API`,
            data: supabaseData ? supabaseData[0] : payload,
          },
          200,
          request
        );
      }

      // 3. Learning Onboarding (POST /learning/onboarding)
      if (request.method === "POST" && url.pathname === "/learning/onboarding") {
        const authHeader = request.headers.get("Authorization") || "";
        const idToken = authHeader.replace(/^Bearer\s+/i, "").trim();

        if (!idToken) {
          return responseJSON({ error: "Unauthorized: Missing Authorization Bearer token." }, 401, request);
        }

        // Cryptographically verify Firebase ID Token
        const tokenPayload = await verifyFirebaseToken(idToken, env);
        if (!tokenPayload || !tokenPayload.sub) {
          return responseJSON({ error: "Unauthorized: Invalid or unverified Firebase ID token signature." }, 401, request);
        }

        const uid = tokenPayload.sub;
        const body = await request.json().catch(() => ({}));
        const currentLevel = String(body.level || body.current_level || "A1").toUpperCase().trim();
        const rawFormat = String(body.format || body.exam_format || "goethe").toLowerCase().trim();
        const format = rawFormat === "telc" ? "telc" : "goethe";
        const timezone = String(body.timezone || body.time_zone || "").trim();

        if (!env.SUPABASE_SERVICE_ROLE_KEY) {
          return responseJSON(
            { error: "Server Configuration Error: SUPABASE_SERVICE_ROLE_KEY environment binding is missing." },
            500,
            request
          );
        }
        const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = (env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, "");

        // 1. Fetch existing user record to determine membership
        const userRes = await fetch(`${supabaseUrl}/rest/v1/learning_users?uid=eq.${encodeURIComponent(uid)}&select=*`, {
          headers: {
            "apikey": serviceRoleKey,
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
        });

        let existingUser = null;
        if (!userRes.ok) {
          const errText = await userRes.text();
          return responseJSON({ error: `Supabase user fetch error (${userRes.status}): ${errText}` }, userRes.status, request);
        }

        const userData = await userRes.json();
        if (userData && userData.length > 0) {
          existingUser = userData[0];
        }

        const membershipCode = ((existingUser && existingUser.membership) || body.membership || "FREE").toUpperCase().trim();

        // 2. Fetch matching plans.code to get authoritative plans.daily_practice_credits
        const planRes = await fetch(`${supabaseUrl}/rest/v1/plans?code=eq.${encodeURIComponent(membershipCode)}&select=*`, {
          headers: {
            "apikey": serviceRoleKey,
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
        });

        if (!planRes.ok) {
          const errText = await planRes.text();
          return responseJSON({ error: `Supabase plan fetch error (${planRes.status}): ${errText}` }, planRes.status, request);
        }

        const planData = await planRes.json();
        const plan = planData && planData[0];
        if (!plan || typeof plan.daily_practice_credits !== "number") {
          return responseJSON({ error: `Plan '${membershipCode}' is missing a numeric daily_practice_credits value.` }, 500, request);
        }
        const dailyPracticeCredits = plan.daily_practice_credits;

        // 3. Determine effective timezone and local date
        const effectiveTimezone = timezone || (existingUser && existingUser.timezone) || "UTC";
        let userLocalToday = "";
        try {
          const formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: effectiveTimezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
          userLocalToday = formatter.format(new Date());
        } catch (tzErr) {
          userLocalToday = new Date().toISOString().split("T")[0];
        }

        // 4. Construct learningUserPayload using dynamic plan allowance (never hardcoded)
        const learningUserPayload = {
          uid,
          membership: membershipCode,
          current_level: currentLevel,
          format: format,
          updated_at: new Date().toISOString(),
        };

        if (timezone) {
          learningUserPayload.timezone = timezone;
        }

        // Initialize credits_remaining and last_reset from plans.daily_practice_credits for new users or uninitialized rows
        if (!existingUser) {
          learningUserPayload.credits_remaining = dailyPracticeCredits;
          learningUserPayload.last_reset = userLocalToday;
          learningUserPayload.created_at = new Date().toISOString();
        } else if (typeof existingUser.credits_remaining !== "number") {
          learningUserPayload.credits_remaining = dailyPracticeCredits;
          learningUserPayload.last_reset = userLocalToday;
        }

        const supabaseRes = await fetch(`${supabaseUrl}/rest/v1/learning_users`, {
          method: "POST",
          headers: {
            "apikey": serviceRoleKey,
            "Authorization": `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation",
          },
          body: JSON.stringify([learningUserPayload]),
        });

        if (!supabaseRes.ok) {
          const errText = await supabaseRes.text();
          return responseJSON({ error: `Supabase database error (${supabaseRes.status}): ${errText}` }, supabaseRes.status, request);
        }

        const supabaseData = await supabaseRes.json();
        return responseJSON(
          {
            success: true,
            message: `Learning user ${uid} preferences updated successfully`,
            data: supabaseData ? supabaseData[0] : learningUserPayload,
            timezone: effectiveTimezone || null,
          },
          200,
          request
        );
      }

      // 4. Learning Credits Check (POST /learning/credits/check or GET /learning/credits/check)
      if ((request.method === "POST" || request.method === "GET") && url.pathname === "/learning/credits/check") {
        const authHeader = request.headers.get("Authorization") || "";
        const idToken = authHeader.replace(/^Bearer\s+/i, "").trim();

        if (!idToken) {
          return responseJSON({ error: "Unauthorized: Missing Authorization Bearer token." }, 401, request);
        }

        // Cryptographically verify Firebase ID Token
        const tokenPayload = await verifyFirebaseToken(idToken, env);
        if (!tokenPayload || !tokenPayload.sub) {
          return responseJSON({ error: "Unauthorized: Invalid or unverified Firebase ID token signature." }, 401, request);
        }

        const uid = tokenPayload.sub;
        if (!env.SUPABASE_SERVICE_ROLE_KEY) {
          return responseJSON(
            { error: "Server Configuration Error: SUPABASE_SERVICE_ROLE_KEY environment binding is missing." },
            500,
            request
          );
        }
        const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = (env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, "");

        // 1. Get learning_users row using Firebase UID
        const userRes = await fetch(`${supabaseUrl}/rest/v1/learning_users?uid=eq.${encodeURIComponent(uid)}&select=*`, {
          headers: {
            "apikey": serviceRoleKey,
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
        });

        if (!userRes.ok) {
          const errText = await userRes.text();
          return responseJSON({ error: `Supabase user fetch error (${userRes.status}): ${errText}` }, userRes.status, request);
        }

        const userData = await userRes.json();
        let userRow = userData && userData.length > 0 ? userData[0] : null;

        const membershipCode = ((userRow && userRow.membership) || "FREE").toUpperCase().trim();

        // 2. Resolve the authoritative allowance before creating a user record.
        const planRes = await fetch(`${supabaseUrl}/rest/v1/plans?code=eq.${encodeURIComponent(membershipCode)}&select=*`, {
          headers: {
            "apikey": serviceRoleKey,
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
        });

        if (!planRes.ok) {
          const errText = await planRes.text();
          return responseJSON({ error: `Supabase plan fetch error (${planRes.status}): ${errText}` }, planRes.status, request);
        }

        const planData = await planRes.json();
        const plan = planData && planData[0];
        if (!plan || typeof plan.daily_practice_credits !== "number") {
          return responseJSON({ error: `Plan '${membershipCode}' is missing a numeric daily_practice_credits value.` }, 500, request);
        }
        const dailyPracticeCredits = plan.daily_practice_credits;

        // Create missing users only after their allowance has been resolved from
        // plans. A failed insert is an error, never an in-memory fallback.
        if (!userRow) {
          const todayIsoDate = new Date().toISOString().split("T")[0];
          const newUser = {
            uid,
            membership: membershipCode,
            current_level: "A1",
            format: "goethe",
            credits_remaining: dailyPracticeCredits,
            last_reset: todayIsoDate,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const createRes = await fetch(`${supabaseUrl}/rest/v1/learning_users`, {
            method: "POST",
            headers: {
              "apikey": serviceRoleKey,
              "Authorization": `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
              "Prefer": "resolution=merge-duplicates,return=representation",
            },
            body: JSON.stringify([newUser]),
          });

          if (!createRes.ok) {
            const errText = await createRes.text();
            return responseJSON({ error: `Supabase user creation error (${createRes.status}): ${errText}` }, createRes.status, request);
          }

          const createdData = await createRes.json();
          userRow = createdData && createdData.length > 0 ? createdData[0] : newUser;
        }

        // 3. Compute user's current local calendar date using learning_users.timezone (IANA value) and last_reset
        const userTimezone = userRow.timezone || "UTC";
        let userLocalToday = "";
        try {
          const formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: userTimezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
          userLocalToday = formatter.format(new Date()); // Formats as YYYY-MM-DD
        } catch (tzErr) {
          userLocalToday = new Date().toISOString().split("T")[0];
        }

        let creditsRemaining = typeof userRow.credits_remaining === "number" ? userRow.credits_remaining : dailyPracticeCredits;
        let lastReset = userRow.last_reset ? String(userRow.last_reset).split("T")[0] : "";

        // 4. Check if local calendar date is newer than last_reset
        if (!lastReset || userLocalToday > lastReset) {
          creditsRemaining = dailyPracticeCredits;
          lastReset = userLocalToday;

          await fetch(`${supabaseUrl}/rest/v1/learning_users?uid=eq.${encodeURIComponent(uid)}`, {
            method: "PATCH",
            headers: {
              "apikey": serviceRoleKey,
              "Authorization": `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              credits_remaining: creditsRemaining,
              last_reset: lastReset,
              updated_at: new Date().toISOString(),
            }),
          });
        }

        return responseJSON(
          {
            success: true,
            uid,
            membership: userRow.membership || "FREE",
            current_level: userRow.current_level || "A1",
            format: userRow.format || "goethe",
            credits_remaining: creditsRemaining,
            daily_practice_credits: dailyPracticeCredits,
            last_reset: lastReset,
            timezone: userTimezone,
          },
          200,
          request
        );
      }

      // 5. Atomic Learning Credit Consumption (POST /learning/credits/consume)
      if (request.method === "POST" && url.pathname === "/learning/credits/consume") {
        const authHeader = request.headers.get("Authorization") || "";
        const idToken = authHeader.replace(/^Bearer\s+/i, "").trim();

        if (!idToken) {
          return responseJSON({ error: "Unauthorized: Missing Authorization Bearer token." }, 401, request);
        }

        const tokenPayload = await verifyFirebaseToken(idToken, env);
        if (!tokenPayload || !tokenPayload.sub) {
          return responseJSON({ error: "Unauthorized: Invalid or unverified Firebase ID token signature." }, 401, request);
        }

        const uid = tokenPayload.sub;
        if (!env.SUPABASE_SERVICE_ROLE_KEY) {
          return responseJSON(
            { error: "Server Configuration Error: SUPABASE_SERVICE_ROLE_KEY environment binding is missing." },
            500,
            request
          );
        }
        const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = (env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, "");

        // 1. Fetch user row
        const userRes = await fetch(`${supabaseUrl}/rest/v1/learning_users?uid=eq.${encodeURIComponent(uid)}&select=*`, {
          headers: {
            "apikey": serviceRoleKey,
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
        });

        if (!userRes.ok) {
          const errText = await userRes.text();
          return responseJSON({ error: `Supabase user fetch error (${userRes.status}): ${errText}` }, userRes.status, request);
        }

        const userData = await userRes.json();
        let userRow = userData && userData.length > 0 ? userData[0] : null;
        const membershipCode = ((userRow && userRow.membership) || "FREE").toUpperCase().trim();

        // 2. Fetch plan daily credits
        const planRes = await fetch(`${supabaseUrl}/rest/v1/plans?code=eq.${encodeURIComponent(membershipCode)}&select=*`, {
          headers: {
            "apikey": serviceRoleKey,
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
        });

        let dailyPracticeCredits = 10;
        if (planRes.ok) {
          const planData = await planRes.json();
          if (planData && planData[0] && typeof planData[0].daily_practice_credits === "number") {
            dailyPracticeCredits = planData[0].daily_practice_credits;
          }
        }

        // Initialize user if missing
        if (!userRow) {
          const todayIsoDate = new Date().toISOString().split("T")[0];
          const newUser = {
            uid,
            membership: membershipCode,
            current_level: "A1",
            format: "goethe",
            credits_remaining: dailyPracticeCredits,
            last_reset: todayIsoDate,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const createRes = await fetch(`${supabaseUrl}/rest/v1/learning_users`, {
            method: "POST",
            headers: {
              "apikey": serviceRoleKey,
              "Authorization": `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
              "Prefer": "resolution=merge-duplicates,return=representation",
            },
            body: JSON.stringify([newUser]),
          });

          if (createRes.ok) {
            const createdData = await createRes.json();
            userRow = createdData && createdData.length > 0 ? createdData[0] : newUser;
          } else {
            userRow = newUser;
          }
        }

        // 3. Check timezone & calendar day
        const userTimezone = userRow.timezone || "UTC";
        let userLocalToday = "";
        try {
          const formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: userTimezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
          userLocalToday = formatter.format(new Date());
        } catch (tzErr) {
          userLocalToday = new Date().toISOString().split("T")[0];
        }

        let creditsRemaining = typeof userRow.credits_remaining === "number" ? userRow.credits_remaining : dailyPracticeCredits;
        let lastReset = userRow.last_reset ? String(userRow.last_reset).split("T")[0] : "";

        // Case A: New calendar day in user's timezone -> Reset allowance & deduct 1 credit
        if (!lastReset || userLocalToday > lastReset) {
          if (dailyPracticeCredits <= 0) {
            return responseJSON(
              {
                success: false,
                error: "insufficient_credits",
                credits_remaining: 0,
                membership: membershipCode,
              },
              200,
              request
            );
          }

          const newCredits = dailyPracticeCredits - 1;
          const resetRes = await fetch(
            `${supabaseUrl}/rest/v1/learning_users?uid=eq.${encodeURIComponent(uid)}`,
            {
              method: "PATCH",
              headers: {
                "apikey": serviceRoleKey,
                "Authorization": `Bearer ${serviceRoleKey}`,
                "Content-Type": "application/json",
                "Prefer": "return=representation",
              },
              body: JSON.stringify({
                credits_remaining: newCredits,
                last_reset: userLocalToday,
                updated_at: new Date().toISOString(),
              }),
            }
          );

          if (!resetRes.ok) {
            const errText = await resetRes.text();
            return responseJSON({ error: `Supabase credit update error (${resetRes.status}): ${errText}` }, resetRes.status, request);
          }

          const resetData = await resetRes.json();
          const updatedUser = resetData && resetData.length > 0 ? resetData[0] : { credits_remaining: newCredits, membership: membershipCode };
          return responseJSON(
            {
              success: true,
              credits_remaining: updatedUser.credits_remaining,
              membership: updatedUser.membership || membershipCode,
              uid,
            },
            200,
            request
          );
        }

        // Case B: Same calendar day -> Check remaining credits & perform ATOMIC conditional decrement
        if (creditsRemaining <= 0) {
          return responseJSON(
            {
              success: false,
              error: "insufficient_credits",
              credits_remaining: 0,
              membership: membershipCode,
            },
            200,
            request
          );
        }

        const newCredits = creditsRemaining - 1;
        const deductRes = await fetch(
          `${supabaseUrl}/rest/v1/learning_users?uid=eq.${encodeURIComponent(uid)}&credits_remaining=gt.0`,
          {
            method: "PATCH",
            headers: {
              "apikey": serviceRoleKey,
              "Authorization": `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
              "Prefer": "return=representation",
            },
            body: JSON.stringify({
              credits_remaining: newCredits,
              updated_at: new Date().toISOString(),
            }),
          }
        );

        if (!deductRes.ok) {
          const errText = await deductRes.text();
          return responseJSON({ error: `Supabase credit update error (${deductRes.status}): ${errText}` }, deductRes.status, request);
        }

        const deductData = await deductRes.json();
        if (!deductData || deductData.length === 0) {
          // Conditional check matched 0 rows (concurrent tab already consumed last credit)
          return responseJSON(
            {
              success: false,
              error: "insufficient_credits",
              credits_remaining: 0,
              membership: membershipCode,
            },
            200,
            request
          );
        }

        const updatedUser = deductData[0];
        return responseJSON(
          {
            success: true,
            credits_remaining: updatedUser.credits_remaining,
            membership: updatedUser.membership || membershipCode,
            uid,
          },
          200,
          request
        );
      }

      // 6. Schreiben Weekly Credits Check (POST /learning/schreiben/check or GET /learning/schreiben/check)
      if ((request.method === "POST" || request.method === "GET") && url.pathname === "/learning/schreiben/check") {
        const authHeader = request.headers.get("Authorization") || "";
        const idToken = authHeader.replace(/^Bearer\s+/i, "").trim();

        if (!idToken) {
          return responseJSON({ error: "Unauthorized: Missing Authorization Bearer token." }, 401, request);
        }

        const tokenPayload = await verifyFirebaseToken(idToken, env);
        if (!tokenPayload || !tokenPayload.sub) {
          return responseJSON({ error: "Unauthorized: Invalid or unverified Firebase ID token signature." }, 401, request);
        }

        const uid = tokenPayload.sub;
        if (!env.SUPABASE_SERVICE_ROLE_KEY) {
          return responseJSON(
            { error: "Server Configuration Error: SUPABASE_SERVICE_ROLE_KEY environment binding is missing." },
            500,
            request
          );
        }
        const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = (env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, "");

        // 1. Fetch user row
        const userRes = await fetch(`${supabaseUrl}/rest/v1/learning_users?uid=eq.${encodeURIComponent(uid)}&select=*`, {
          headers: {
            "apikey": serviceRoleKey,
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
        });

        if (!userRes.ok) {
          const errText = await userRes.text();
          return responseJSON({ error: `Supabase user fetch error (${userRes.status}): ${errText}` }, userRes.status, request);
        }

        const userData = await userRes.json();
        let userRow = userData && userData.length > 0 ? userData[0] : null;
        const membershipCode = ((userRow && userRow.membership) || "FREE").toUpperCase().trim();

        // 2. Fetch plan details (authoritative allowance)
        const planRes = await fetch(`${supabaseUrl}/rest/v1/plans?code=eq.${encodeURIComponent(membershipCode)}&select=*`, {
          headers: {
            "apikey": serviceRoleKey,
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
        });

        if (!planRes.ok) {
          const errText = await planRes.text();
          return responseJSON({ error: `Supabase plan fetch error (${planRes.status}): ${errText}` }, planRes.status, request);
        }

        const planData = await planRes.json();
        const plan = planData && planData[0];
        const schreibenEnabled = Boolean(plan && plan.schreiben_enabled);
        const weeklySchreibenLimit = (plan && typeof plan.weekly_schreiben_limit === "number") ? plan.weekly_schreiben_limit : 0;

        // Initialize user record if missing
        if (!userRow) {
          const todayIsoDate = new Date().toISOString().split("T")[0];
          const nowIso = new Date().toISOString();
          const dailyPracticeCredits = (plan && typeof plan.daily_practice_credits === "number") ? plan.daily_practice_credits : 10;
          const newUser = {
            uid,
            membership: membershipCode,
            current_level: "A1",
            format: "goethe",
            credits_remaining: dailyPracticeCredits,
            last_reset: todayIsoDate,
            schreiben_credits_remaining: weeklySchreibenLimit,
            schreiben_last_reset: nowIso,
            created_at: nowIso,
            updated_at: nowIso,
          };

          const createRes = await fetch(`${supabaseUrl}/rest/v1/learning_users`, {
            method: "POST",
            headers: {
              "apikey": serviceRoleKey,
              "Authorization": `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
              "Prefer": "resolution=merge-duplicates,return=representation",
            },
            body: JSON.stringify([newUser]),
          });

          if (!createRes.ok) {
            const errText = await createRes.text();
            return responseJSON({ error: `Supabase user creation error (${createRes.status}): ${errText}` }, createRes.status, request);
          }

          const createdData = await createRes.json();
          userRow = createdData && createdData.length > 0 ? createdData[0] : newUser;
        }

        // 3. Timezone and weekly reset check
        const userTimezone = userRow.timezone || "UTC";
        const currentWeekStart = getLocalCalendarWeekStart(new Date(), userTimezone);
        let schreibenLastReset = userRow.schreiben_last_reset ? String(userRow.schreiben_last_reset) : "";
        let schreibenCreditsRemaining = typeof userRow.schreiben_credits_remaining === "number"
          ? userRow.schreiben_credits_remaining
          : weeklySchreibenLimit;

        let needsReset = false;
        if (!schreibenLastReset) {
          needsReset = true;
        } else {
          const lastResetWeekStart = getLocalCalendarWeekStart(schreibenLastReset, userTimezone);
          if (currentWeekStart > lastResetWeekStart) {
            needsReset = true;
          }
        }

        if (needsReset) {
          schreibenCreditsRemaining = weeklySchreibenLimit;
          schreibenLastReset = new Date().toISOString();

          await fetch(`${supabaseUrl}/rest/v1/learning_users?uid=eq.${encodeURIComponent(uid)}`, {
            method: "PATCH",
            headers: {
              "apikey": serviceRoleKey,
              "Authorization": `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              schreiben_credits_remaining: schreibenCreditsRemaining,
              schreiben_last_reset: schreibenLastReset,
              updated_at: new Date().toISOString(),
            }),
          });
        }

        return responseJSON(
          {
            success: true,
            uid,
            membership: membershipCode,
            schreiben_enabled: schreibenEnabled,
            schreiben_credits_remaining: schreibenCreditsRemaining,
            weekly_schreiben_limit: weeklySchreibenLimit,
            schreiben_last_reset: schreibenLastReset,
            timezone: userTimezone,
          },
          200,
          request
        );
      }

      // 7. Atomic Schreiben Credit Consumption & Evaluation (POST /learning/schreiben/evaluate)
      if (request.method === "POST" && url.pathname === "/learning/schreiben/evaluate") {
        const authHeader = request.headers.get("Authorization") || "";
        const idToken = authHeader.replace(/^Bearer\s+/i, "").trim();

        if (!idToken) {
          return responseJSON({ error: "Unauthorized: Missing Authorization Bearer token." }, 401, request);
        }

        const tokenPayload = await verifyFirebaseToken(idToken, env);
        if (!tokenPayload || !tokenPayload.sub) {
          return responseJSON({ error: "Unauthorized: Invalid or unverified Firebase ID token signature." }, 401, request);
        }

        const uid = tokenPayload.sub;
        if (!env.SUPABASE_SERVICE_ROLE_KEY) {
          return responseJSON(
            { error: "Server Configuration Error: SUPABASE_SERVICE_ROLE_KEY environment binding is missing." },
            500,
            request
          );
        }
        const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = (env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, "");

        // 1. Fetch user row
        const userRes = await fetch(`${supabaseUrl}/rest/v1/learning_users?uid=eq.${encodeURIComponent(uid)}&select=*`, {
          headers: {
            "apikey": serviceRoleKey,
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
        });

        if (!userRes.ok) {
          const errText = await userRes.text();
          return responseJSON({ error: `Supabase user fetch error (${userRes.status}): ${errText}` }, userRes.status, request);
        }

        const userData = await userRes.json();
        let userRow = userData && userData.length > 0 ? userData[0] : null;
        const membershipCode = ((userRow && userRow.membership) || "FREE").toUpperCase().trim();

        // 2. Fetch plan details
        const planRes = await fetch(`${supabaseUrl}/rest/v1/plans?code=eq.${encodeURIComponent(membershipCode)}&select=*`, {
          headers: {
            "apikey": serviceRoleKey,
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
        });

        if (!planRes.ok) {
          const errText = await planRes.text();
          return responseJSON({ error: `Supabase plan fetch error (${planRes.status}): ${errText}` }, planRes.status, request);
        }

        const planData = await planRes.json();
        const plan = planData && planData[0];
        const schreibenEnabled = Boolean(plan && plan.schreiben_enabled);
        const weeklySchreibenLimit = (plan && typeof plan.weekly_schreiben_limit === "number") ? plan.weekly_schreiben_limit : 0;

        // Re-check user's Schreiben eligibility
        if (!schreibenEnabled) {
          return responseJSON(
            {
              success: false,
              error: "schreiben_not_enabled",
              message: "Schreiben evaluation is not enabled for your plan.",
              schreiben_enabled: false,
              schreiben_credits_remaining: 0,
              membership: membershipCode,
            },
            403,
            request
          );
        }

        // Initialize user record if missing
        if (!userRow) {
          const todayIsoDate = new Date().toISOString().split("T")[0];
          const nowIso = new Date().toISOString();
          const dailyPracticeCredits = (plan && typeof plan.daily_practice_credits === "number") ? plan.daily_practice_credits : 10;
          const newUser = {
            uid,
            membership: membershipCode,
            current_level: "A1",
            format: "goethe",
            credits_remaining: dailyPracticeCredits,
            last_reset: todayIsoDate,
            schreiben_credits_remaining: weeklySchreibenLimit,
            schreiben_last_reset: nowIso,
            created_at: nowIso,
            updated_at: nowIso,
          };

          const createRes = await fetch(`${supabaseUrl}/rest/v1/learning_users`, {
            method: "POST",
            headers: {
              "apikey": serviceRoleKey,
              "Authorization": `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
              "Prefer": "resolution=merge-duplicates,return=representation",
            },
            body: JSON.stringify([newUser]),
          });

          if (createRes.ok) {
            const createdData = await createRes.json();
            userRow = createdData && createdData.length > 0 ? createdData[0] : newUser;
          } else {
            userRow = newUser;
          }
        }

        // 3. Timezone and weekly reset check before allowing evaluation
        const userTimezone = userRow.timezone || "UTC";
        const currentWeekStart = getLocalCalendarWeekStart(new Date(), userTimezone);
        let schreibenLastReset = userRow.schreiben_last_reset ? String(userRow.schreiben_last_reset) : "";
        let schreibenCreditsRemaining = typeof userRow.schreiben_credits_remaining === "number"
          ? userRow.schreiben_credits_remaining
          : weeklySchreibenLimit;

        const isNewWeek = !schreibenLastReset || (currentWeekStart > getLocalCalendarWeekStart(schreibenLastReset, userTimezone));

        // If new week has started, reset allowance before checking balance (do not deduct yet)
        if (isNewWeek) {
          schreibenCreditsRemaining = weeklySchreibenLimit;
          schreibenLastReset = new Date().toISOString();

          await fetch(
            `${supabaseUrl}/rest/v1/learning_users?uid=eq.${encodeURIComponent(uid)}`,
            {
              method: "PATCH",
              headers: {
                "apikey": serviceRoleKey,
                "Authorization": `Bearer ${serviceRoleKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                schreiben_credits_remaining: schreibenCreditsRemaining,
                schreiben_last_reset: schreibenLastReset,
                updated_at: new Date().toISOString(),
              }),
            }
          );
        }

        // Re-check remaining credits before allowing evaluation
        if (schreibenCreditsRemaining <= 0) {
          return responseJSON(
            {
              success: false,
              error: "insufficient_credits",
              message: "You have used all your weekly Schreiben credits. Quota resets next week.",
              schreiben_enabled: true,
              schreiben_credits_remaining: 0,
              weekly_schreiben_limit: weeklySchreibenLimit,
              membership: membershipCode,
            },
            403,
            request
          );
        }

        // 4. Validate input payload and obtain authoritative exam task
        let body = {};
        try {
          body = await request.json();
        } catch (e) {
          body = {};
        }

        // Helper: retrieve authoritative task details from Supabase & R2
        async function fetchAuthoritativeTask(matId) {
          if (!matId || matId === "schreiben-fallback") return null;
          try {
            const matRes = await fetch(`${supabaseUrl}/rest/v1/materials?id=eq.${encodeURIComponent(matId)}&select=*`, {
              headers: {
                "apikey": serviceRoleKey,
                "Authorization": `Bearer ${serviceRoleKey}`,
              },
            });
            if (!matRes.ok) return null;
            const matData = await matRes.json();
            const dbMat = matData && matData.length > 0 ? matData[0] : null;
            if (!dbMat) return null;

            let contentData = null;
            const contentPath = String(dbMat.content_path || "").trim();
            if (contentPath) {
              if (env.R2_BUCKET) {
                const cleanKey = contentPath.replace(/^https?:\/\/[^\/]+\//, "").replace(/^\/+/, "");
                try {
                  const r2Obj = await env.R2_BUCKET.get(cleanKey);
                  if (r2Obj) {
                    contentData = await r2Obj.json();
                  }
                } catch (r2Err) {
                  console.warn("R2 direct read failed for key:", cleanKey, r2Err);
                }
              }
              if (!contentData) {
                try {
                  const cdnOrigin = (env.PUBLIC_CDN_DOMAIN || url.origin).replace(/\/$/, "");
                  const fetchUrl = contentPath.startsWith("http")
                    ? contentPath
                    : `${cdnOrigin}/${contentPath.replace(/^\/+/, "")}`;
                  const cRes = await fetch(fetchUrl);
                  if (cRes.ok) {
                    contentData = await cRes.json();
                  }
                } catch (fetchErr) {
                  console.warn("HTTP fetch for content failed:", fetchErr);
                }
              }
            }

            const exam = String(contentData?.exam || dbMat.exam || "").toLowerCase().trim();
            const level = String(contentData?.level || dbMat.level || "").toUpperCase().trim();
            const teil = String(contentData?.teil || dbMat.teil || "").trim();
            const situation = String(contentData?.situation || contentData?.context || contentData?.passage || dbMat.description || "").trim();
            const task = String(contentData?.task || contentData?.prompt || contentData?.instructions || contentData?.question || "").trim();

            let points = [];
            const rawPoints = contentData?.points || contentData?.bullet_points || contentData?.guidelines || contentData?.cues || (Array.isArray(contentData?.questions) && contentData?.questions[0]?.points);
            if (Array.isArray(rawPoints)) {
              points = rawPoints.map(p => typeof p === "string" ? p.trim() : String(p?.text || p?.point || "").trim()).filter(Boolean);
            } else if (typeof rawPoints === "string" && rawPoints.trim()) {
              points = [rawPoints.trim()];
            }

            const wordLimit = typeof contentData?.word_limit === "number" ? contentData.word_limit : (dbMat.word_limit || 200);

            return {
              materialId: dbMat.id,
              exam,
              level,
              teil,
              situation,
              task,
              points,
              wordLimit,
              title: contentData?.title || dbMat.title || "",
              isAuthoritative: true,
            };
          } catch (err) {
            console.error("fetchAuthoritativeTask error:", err);
            return null;
          }
        }

        // Helper: validate and resolve exam, level, and teil explicitly — never silently default to Teil 2
        function resolveExamLevelTeil(rawExam, rawLevel, rawTeil) {
          const exam = String(rawExam || "").toLowerCase().trim();
          const level = String(rawLevel || "").toUpperCase().trim();
          const teil = String(rawTeil || "").trim();

          if (!exam) {
            return { valid: false, error: "missing_exam", message: "The 'exam' field is required (e.g. 'goethe' or 'telc')." };
          }
          if (!["goethe", "telc"].includes(exam)) {
            return { valid: false, error: "invalid_exam", message: `Unsupported exam format: '${rawExam}'. Must be 'goethe' or 'telc'.` };
          }
          if (!level) {
            return { valid: false, error: "missing_level", message: "The 'level' field is required (e.g. 'A1', 'A2', 'B1', 'B2')." };
          }
          if (!["A1", "A2", "B1", "B2"].includes(level)) {
            return { valid: false, error: "invalid_level", message: `Unsupported level: '${rawLevel}'. Must be A1, A2, B1, or B2.` };
          }
          if (!teil) {
            return { valid: false, error: "missing_teil", message: "The 'teil' field is required (e.g. 'Teil 1', 'Teil 2'). The evaluator cannot apply the correct exam rubric without it." };
          }

          // Extract Teil number or keyword
          const match = teil.match(/\b(?:teil|part)\s*(\d+)\b/i) || teil.match(/^(\d+)$/) || teil.match(/\b([1-4])\b/);
          const num = match ? parseInt(match[1], 10) : null;
          const lowerTeil = teil.toLowerCase();

          let resolvedTeilNum = null;
          let resolvedLabel = null;

          if (exam === "goethe") {
            if (level === "A1") {
              if (num === 2 || lowerTeil.includes("teil 2") || lowerTeil.includes("mitteilung") || lowerTeil.includes("brief")) {
                resolvedTeilNum = 2;
                resolvedLabel = "Teil 2";
              } else if (num === 1 || lowerTeil.includes("teil 1") || lowerTeil.includes("formular")) {
                resolvedTeilNum = 1;
                resolvedLabel = "Teil 1";
              }
            } else if (level === "A2") {
              if (num === 1 || lowerTeil.includes("teil 1") || lowerTeil.includes("sms") || lowerTeil.includes("notiz")) {
                resolvedTeilNum = 1;
                resolvedLabel = "Teil 1";
              } else if (num === 2 || lowerTeil.includes("teil 2") || lowerTeil.includes("e-mail") || lowerTeil.includes("brief")) {
                resolvedTeilNum = 2;
                resolvedLabel = "Teil 2";
              }
            } else if (level === "B1") {
              if (num === 1 || lowerTeil.includes("teil 1") || lowerTeil.includes("persönliche") || lowerTeil.includes("e-mail")) {
                resolvedTeilNum = 1;
                resolvedLabel = "Teil 1";
              } else if (num === 2 || lowerTeil.includes("teil 2") || lowerTeil.includes("forum") || lowerTeil.includes("meinung")) {
                resolvedTeilNum = 2;
                resolvedLabel = "Teil 2";
              } else if (num === 3 || lowerTeil.includes("teil 3") || lowerTeil.includes("entschuldigung") || lowerTeil.includes("bitte")) {
                resolvedTeilNum = 3;
                resolvedLabel = "Teil 3";
              }
            } else if (level === "B2") {
              if (num === 1 || lowerTeil.includes("teil 1") || lowerTeil.includes("forum") || lowerTeil.includes("diskussion")) {
                resolvedTeilNum = 1;
                resolvedLabel = "Teil 1";
              } else if (num === 2 || lowerTeil.includes("teil 2") || lowerTeil.includes("nachricht") || lowerTeil.includes("beschwerde") || lowerTeil.includes("bitte")) {
                resolvedTeilNum = 2;
                resolvedLabel = "Teil 2";
              }
            }
          } else if (exam === "telc") {
            if (level === "A1") {
              if (num === 2 || lowerTeil.includes("teil 2") || lowerTeil.includes("mitteilung")) {
                resolvedTeilNum = 2;
                resolvedLabel = "Teil 2";
              } else if (num === 1 || lowerTeil.includes("teil 1") || lowerTeil.includes("formular")) {
                resolvedTeilNum = 1;
                resolvedLabel = "Teil 1";
              }
            } else if (level === "A2") {
              if (num === 2 || lowerTeil.includes("teil 2") || lowerTeil.includes("brief") || lowerTeil.includes("e-mail")) {
                resolvedTeilNum = 2;
                resolvedLabel = "Teil 2";
              } else if (num === 1 || lowerTeil.includes("teil 1") || lowerTeil.includes("formular")) {
                resolvedTeilNum = 1;
                resolvedLabel = "Teil 1";
              }
            } else if (level === "B1") {
              if (num === 1 || num === 2 || lowerTeil.includes("brief") || lowerTeil.includes("e-mail")) {
                resolvedTeilNum = num || 1;
                resolvedLabel = `Teil ${resolvedTeilNum}`;
              }
            } else if (level === "B2") {
              if (num === 1 || lowerTeil.includes("teil 1") || lowerTeil.includes("e-mail") || lowerTeil.includes("brief")) {
                resolvedTeilNum = 1;
                resolvedLabel = "Teil 1";
              } else if (num === 2 || lowerTeil.includes("teil 2") || lowerTeil.includes("beschwerde")) {
                resolvedTeilNum = 2;
                resolvedLabel = "Teil 2";
              }
            }
          }

          // Fallback check if num is valid (1-4)
          if (!resolvedTeilNum && num && num >= 1 && num <= 4) {
            resolvedTeilNum = num;
            resolvedLabel = `Teil ${num}`;
          }

          if (!resolvedTeilNum || !resolvedLabel) {
            return {
              valid: false,
              error: "invalid_teil",
              message: `Cannot determine a valid examination Teil from '${rawTeil}' for ${exam.toUpperCase()} ${level}. Valid Teile are e.g. 'Teil 1', 'Teil 2'.`
            };
          }

          return {
            valid: true,
            exam,
            level,
            teil: resolvedLabel,
            teilNum: resolvedTeilNum
          };
        }

        const materialId = String(body.material_id || "").trim();
        const authoritativeTask = await fetchAuthoritativeTask(materialId);

        let rawExam = authoritativeTask?.exam || String(body.exam || body.format || "").trim();
        let rawLevel = authoritativeTask?.level || String(body.level || "").trim();
        let rawTeil = authoritativeTask?.teil || String(body.teil || body.part || "").trim();
        let situationText = authoritativeTask?.situation || String(body.situation || body.context || body.passage || "").trim();
        let instructionText = authoritativeTask?.task || "";
        let pointsList = (authoritativeTask?.points && authoritativeTask.points.length > 0)
          ? authoritativeTask.points
          : (Array.isArray(body.points) ? body.points.map(p => typeof p === "string" ? p.trim() : String(p?.text || p?.point || "").trim()).filter(Boolean) : []);
        const wordLimit = authoritativeTask?.wordLimit || (typeof body.word_limit === "number" ? body.word_limit : 200);

        // Fallback: parse client task string if instructionText or situationText still missing
        const rawTask = String(body.task || body.prompt || body.question || "").trim();
        if (rawTask) {
          const situationMatch = rawTask.match(/(?:Situation\s*\/?\s*Kontext|Kontext|Situation)\s*:\s*([\s\S]*?)(?=(?:Aufgabe|Punkte|Leitpunkte)\s*:|$)/i);
          const instructionMatch = rawTask.match(/Aufgabe\s*:\s*([\s\S]*?)(?=(?:Punkte|Leitpunkte)\s*:|$)/i);
          const pointsMatch = rawTask.match(/(?:Punkte|Leitpunkte)\s*:\s*([\s\S]*)$/i);

          if (situationMatch && !situationText) {
            situationText = situationMatch[1].trim();
          }
          if (instructionMatch && !instructionText) {
            instructionText = instructionMatch[1].trim();
          }
          if (pointsMatch && pointsList.length === 0) {
            pointsList = pointsMatch[1]
              .split(/\r?\n/)
              .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
              .filter(Boolean);
          }
        }

        if (!instructionText) {
          instructionText = rawTask;
        }

        // Reject if task is missing or a generic placeholder
        const isGenericPlaceholder = (instructionText || rawTask).toLowerCase() === "schreibaufgabe";
        if (
          (!rawTask && !instructionText && !situationText && pointsList.length === 0) ||
          (isGenericPlaceholder && !situationText && pointsList.length === 0)
        ) {
          return responseJSON(
            {
              success: false,
              error: "missing_task",
              message: "Authoritative exam task could not be resolved or task details are missing. Cannot evaluate without a valid examination task.",
            },
            400,
            request
          );
        }

        // Validate and resolve exam, level, and teil strictly — never silently default
        const teilResolution = resolveExamLevelTeil(rawExam, rawLevel, rawTeil);
        if (!teilResolution.valid) {
          return responseJSON(
            { success: false, error: teilResolution.error, message: teilResolution.message },
            400,
            request
          );
        }

        const examFormat = teilResolution.exam;
        const level = teilResolution.level;
        const teilText = teilResolution.teil;
        const teilNum = teilResolution.teilNum;

        const studentAnswer = String(body.answer || body.student_answer || "").trim();
        if (!studentAnswer) {
          return responseJSON(
            { success: false, error: "empty_answer", message: "Answer cannot be empty." },
            400,
            request
          );
        }

        // Count words in student answer
        const wordCount = studentAnswer.split(/\s+/).filter(Boolean).length;
        const allowedWordCap = Math.max(200, wordLimit);
        if (wordCount > allowedWordCap) {
          return responseJSON(
            {
              success: false,
              error: "word_limit_exceeded",
              message: `Your answer exceeds the maximum allowed ${allowedWordCap} words (current: ${wordCount} words).`,
            },
            400,
            request
          );
        }

        const pointsFormatted = pointsList.length > 0
          ? pointsList.map((p, idx) => `Leitpunkt ${idx + 1}: ${p}`).join("\n")
          : "Address all instructions and requirements specified in the EXAM TASK.";

        // 5. Check Gemini API Secret in Worker Environment
        const geminiApiKey = env.GEMINI_API_KEY;
        if (!geminiApiKey) {
          return responseJSON(
            {
              success: false,
              error: "server_config_error",
              message: "Server Configuration Error: GEMINI_API_KEY secret is not bound to the Cloudflare Worker.",
            },
            500,
            request
          );
        }

         // Helper: retrieve reference writing criteria and checklist for specific exam, level, and Teil
         // NOTE: These criteria are based on generally published CEFR and exam guidelines.
         // They have NOT been independently verified against current official exam rubrics.
         function getWritingChecklist(exam, level, teilNum) {
           if (exam === "telc") {
             if (level === "A1") {
               return `EXAM WRITING CRITERIA & CHECKLIST (reference guide) — TELC DEUTSCH A1 (Teil 2: Kurze Mitteilung):
- Format & Expected Length: Short personal or semi-formal message/note (~30 words, typically 20–40 words).
- Required Structure: Suitable greeting/salutation, concise text body addressing all Leitpunkte, closing formula with sender's name.
- Register & Formality: Match context (informal 'du/ihr' for friends/colleagues vs. formal 'Sie/Ihnen' for formal recipients).
- Vocabulary & Connectors: Basic everyday A1 vocabulary; simple connectors ("und", "aber", "denn").
- Grammar & Syntax: Present tense, basic Perfekt, verb in position 2 in main clauses, simple question forms.
- Level Calibration: Simple, correct A1 German is fully sufficient for maximum marks. Do not penalize simple structures.`;
             }
             if (level === "A2") {
               return `EXAM WRITING CRITERIA & CHECKLIST (reference guide) — TELC DEUTSCH A2 (Teil 2: Kurzer Brief / E-Mail):
- Format & Expected Length: Short letter or email (~30–50 words).
- Required Structure: Clear salutation, structured body addressing all Leitpunkte, suitable closing formula and name.
- Register & Formality: Consistent register ('du/ihr' vs 'Sie/Ihnen') throughout.
- Connectors & Flow: Basic sentence connectors ("weil", "wenn", "deshalb", "denn", "dann").
- Grammar & Vocabulary: Present, Perfekt, modal verbs, prepositions with correct case (Akkusativ/Dativ), accurate everyday A2 vocabulary.
- Level Calibration: Reward effective communicative ability at A2 level. Do not expect complex subordinate clauses.`;
             }
             if (level === "B1") {
               return `EXAM WRITING CRITERIA & CHECKLIST (reference guide) — TELC DEUTSCH B1 (Brief / E-Mail):
- Format & Expected Length: Personal or semi-formal letter/email (~100 words).
- Required Structure: Full letter framework (appropriate salutation, introduction, distinct paragraphs for Leitpunkte, closing formula).
- Register & Formality: Precise adherence to register ('du/ihr' vs 'Sie/Ihnen'), courteous phrasing.
- Task Fulfillment: All provided Leitpunkte must be covered in detail with relevant explanations.
- Connectors & Coherence: Logical progression, connectors ("da", "obwohl", "trotzdem", "sowohl... als auch", "deswegen").
- Grammar & Vocabulary: Good range of B1 vocabulary, subordinate clauses (weil, dass, wenn, obwohl), relative clauses, infinitive with 'zu', correct cases and prepositions.
- Level Calibration: Judge against B1 standards. Clear, well-connected sentences without unnecessary artificial complexity.`;
             }
             if (level === "B2") {
               return `EXAM WRITING CRITERIA & CHECKLIST (reference guide) — TELC DEUTSCH B2 (Halbformelle / Formelle E-Mail):
- Format & Expected Length: Formal or semi-formal letter/email (~150 words, e.g. inquiry, complaint, application).
- Required Structure: Formal letter conventions (formal salutation, reference line/opening statement, well-structured arguments/requests, formal closing).
- Register & Formality: High formal register ('Sie/Ihnen', 'Sehr geehrte Damen und Herren', 'Mit freundlichen Grüßen'), diplomatic and polite tone.
- Task Fulfillment: Comprehensive, differentiated coverage of all Leitpunkte with clear arguments and concrete details.
- Connectors & Cohesion: Sophisticated transitions ("in Bezug auf", "darüber hinaus", "folglich", "demgegenüber").
- Grammar & Vocabulary: Varied B2 vocabulary, idiomatic and professional expressions, Passiv, Konjunktiv II, complex subordinate clauses, prepositions with Genitiv/Dativ.`;
             }
           }

           // GOETHE
           if (level === "A1") {
             return `EXAM WRITING CRITERIA & CHECKLIST (reference guide) — GOETHE A1 / START DEUTSCH 1 (Teil 2: Persönliche Kurzmitteilung):
- Format & Expected Length: Short personal or semi-formal message, email, or note (~30 words, typically 20–40 words).
- Required Structure: Appropriate greeting (e.g., "Liebe Eva,", "Hallo Paul," or formal "Sehr geehrte(r)..."), body sentences addressing all 3 Leitpunkte, proper sign-off ("Viele Grüße", "Herzliche Grüße") with sender name.
- Register & Formality: Consistent address matching the relationship ('du' for friends/colleagues, 'Sie' for formal recipients).
- Vocabulary & Connectors: Essential everyday A1 vocabulary; basic sentence linking ("und", "aber", "oder", "weil").
- Grammar & Syntax: Regular verb conjugations, verb in position 2 (V2) in statements, verb in position 1 in yes/no questions, basic object pronouns and cases.
- Level Calibration: A1 expects simple, comprehensible language. Full marks MUST be awarded for simple, accurate German that covers all Leitpunkte. Do NOT demand or reward overly complex constructions.`;
           }
           if (level === "A2") {
             if (teilNum === 1) {
               return `EXAM WRITING CRITERIA & CHECKLIST (reference guide) — GOETHE A2 (Teil 1: Kurze SMS / Notiz):
- Format & Expected Length: Brief informal message/SMS (~20–30 words) with 3 points.
- Structure: Short greeting, concise direct statements covering the 3 points, informal closing.
- Register: Informal ('du/ihr').
- Vocabulary & Grammar: Practical daily vocabulary, present tense or Perfekt, modal verbs, correct verb placement.`;
             }
             return `EXAM WRITING CRITERIA & CHECKLIST (reference guide) — GOETHE A2 (Teil 2: Persönliche / Halbformelle E-Mail):
- Format & Expected Length: Personal or semi-formal message/email (~40 words, typically 35–55 words).
- Required Structure: Correct salutation, cohesive text body covering all 3 Leitpunkte, suitable closing formula with name.
- Register & Formality: Consistent informal ('du') or semi-formal ('Sie') register.
- Connectors & Coherence: Linking with "weil", "denn", "deshalb", "wenn", "oder", "aber", temporal sequence ("zuerst", "dann").
- Grammar & Vocabulary: Correct Perfekt with haben/sein, modal verbs, accusative/dative prepositions, appropriate A2 lexical range.
- Level Calibration: Judge whether communication is effective at A2. Do not penalize absence of B-level structures.`;
           }
           if (level === "B1") {
             if (teilNum === 1) {
               return `EXAM WRITING CRITERIA & CHECKLIST (reference guide) — GOETHE B1 (Teil 1: Persönliche E-Mail):
- Format & Expected Length: Personal email (~80 words) covering 3 Leitpunkte (describing an event, giving reasons, making a proposal/meeting).
- Structure: Friendly opening ("Liebe/Lieber..."), thematic paragraphs for each Leitpunkt, affectionate closing ("Liebe Grüße", "Bis bald").
- Register: Informal ('du/ihr'), personal, conversational tone.
- Task Fulfillment: Descriptive depth, clear reasons, concrete suggestion.
- Connectors: "weil", "da", "deshalb", "obwohl", "trotzdem", "wenn", "um... zu".
- Grammar & Vocabulary: Past tenses (Perfekt/Präteritum), Konjunktiv II for polite suggestions, varied B1 vocabulary.`;
             }
             if (teilNum === 2) {
               return `EXAM WRITING CRITERIA & CHECKLIST (reference guide) — GOETHE B1 (Teil 2: Forumsbeitrag / Meinung):
- Format & Expected Length: Discussion forum contribution (~80 words).
- Structure: Opening statement addressing the forum topic, main body stating personal opinion and reasons, personal experience, brief conclusion.
- Register: Public but accessible/neutral (no personal salutation like "Liebe...", but neutral greeting like "Hallo zusammen" or direct entry).
- Task Fulfillment: Clear expression of opinion, justification, personal reflection.
- Connectors: Argumentative connectors ("Meiner Meinung nach...", "Ein Grund dafür ist...", "Außerdem...", "Zusammenfassend...").
- Grammar & Vocabulary: Opinion phrases, modal verbs, subordinate clauses with 'dass' and 'weil'.`;
             }
             return `EXAM WRITING CRITERIA & CHECKLIST (reference guide) — GOETHE B1 (Teil 3: Formelle Entschuldigung / Bitte):
- Format & Expected Length: Brief formal message (~40 words, e.g. apologising for absence, requesting an appointment).
- Structure: Formal salutation ("Sehr geehrte(r) Frau/Herr..."), clear concise reason/request, polite formal closing ("Mit freundlichen Grüßen").
- Register: Strict formal register ('Sie/Ihnen'), courteous tone.
- Task Fulfillment: Promptly and politely achieves communicative goal.
- Grammar: Polite Konjunktiv II ("Ich möchte Sie bitten...", "Könnten Sie bitte..."), correct formal forms.`;
           }
           if (level === "B2") {
             if (teilNum === 1) {
               return `EXAM WRITING CRITERIA & CHECKLIST (reference guide) — GOETHE B2 (Teil 1: Diskussionsbeitrag / Forumsbeitrag):
- Format & Expected Length: Well-developed opinion essay / forum post (minimum 150 words).
- Required Content Points: 1) Personal opinion with arguments, 2) Reasons/causes for the situation, 3) Alternative options, 4) Evaluation of advantages/disadvantages.
- Structure: Engaging introduction, distinct argumentative paragraphs with topic sentences, logical transitions, rounded conclusion.
- Register: Neutral, articulate, and objective.
- Connectors & Flow: "einerseits... andererseits", "darüber hinaus", "demgegenüber", "nicht nur... sondern auch", "folglich".
- Grammar & Vocabulary: High lexical variety, abstract B2 terminology, Passiv, Konjunktiv II, Nomen-Verb-Verbindungen, relative and causal clauses.`;
             }
             return `EXAM WRITING CRITERIA & CHECKLIST (reference guide) — GOETHE B2 (Teil 2: Formelle Nachricht / Beschwerde / Bitte):
- Format & Expected Length: Formal email (minimum 100 words, e.g. complaint, request, clarification).
- Structure: Standard formal letter layout (subject line concept, formal greeting, background context, detailed points of contention/request, deadline or expected action, formal sign-off).
- Register: Impeccable formal business register ('Sie/Ihnen'), diplomatic assertiveness.
- Grammar & Vocabulary: Advanced formal vocabulary, fixed idioms ("Ich wende mich an Sie, um...", "Bitte teilen Sie mir mit..."), passive forms, hypothetical and conditional clauses.`;
           }

           return `EXAM WRITING CRITERIA & CHECKLIST (reference guide) — ${exam.toUpperCase()} ${level} (Teil ${teilNum}):
- Task Fulfillment: Completely address all instructions and Leitpunkte.
- Structure: Logical layout, clear opening, developed body, appropriate closing.
- Register: Consistent formality ('du' vs 'Sie') matching the context.
- Connectors: Appropriate cohesive devices for CEFR ${level}.
- Grammar & Vocabulary: Accurate, effective usage calibrated strictly to CEFR ${level}. Do not penalize simple German if it is correct and completes the task.`;
         }


        const writingChecklist = getWritingChecklist(examFormat, level, teilNum);

        // 6. Call Gemini Evaluation API with comprehensive 13-phase examination prompt
        const evaluationPrompt = `
You are evaluating a specific ${examFormat.toUpperCase()} ${level} German examination writing task (${teilText}).
Your role is to act as a serious, rigorous, and evidence-based examination evaluator (like an official Goethe/telc examiner).
You are NOT an encouraging tutor. Do NOT inflate scores because the student made an effort, wrote understandable German, or used good grammar.
At the same time, do NOT unfairly penalize simple, correct German appropriate for CEFR ${level}. Simple correct language that fulfills all task points MUST be awarded full or near-full marks.
Do NOT invent mistakes. Do NOT rewrite the text. Evaluate strictly in 13 phases in the exact order below.

EXAM SPECIFICATIONS:
- Examination format: ${examFormat.toUpperCase()}
- CEFR Level: ${level}
- Teil / Component: ${teilText}

EXAM SITUATION:
${situationText || "No additional situation provided."}

EXAM TASK:
${instructionText || rawTask}

REQUIRED LEITPUNKTE / POINTS:
${pointsFormatted}

STUDENT SUBMISSION:
${studentAnswer}

================================================================================
EXAM-ALIGNED REFERENCE CRITERIA — ${examFormat.toUpperCase()} ${level} ${teilText.toUpperCase()}:
================================================================================
${writingChecklist}

MANDATORY EVALUATION PROCEDURE — YOU MUST EXECUTE ALL 13 PHASES IN ORDER:

PHASE 1: Understand the exam scenario, context, and required communicative goal.
PHASE 2: Analyze each required Leitpunkt independently. What exact information or action does it demand?
PHASE 3: Read the complete student submission carefully.
PHASE 4: Language Composition Check (FIRST GATE):
  - Is the submission written in German?
  - If mostly in English/non-German (>50% non-German or primary language is English):
    * set severity = "mostly_non_german", language_problem = true, Task Fulfillment score = 0, recommended_score_percent = 0 to 10.
    * Do NOT evaluate English grammar/vocabulary. Do NOT list mistakes (no German to correct).
  - If substantial English (multiple sentences in English): severity = "substantial", language_problem = true.
  - If one complete required Leitpunkt is written in English: classify that Leitpunkt as "missing" or "partial" (severity = "partial_leitpunkt"). English cannot fulfill a German requirement.
  - If only incidental foreign words (e.g. proper names, brand names, single common words): severity = "minor_incidental" or "none", language_problem = false. Do NOT penalize.
PHASE 5: Individual Leitpunkt Assessment:
  - For EVERY required Leitpunkt, classify it as EXACTLY one of: "fulfilled", "partial", "missing".
  - "fulfilled": Clearly, comprehensibly, and adequately communicated in German.
  - "partial": Incomplete, vague, or heavily obscured by errors. "Implicit" coverage may ONLY receive "partial" if the information is genuinely inferable.
  - "missing": Completely omitted, ignored, or written in non-German.
  - Concrete textual evidence from the student's submission is REQUIRED for each Leitpunkt.
  - Generic statements do NOT satisfy personal experience requirements (e.g., "Public transport is useful" does NOT satisfy "Report your personal experience").
  - Describing a problem does NOT satisfy "Make a proposal".
PHASE 6: Overall Relevance:
  - Is the answer on-topic, partially relevant, or off-topic?
  - If completely off-topic: overall_relevance = "off_topic", all Leitpunkte = "missing", Task Fulfillment score = 0, recommended_score_percent = 0 to 20.
PHASE 7: Length & Development:
  - Student answer word count: ${wordCount} words.
  - Judge whether the text is sufficiently developed for ${examFormat.toUpperCase()} ${level} (${teilText}).
  - A very short B1/B2 text that merely lists points without development has a development problem.
  - An A1/A2 text that is concise but covers all points is completely acceptable.
PHASE 8: Format & Register:
  - Appropriate greeting and closing for the format (e.g., email, letter, note, forum post)?
  - Register consistency: 'du/ihr' vs 'Sie/Ihnen'.
PHASE 9: Task Fulfillment Criterion (0 to 5, increments of 0.5):
  - Driven strictly by Leitpunkt fulfillment and scenario relevance.
PHASE 10: Coherence & Structure Criterion (0 to 5, increments of 0.5):
  - Paragraphing, connectors, text layout, logical flow appropriate for CEFR ${level}.
PHASE 11: Vocabulary & Grammar Criteria (0 to 5 each, increments of 0.5):
  - Vocabulary: Lexical range and naturalness calibrated to CEFR ${level}. Do not demand B2 words from A1.
  - Grammar & Form: Accurate verb position, conjugation, cases, prepositions, capitalization.
PHASE 12: Conservative Error Identification:
  - Flag ONLY genuine grammatical, orthographical, or structural errors.
  - Do NOT flag stylistic preferences, colloquialisms, or valid alternative formulations.
  - For each mistake: provide "original", "correction", "type" ("grammar"|"vocabulary"|"spelling"|"punctuation"), and concise "explanation" in English.
PHASE 13: Recommended Score (0 to 95):
  - Provide recommended_score_percent (integer 0 to 95, never exceed 95).

OUTPUT FORMAT:
Respond ONLY with a valid JSON object matching this exact schema (no markdown fences, no explanatory text outside JSON):
{
  "language": {
    "primary_language": "German",
    "german_percentage_estimate": <number 0-100>,
    "non_german_percentage_estimate": <number 0-100>,
    "language_problem": <boolean>,
    "severity": "<none | minor_incidental | partial_leitpunkt | substantial | mostly_non_german>"
  },
  "task_analysis": {
    "overall_relevance": "<on_topic | partially_relevant | off_topic>",
    "task_fulfillment_level": "<complete | mostly_complete | partial | minimal | none>",
    "missing_count": <integer>,
    "partial_count": <integer>,
    "leitpunkte": [
      {
        "index": 1,
        "status": "<fulfilled | partial | missing>",
        "evidence": "<exact quote from student text or 'None'>",
        "explanation": "<concise English explanation of fulfillment decision>"
      }
    ]
  },
  "length": {
    "word_count": ${wordCount},
    "too_short": <boolean>,
    "too_long": <boolean>,
    "development_problem": <boolean>
  },
  "format": {
    "type": "<email | letter | forum_post | note | other>",
    "appropriate": <boolean>,
    "register": "<informal | formal | neutral>",
    "register_appropriate": <boolean>
  },
  "criteria": [
    {
      "name": "Task Fulfillment",
      "score": <number 0-5, increments of 0.5>,
      "max_score": 5,
      "reason": "<concise English feedback on Leitpunkte fulfillment>"
    },
    {
      "name": "Coherence & Structure",
      "score": <number 0-5, increments of 0.5>,
      "max_score": 5,
      "reason": "<concise English feedback on text flow, layout, and connectors>"
    },
    {
      "name": "Vocabulary",
      "score": <number 0-5, increments of 0.5>,
      "max_score": 5,
      "reason": "<concise English feedback on vocabulary range and level-appropriateness>"
    },
    {
      "name": "Grammar & Form",
      "score": <number 0-5, increments of 0.5>,
      "max_score": 5,
      "reason": "<concise English feedback on grammatical accuracy, syntax, and spelling>"
    }
  ],
  "mistakes": [
    {
      "original": "<exact German phrase with error>",
      "correction": "<corrected German phrasing>",
      "type": "<grammar | vocabulary | spelling | punctuation>",
      "explanation": "<concise English grammatical explanation>"
    }
  ],
  "feedback": "<overall qualitative evaluation summary in English>",
  "recommended_score_percent": <integer 0-95>
}
`.trim();

        // --- Helper: fetch ordered list of low-cost Flash/Flash-Lite models (FIX 7) ---
        async function getAvailableFlashModels(apiKey) {
          try {
            const listRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
              { method: "GET" }
            );
            if (!listRes.ok) return null;
            const listData = await listRes.json();
            const models = Array.isArray(listData.models) ? listData.models : [];

            // Filter: must support generateContent, name must contain "flash",
            // must NOT contain "pro", "ultra", or "thinking"
            const filtered = models.filter((m) => {
              const n = (m.name || "").toLowerCase();
              const methods = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
              return (
                methods.includes("generateContent") &&
                n.includes("flash") &&
                !n.includes("pro") &&
                !n.includes("ultra") &&
                !n.includes("thinking")
              );
            });

            // Sort: flash-lite before flash, newer versions before older
            filtered.sort((a, b) => {
              const na = (a.name || "").toLowerCase();
              const nb = (b.name || "").toLowerCase();
              const aLite = na.includes("flash-lite") ? 0 : 1;
              const bLite = nb.includes("flash-lite") ? 0 : 1;
              if (aLite !== bLite) return aLite - bLite;
              const verA = (na.match(/(\d+\.\d+|\d+)/) || ["0"])[0];
              const verB = (nb.match(/(\d+\.\d+|\d+)/) || ["0"])[0];
              return parseFloat(verB) - parseFloat(verA);
            });

            // Return short model IDs (strip "models/" prefix)
            return filtered.map((m) => m.name.replace(/^models\//, ""));
          } catch (e) {
            console.error("Failed to list Gemini models:", e);
            return null;
          }
        }

        const fallbackModels = [
          "gemini-3.5-flash-lite",
          "gemini-3.1-flash-lite",
          "gemini-2.5-flash-lite",
          "gemini-2.5-flash",
          "gemini-2.0-flash-lite",
          "gemini-2.0-flash"
        ];

        // Central deterministic rule engine: enforces hard exam caps and boundaries
        function applySchreibenScoreRules(geminiAnalysis, taskData, actualWordCount) {
          const appliedRules = [];

          // 1. Sanitize criteria
          const nameMapping = {
            "aufgabenerfüllung": "Task Fulfillment",
            "task fulfillment": "Task Fulfillment",
            "task fulfilment": "Task Fulfillment",
            "kohärenz & textaufbau": "Coherence & Structure",
            "kohärenz & aufbau": "Coherence & Structure",
            "coherence & structure": "Coherence & Structure",
            "coherence and structure": "Coherence & Structure",
            "wortschatz": "Vocabulary",
            "vocabulary": "Vocabulary",
            "grammatik & form": "Grammar & Form",
            "grammatik": "Grammar & Form",
            "grammar & form": "Grammar & Form",
            "grammar and form": "Grammar & Form",
          };

          const REQUIRED_CRITERIA = ["Task Fulfillment", "Coherence & Structure", "Vocabulary", "Grammar & Form"];
          const criteriaIn = Array.isArray(geminiAnalysis?.criteria) ? geminiAnalysis.criteria : [];
          const criteriaMap = {};

          for (const c of criteriaIn) {
            const rawName = String(c.name || "").trim();
            const normalizedName = nameMapping[rawName.toLowerCase()] || rawName;
            const rawScore = typeof c.score === "number" ? c.score : parseFloat(String(c.score || "0"));
            if (isNaN(rawScore) || rawScore < 0 || rawScore > 10) {
              throw new Error(`Invalid score for criterion "${rawName}": ${JSON.stringify(c.score)}`);
            }
            const clampedScore = Math.max(0.0, Math.min(5.0, Math.round(rawScore * 2) / 2));
            const reasonText = String(c.reason || c.feedback || "");
            criteriaMap[normalizedName] = {
              name: normalizedName,
              score: clampedScore,
              max_score: 5,
              reason: reasonText,
              feedback: reasonText,
            };
          }

          for (const req of REQUIRED_CRITERIA) {
            if (!criteriaMap[req]) {
              throw new Error(`Missing required criterion: ${req}`);
            }
          }

          let tfScore = criteriaMap["Task Fulfillment"].score;
          let csScore = criteriaMap["Coherence & Structure"].score;
          let vocabScore = criteriaMap["Vocabulary"].score;
          let gramScore = criteriaMap["Grammar & Form"].score;

          let scoreCap = 95;
          let tfCap = 5.0;
          let csCap = 5.0;

          // 2. Leitpunkte decisions
          const taskAnalysis = geminiAnalysis?.task_analysis || {};
          const leitpunkte = Array.isArray(taskAnalysis.leitpunkte) ? taskAnalysis.leitpunkte : [];
          const totalLeitpunkte = leitpunkte.length > 0
            ? leitpunkte.length
            : (Array.isArray(taskData?.points) && taskData.points.length > 0 ? taskData.points.length : 0);

          let missingCount = 0;
          let partialCount = 0;
          for (const lp of leitpunkte) {
            const st = String(lp.status || "").toLowerCase();
            if (st === "missing") missingCount++;
            else if (st === "partial") partialCount++;
          }

          if (typeof taskAnalysis.missing_count === "number") {
            missingCount = Math.max(missingCount, taskAnalysis.missing_count);
          }
          if (typeof taskAnalysis.partial_count === "number") {
            partialCount = Math.max(partialCount, taskAnalysis.partial_count);
          }

          // 3. Language evaluation
          const lang = geminiAnalysis?.language || {};
          const primaryLang = String(lang.primary_language || "German").toLowerCase();
          const nonGermanPct = typeof lang.non_german_percentage_estimate === "number"
            ? lang.non_german_percentage_estimate
            : parseFloat(String(lang.non_german_percentage_estimate || "0"));
          const langSeverity = String(lang.severity || "none").toLowerCase();

          if (nonGermanPct > 50 || langSeverity === "mostly_non_german" || primaryLang.includes("english")) {
            tfCap = Math.min(tfCap, 0.0);
            scoreCap = Math.min(scoreCap, 10);
            appliedRules.push("language_mostly_non_german_cap_10");
          } else if (langSeverity === "substantial" || nonGermanPct >= 30) {
            tfCap = Math.min(tfCap, 1.5);
            scoreCap = Math.min(scoreCap, 40);
            appliedRules.push("language_substantial_english_cap_40");
          } else if (langSeverity === "partial_leitpunkt") {
            tfCap = Math.min(tfCap, 3.0);
            scoreCap = Math.min(scoreCap, 65);
            appliedRules.push("language_english_leitpunkt_cap_65");
          }

          // 4. Off-topic check
          const overallRel = String(taskAnalysis.overall_relevance || "on_topic").toLowerCase();
          if (overallRel === "off_topic") {
            tfCap = Math.min(tfCap, 0.0);
            scoreCap = Math.min(scoreCap, 20);
            appliedRules.push("off_topic_cap_20");
          }

          // 5. Leitpunkte caps
          if (totalLeitpunkte > 0) {
            if (missingCount >= totalLeitpunkte || overallRel === "off_topic") {
              tfCap = Math.min(tfCap, 0.0);
              scoreCap = Math.min(scoreCap, 20);
              appliedRules.push("all_leitpunkte_missing_cap_20");
            } else if (missingCount >= 2) {
              tfCap = Math.min(tfCap, 1.5);
              scoreCap = Math.min(scoreCap, 40);
              appliedRules.push("two_or_more_missing_leitpunkte_cap_40");
            } else if (missingCount === 1) {
              if (partialCount >= 1) {
                tfCap = Math.min(tfCap, 2.5);
                scoreCap = Math.min(scoreCap, 55);
                appliedRules.push("one_missing_plus_partial_leitpunkt_cap_55");
              } else {
                tfCap = Math.min(tfCap, 3.0);
                scoreCap = Math.min(scoreCap, 65);
                appliedRules.push("one_missing_leitpunkt_cap_65");
              }
            } else if (missingCount === 0) {
              if (partialCount >= 2) {
                tfCap = Math.min(tfCap, 3.5);
                scoreCap = Math.min(scoreCap, 70);
                appliedRules.push("multiple_partial_leitpunkte_cap_70");
              } else if (partialCount === 1) {
                tfCap = Math.min(tfCap, 4.0);
                scoreCap = Math.min(scoreCap, 80);
                appliedRules.push("one_partial_leitpunkt_cap_80");
              }
            }
          }

          // 6. Length and development
          const level = String(taskData?.level || "A1").toUpperCase();
          const lengthInfo = geminiAnalysis?.length || {};
          const devProblem = Boolean(lengthInfo.development_problem || lengthInfo.too_short);

          if (level === "B1" && actualWordCount < 40 && devProblem) {
            csCap = Math.min(csCap, 3.0);
            scoreCap = Math.min(scoreCap, 60);
            appliedRules.push("b1_severely_underdeveloped_cap_60");
          } else if (level === "B2" && actualWordCount < 75 && devProblem) {
            csCap = Math.min(csCap, 2.5);
            scoreCap = Math.min(scoreCap, 50);
            appliedRules.push("b2_severely_underdeveloped_cap_50");
          }

          // 7. Finalize criteria scores
          const finalTf = Math.min(tfScore, tfCap);
          const finalCs = Math.min(csScore, csCap);
          const finalVocab = Math.min(vocabScore, 5.0);
          const finalGram = Math.min(gramScore, 5.0);

          const criteriaSum = finalTf + finalCs + finalVocab + finalGram;
          const criteriaPercent = Math.round((criteriaSum / 20.0) * 100);

          const recScore = geminiAnalysis?.recommended_score_percent;
          let initialScore = (typeof recScore === "number" && !isNaN(recScore))
            ? Math.round(recScore)
            : criteriaPercent;

          // Gemini cannot award more than criteria sum + 5%
          initialScore = Math.min(initialScore, criteriaPercent + 5);

          let finalScore = Math.min(initialScore, scoreCap);
          finalScore = Math.max(0, Math.min(95, finalScore));

          criteriaMap["Task Fulfillment"].score = finalTf;
          criteriaMap["Coherence & Structure"].score = finalCs;
          criteriaMap["Vocabulary"].score = finalVocab;
          criteriaMap["Grammar & Form"].score = finalGram;

          const finalCriteria = REQUIRED_CRITERIA.map(name => criteriaMap[name]);

          return {
            score_percent: finalScore,
            cefr_level_met: finalScore >= 60,
            criteria: finalCriteria,
            applied_rules: appliedRules
          };
        }

        const flashModels = await getAvailableFlashModels(geminiApiKey);
        const modelCandidates = flashModels && flashModels.length > 0
          ? Array.from(new Set([...flashModels, ...fallbackModels]))
          : fallbackModels;

        let evaluationResult = null;
        try {
          let candidateText = null;
          let lastErrStatus = null;
          let lastErrBody = null;

          for (const modelId of modelCandidates) {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
            let geminiRes;
            try {
              geminiRes = await fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: evaluationPrompt }] }],
                  generationConfig: {
                    temperature: 0.2,
                    responseMimeType: "application/json",
                  },
                }),
              });
            } catch (fetchErr) {
              console.error(`Gemini fetch error for model ${modelId}:`, fetchErr);
              lastErrBody = String(fetchErr);
              continue;
            }

            if (!geminiRes.ok) {
              lastErrStatus = geminiRes.status;
              lastErrBody = await geminiRes.text();
              console.error(`Gemini API Error (${modelId}):`, lastErrStatus, lastErrBody);
              continue; // try next model
            }

            let geminiData;
            try {
              geminiData = await geminiRes.json();
            } catch (jsonErr) {
              console.error(`Gemini JSON parse error for model ${modelId}:`, jsonErr);
              continue;
            }

            const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) {
              console.error(`Empty evaluation response from model ${modelId}`);
              continue;
            }

            candidateText = text;
            console.log(`Gemini evaluation succeeded with model: ${modelId}`);
            break; // success — stop trying
          }

          if (!candidateText) {
            // All candidates failed
            return responseJSON(
              {
                success: false,
                error: "evaluation_service_error",
                message: "Writing evaluation service temporarily unavailable. No credit was deducted. Please try again.",
              },
              502,
              request
            );
          }

          let cleanCandidateText = candidateText.trim();
          if (cleanCandidateText.startsWith("```")) {
            cleanCandidateText = cleanCandidateText
              .replace(/^```(?:json)?\s*/i, "")
              .replace(/\s*```$/i, "")
              .trim();
          }

          const parsed = JSON.parse(cleanCandidateText);

          if (!parsed || typeof parsed !== "object") {
            throw new Error("Gemini evaluation response is not a valid JSON object.");
          }
          if (!Array.isArray(parsed.criteria) || parsed.criteria.length === 0) {
            throw new Error("Gemini evaluation response did not include criteria array.");
          }

          // Apply authoritative deterministic exam rules and caps
          const taskInfo = {
            exam: examFormat,
            level: level,
            teil: teilText,
            points: pointsList,
            situation: situationText,
            task: instructionText,
          };
          const ruleResult = applySchreibenScoreRules(parsed, taskInfo, wordCount);

          const mistakes = Array.isArray(parsed.mistakes)
            ? parsed.mistakes.map((m) => ({
                original: String(m.original || "").trim(),
                correction: String(m.correction || "").trim(),
                type: String(m.type || "grammar").trim(),
                explanation: String(m.explanation || "").trim(),
              })).filter((m) => m.original || m.correction)
            : [];

          let feedback = String(parsed.feedback || "Your writing submission was evaluated against the examination task.").trim();

          // Harmonize feedback with score: eliminate contradictory praise when failed
          if (ruleResult.score_percent < 60) {
            if (/^(excellent|great job|well done|congratulations|sehr gut|hervorragend)/i.test(feedback)) {
              feedback = `The submission does not meet the passing standard (${ruleResult.score_percent}% / minimum 60% required). While some language elements were attempted, required exam constraints were not satisfied. ${feedback}`;
            }
          }

          evaluationResult = {
            score_percent: ruleResult.score_percent,
            cefr_level_met: ruleResult.cefr_level_met,
            word_count: wordCount,
            criteria: ruleResult.criteria,
            mistakes,
            feedback,
            applied_rules: ruleResult.applied_rules,
            task_analysis: parsed.task_analysis || null,
            language_analysis: parsed.language || null,
            length_analysis: parsed.length || null,
            format_analysis: parsed.format || null,
          };
        } catch (evalErr) {
          console.error("Evaluation parsing error:", evalErr);
          return responseJSON(
            {
              success: false,
              error: "evaluation_failed",
              message: "Failed to evaluate writing submission. No credit was deducted. Please try again.",
            },
            500,
            request
          );
        }

        // 7. Deduct EXACTLY ONE Schreiben credit ONLY AFTER successful evaluation
        const newCredits = Math.max(0, schreibenCreditsRemaining - 1);
        const deductRes = await fetch(
          `${supabaseUrl}/rest/v1/learning_users?uid=eq.${encodeURIComponent(uid)}&schreiben_credits_remaining=gt.0`,
          {
            method: "PATCH",
            headers: {
              "apikey": serviceRoleKey,
              "Authorization": `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
              "Prefer": "return=representation",
            },
            body: JSON.stringify({
              schreiben_credits_remaining: newCredits,
              updated_at: new Date().toISOString(),
            }),
          }
        );

        if (!deductRes.ok) {
          const errText = await deductRes.text();
          console.error(`Supabase credit deduction error (${deductRes.status}):`, errText);
          return responseJSON(
            {
              success: false,
              error: "credit_deduction_error",
              message: `Database credit deduction error (${deductRes.status}): ${errText}`,
            },
            500,
            request
          );
        }

        let deductData = null;
        try {
          deductData = await deductRes.json();
        } catch (e) {
          deductData = null;
        }
        if (!deductData || !Array.isArray(deductData) || deductData.length === 0) {
          // Zero rows affected by conditional update (schreiben_credits_remaining=gt.0)
          // (concurrent request already consumed the last credit, or quota exhausted)
          return responseJSON(
            {
              success: false,
              error: "insufficient_credits",
              message: "Concurrent evaluation or insufficient weekly credits: no credit was deducted.",
              schreiben_credits_remaining: 0,
              weekly_schreiben_limit: weeklySchreibenLimit,
              membership: membershipCode,
            },
            409,
            request
          );
        }

        const finalRemaining = (typeof deductData[0].schreiben_credits_remaining === "number")
          ? deductData[0].schreiben_credits_remaining
          : newCredits;

        return responseJSON(
          {
            success: true,
            evaluation: evaluationResult,
            schreiben_credits_remaining: finalRemaining,
            weekly_schreiben_limit: weeklySchreibenLimit,
            membership: membershipCode,
            material_id: materialId,
            uid,
          },
          200,
          request
        );
      }

      // 8. Upload File (POST /upload)
      if (request.method === "POST" && (url.pathname === "/upload" || url.pathname === "/")) {
        const contentType = request.headers.get("content-type") || "";

        let fileData = null;
        let filename = "";
        let folder = "materials";

        if (contentType.includes("multipart/form-data")) {
          const formData = await request.formData();
          const file = formData.get("file");
          folder = formData.get("folder") || "materials";
          filename = formData.get("filename") || file?.name || `file_${Date.now()}`;

          if (!file) {
            return responseJSON({ error: "No file provided in form-data field 'file'" }, 400, request);
          }
          fileData = await file.arrayBuffer();
        } else {
          folder = request.headers.get("x-file-folder") || "materials";
          filename = request.headers.get("x-file-name") || `file_${Date.now()}`;
          fileData = await request.arrayBuffer();
        }

        if (!fileData || fileData.byteLength === 0) {
          return responseJSON({ error: "Empty file content" }, 400, request);
        }

        const cleanFolder = folder.replace(/^\/+|\/+$/g, "");
        const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const key = `${cleanFolder}/${cleanFilename}`;

        let fileContentType = "application/octet-stream";
        if (cleanFilename.endsWith(".json")) fileContentType = "application/json";
        else if (cleanFilename.endsWith(".mp3")) fileContentType = "audio/mpeg";
        else if (cleanFilename.endsWith(".png")) fileContentType = "image/png";
        else if (cleanFilename.endsWith(".jpg") || cleanFilename.endsWith(".jpeg")) fileContentType = "image/jpeg";
        else if (cleanFilename.endsWith(".webp")) fileContentType = "image/webp";

        if (!env.R2_BUCKET) {
          return responseJSON({ error: "R2_BUCKET binding is missing in Cloudflare Worker environment" }, 500, request);
        }

        await env.R2_BUCKET.put(key, fileData, {
          httpMetadata: { contentType: fileContentType },
        });

        const publicUrl = `${cdnBase}/${key}`;

        return responseJSON(
          {
            success: true,
            key,
            url: publicUrl,
            size: fileData.byteLength,
            contentType: fileContentType,
          },
          200,
          request
        );
      }

      // 4. Serve Object (GET /materials/*, GET /audio/*, GET /images/*, or GET /*)
      if (request.method === "GET") {
        const key = url.pathname.replace(/^\//, "");
        if (!key) {
          return responseJSON({ name: "Coco Germany R2 Worker & Admin API", status: "online" }, 200, request);
        }

        if (!env.R2_BUCKET) {
          return responseJSON({ error: "R2_BUCKET binding missing" }, 500, request);
        }

        const object = await env.R2_BUCKET.get(key);
        if (!object) {
          return responseJSON({ error: "File not found" }, 404, request);
        }

        const headers = new Headers(getCORSHeaders(request));
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);

        const isJson = key.toLowerCase().endsWith(".json") || (headers.get("content-type") || "").includes("application/json");
        if (isJson) {
          // JSON material files are dynamic/editable: prevent stale caching across Worker, CDN, and browser
          headers.set("cache-control", "no-cache, no-store, must-revalidate");
        } else {
          // Static binary media assets (audio, images) can retain long-term immutable caching
          headers.set("cache-control", "public, max-age=31536000, immutable");
        }

        return new Response(object.body, { headers });
      }

      return responseJSON({ error: "Method not allowed" }, 405, request);
    } catch (err) {
      return responseJSON({ error: err.message || "Worker Internal Error" }, 500, request);
    }
  },
};
