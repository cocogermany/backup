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

            const taskObj = (contentData?.task && typeof contentData.task === "object") ? contentData.task : null;

            const exam = String(contentData?.exam || dbMat.exam || "").toLowerCase().trim();
            const level = String(contentData?.level || dbMat.level || "").toUpperCase().trim();
            const teil = String(contentData?.teil || dbMat.teil || "").trim();
            const situation = String(contentData?.situation || taskObj?.situation || contentData?.context || contentData?.passage || dbMat.description || "").trim();
            const task = String(
              (typeof contentData?.task === "string" ? contentData.task : null) ||
              taskObj?.aufgabe ||
              taskObj?.task ||
              contentData?.prompt ||
              contentData?.instructions ||
              contentData?.question ||
              ""
            ).trim();

            let points = [];
            const rawPoints = contentData?.points || taskObj?.leitpunkte || taskObj?.points || contentData?.bullet_points || contentData?.guidelines || contentData?.cues || (Array.isArray(contentData?.questions) && contentData?.questions[0]?.points);
            if (Array.isArray(rawPoints)) {
              points = rawPoints.map(p => typeof p === "string" ? p.trim() : String(p?.text || p?.point || "").trim()).filter(Boolean);
            } else if (typeof rawPoints === "string" && rawPoints.trim()) {
              points = [rawPoints.trim()];
            }

            const wordLimit = typeof contentData?.word_limit === "number"
              ? contentData.word_limit
              : (typeof taskObj?.word_count?.maximum === "number" ? taskObj.word_count.maximum : (dbMat.word_limit || 200));

            const evaluationConfig = contentData?.evaluation || null;

            return {
              materialId: dbMat.id,
              exam,
              level,
              teil,
              situation,
              task,
              points,
              wordLimit,
              evaluation: evaluationConfig,
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

        // Authoritative evaluation rules from material JSON or synthesized baseline
        let evaluationConfig = authoritativeTask?.evaluation || null;
        if (!evaluationConfig && pointsList.length > 0) {
          evaluationConfig = {
            task_type: "general_writing",
            required_points: pointsList.map((p, idx) => ({
              id: idx + 1,
              requirement: p,
              fulfilled_when: `The point (${p}) is clearly and comprehensibly communicated in German.`,
              partial_when: `The point is partially addressed, vague, or incomplete.`,
              not_fulfilled_when: `The point is omitted or not communicated.`
            })),
            development: {
              required: true,
              description: `Submission must be sufficiently developed for CEFR ${level}.`
            },
            language: { expected: "German" },
            register: "task appropriate"
          };
        }

        // Format evaluation rules for Gemini
        const evaluationRulesFormatted = evaluationConfig?.required_points && evaluationConfig.required_points.length > 0
          ? evaluationConfig.required_points.map(pt => `
Point #${pt.id}: ${pt.requirement}
- FULFILLED WHEN: ${pt.fulfilled_when || "Addressed clearly in German."}
- PARTIAL WHEN: ${pt.partial_when || "Partially addressed, vague, or incomplete."}
- NOT FULFILLED (MISSING) WHEN: ${pt.not_fulfilled_when || "Omitted or not communicated."}
`.trim()).join("\n\n")
          : pointsFormatted;

        const devReq = evaluationConfig?.development?.description || `Sufficiently developed for CEFR ${level}.`;
        const regReq = evaluationConfig?.register || "Appropriate for the specific exam part and recipient.";
        const lvlReq = evaluationConfig?.level_expectations || `Appropriate for CEFR ${level}.`;
        const notesReq = evaluationConfig?.scoring_notes || "";

        // 6. Build focused dynamic prompt from material evaluation configuration
        const evaluationPrompt = `
You are an expert, objective Goethe/telc-style German examination writing examiner evaluating a ${examFormat.toUpperCase()} ${level} (${teilText}) submission.

EXAM SPECIFICATIONS:
- Exam: ${examFormat.toUpperCase()}
- Level: ${level}
- Teil: ${teilText}

EXAM SITUATION:
${situationText || "No additional situation provided."}

EXAM TASK:
${instructionText || rawTask}

TASK-SPECIFIC EVALUATION RULES & REQUIRED LEITPUNKTE:
${evaluationRulesFormatted}

DEVELOPMENT & REGISTER EXPECTATIONS:
- Development: ${devReq}
- Register: ${regReq}
- CEFR Level Calibration: ${lvlReq}
${notesReq ? `- Task-Specific Scoring Notes: ${notesReq}` : ""}

STUDENT SUBMISSION (${wordCount} words):
${studentAnswer}

EXAMINER INSTRUCTIONS & MANDATORY SCORING RULES:
1. EVIDENCE IS MANDATORY: For every Leitpunkt, classify status as "fulfilled", "partial", or "missing". For "fulfilled" or "partial", cite the exact German phrase from the student's text in "evidence". If a point is missing, evidence must be "". Generic statements do NOT satisfy specific requirements (e.g. general opinions do NOT count as personal experience or concrete examples).
2. LANGUAGE REQUIREMENT: If the text is mostly non-German (English/other), set language.detected = detected language, language.appropriate = false, criteria.task_fulfillment.score = 0, and recommended_score <= 10.
3. DEVELOPMENT MATTERS: Merely mentioning points in isolated, extremely short sentences without development cannot receive a high score at B1/B2. Evaluate communicative depth for ${level}.
4. LEVEL CALIBRATION: Simple, correct German appropriate for ${level} can score highly (up to 95%). Do NOT reward unnecessarily complex or artificial language. Do NOT invent mistakes.
5. STRICT CALIBRATION BENCHMARKS:
   - 90–95%: Excellent (all requirements fulfilled, strong development, appropriate CEFR language, clear organization)
   - 80–89%: Very good (all important requirements fulfilled, sufficiently developed, good language, minor weaknesses)
   - 70–79%: Good/passable (generally completed, noticeable weaknesses in language, development, or organization)
   - 60–69%: Adequate but limited (noticeable weaknesses or partial fulfillment)
   - 40–59%: Weak (important omissions, weak development, or significant language problems)
   - 1–39%: Very weak (major task failure, multiple missing requirements, or severe language problems)
   - 0%: Off-topic, wrong language, or unusable

Return ONLY a valid JSON object matching this exact schema (no markdown fences, no text outside JSON):
{
  "language": {
    "detected": "German",
    "appropriate": true
  },
  "task_fulfillment": {
    "missing_count": 0,
    "partial_count": 0,
    "points": [
      {
        "id": 1,
        "status": "fulfilled",
        "evidence": "..."
      }
    ]
  },
  "development": {
    "adequate": true,
    "quality": "good"
  },
  "format": {
    "appropriate": true
  },
  "criteria": {
    "task_fulfillment": {
      "score": 0,
      "max_score": 5,
      "feedback": "One sentence explaining this criterion score."
    },
    "coherence": {
      "score": 0,
      "max_score": 5,
      "feedback": "One sentence explaining this criterion score."
    },
    "vocabulary": {
      "score": 0,
      "max_score": 5,
      "feedback": "One sentence explaining this criterion score."
    },
    "grammar_form": {
      "score": 0,
      "max_score": 5,
      "feedback": "One sentence explaining this criterion score."
    }
  },
  "mistakes": [
    {
      "original": "...",
      "correction": "...",
      "type": "grammar",
      "explanation": "..."
    }
  ],
  "feedback": {
    "summary": "...",
    "strengths": [],
    "improvements": []
  },
  "recommended_score": 0
}
`.trim();

        // Universal deterministic safety rules engine
        function applyUniversalSafetyRules(parsed, taskData, actualWordCount) {
          const appliedRules = [];

          // 1. Sanitize criteria (force max_score = 5, clamp 0–5)
          const rawCriteria = parsed?.criteria || {};
          const getCritScore = (crit) => {
            const raw = typeof crit?.score === "number" ? crit.score : parseFloat(String(crit?.score || "0"));
            if (isNaN(raw) || raw < 0 || raw > 10) {
              throw new Error(`Invalid criterion score: ${JSON.stringify(crit?.score)}`);
            }
            return Math.max(0, Math.min(5, Math.round(raw * 2) / 2));
          };

          let tfScore = getCritScore(rawCriteria.task_fulfillment);
          let csScore = getCritScore(rawCriteria.coherence);
          let vocabScore = getCritScore(rawCriteria.vocabulary);
          let gramScore = getCritScore(rawCriteria.grammar_form);

          // Per-criterion feedback from Gemini (may be empty string if not returned)
          const tfFeedback = String(rawCriteria.task_fulfillment?.feedback || "").trim();
          const csFeedback = String(rawCriteria.coherence?.feedback || "").trim();
          const vocabFeedback = String(rawCriteria.vocabulary?.feedback || "").trim();
          const gramFeedback = String(rawCriteria.grammar_form?.feedback || "").trim();

          // 2. Read scoring caps from material JSON (evaluation.scoring.caps), or use hardcoded defaults
          const materialCaps = taskData?.evaluation?.scoring?.caps || {};
          const CAP_OFF_TOPIC   = typeof materialCaps.off_topic    === "number" ? materialCaps.off_topic    : 20;
          const CAP_TWO_MISSING = typeof materialCaps.two_missing   === "number" ? materialCaps.two_missing   : 40;
          const CAP_ONE_MISSING = typeof materialCaps.one_missing   === "number" ? materialCaps.one_missing   : 65;
          const HIGH_THRESHOLD  = typeof taskData?.evaluation?.scoring?.high_score_threshold === "number"
            ? taskData.evaluation.scoring.high_score_threshold : 80;

          let scoreCap = 95;
          let tfCap = 5.0;
          let csCap = 5.0;

          // 3. Language check (mostly wrong language → max 10%, Task Fulfillment = 0)
          const lang = parsed?.language || {};
          const detectedLang = String(lang.detected || "German").toLowerCase();
          const isGerman = detectedLang.includes("german") || detectedLang === "de";
          const isLangAppropriate = lang.appropriate !== false;
          if (!isGerman || !isLangAppropriate) {
            tfCap = Math.min(tfCap, 0.0);
            scoreCap = Math.min(scoreCap, 10);
            appliedRules.push("language_not_german_cap_10");
          }

          // 4. Task fulfillment & Leitpunkte check
          const tfAnalysis = parsed?.task_fulfillment || {};
          const points = Array.isArray(tfAnalysis.points) ? tfAnalysis.points : [];
          const totalPoints = points.length > 0
            ? points.length
            : (Array.isArray(taskData?.points) && taskData.points.length > 0 ? taskData.points.length : 0);

          let missingCount = 0;
          let partialCount = 0;
          for (const pt of points) {
            const st = String(pt.status || "").toLowerCase();
            if (st === "missing") missingCount++;
            else if (st === "partial") partialCount++;
          }

          if (typeof tfAnalysis.missing_count === "number") {
            missingCount = Math.max(missingCount, tfAnalysis.missing_count);
          }
          if (typeof tfAnalysis.partial_count === "number") {
            partialCount = Math.max(partialCount, tfAnalysis.partial_count);
          }

          // Check if completely off-topic
          const isOffTopic = (totalPoints > 0 && missingCount >= totalPoints) || tfScore === 0;
          if (isOffTopic && appliedRules.length === 0) {
            tfCap = Math.min(tfCap, 0.0);
            scoreCap = Math.min(scoreCap, CAP_OFF_TOPIC);
            appliedRules.push(`off_topic_cap_${CAP_OFF_TOPIC}`);
          } else if (missingCount >= 2) {
            tfCap = Math.min(tfCap, 1.5);
            scoreCap = Math.min(scoreCap, CAP_TWO_MISSING);
            appliedRules.push(`two_or_more_missing_leitpunkte_cap_${CAP_TWO_MISSING}`);
          } else if (missingCount === 1) {
            if (partialCount >= 1) {
              const oneMissingPlusCap = Math.round((CAP_ONE_MISSING + CAP_TWO_MISSING) / 2);
              tfCap = Math.min(tfCap, 2.5);
              scoreCap = Math.min(scoreCap, oneMissingPlusCap);
              appliedRules.push(`one_missing_plus_partial_cap_${oneMissingPlusCap}`);
            } else {
              tfCap = Math.min(tfCap, 3.0);
              scoreCap = Math.min(scoreCap, CAP_ONE_MISSING);
              appliedRules.push(`one_missing_leitpunkt_cap_${CAP_ONE_MISSING}`);
            }
          } else if (missingCount === 0) {
            if (partialCount >= 2) {
              const multiPartialCap = Math.max(CAP_ONE_MISSING + 5, HIGH_THRESHOLD - 10);
              tfCap = Math.min(tfCap, 3.5);
              scoreCap = Math.min(scoreCap, multiPartialCap);
              appliedRules.push(`multiple_partial_leitpunkte_cap_${multiPartialCap}`);
            } else if (partialCount === 1) {
              tfCap = Math.min(tfCap, 4.0);
              scoreCap = Math.min(scoreCap, HIGH_THRESHOLD);
              appliedRules.push(`one_partial_leitpunkt_cap_${HIGH_THRESHOLD}`);
            }
          }

          // 5. Development check
          const dev = parsed?.development || {};
          const isUnderdeveloped = dev.adequate === false || String(dev.quality || "").toLowerCase() === "severely_underdeveloped";
          const level = String(taskData?.level || "A1").toUpperCase();
          if (level === "B1" && actualWordCount < 40 && isUnderdeveloped) {
            csCap = Math.min(csCap, 3.0);
            scoreCap = Math.min(scoreCap, 60);
            appliedRules.push("b1_severely_underdeveloped_cap_60");
          } else if (level === "B2" && actualWordCount < 75 && isUnderdeveloped) {
            csCap = Math.min(csCap, 2.5);
            scoreCap = Math.min(scoreCap, 50);
            appliedRules.push("b2_severely_underdeveloped_cap_50");
          }

          // 6. Finalize criteria scores
          const finalTf = Math.min(tfScore, tfCap);
          const finalCs = Math.min(csScore, csCap);
          const finalVocab = Math.min(vocabScore, 5.0);
          const finalGram = Math.min(gramScore, 5.0);

          const criteriaSum = finalTf + finalCs + finalVocab + finalGram;
          const criteriaPercent = Math.round((criteriaSum / 20.0) * 100);

          const recScore = typeof parsed?.recommended_score === "number"
            ? parsed.recommended_score
            : (typeof parsed?.recommended_score_percent === "number" ? parsed.recommended_score_percent : criteriaPercent);

          let initialScore = Math.round(recScore);
          initialScore = Math.min(initialScore, criteriaPercent + 5);

          let finalScore = Math.min(initialScore, scoreCap);
          finalScore = Math.max(0, Math.min(95, finalScore));

          const fulfilledCount = totalPoints - missingCount - partialCount;

          const criteriaList = [
            {
              name: "Task Fulfillment",
              score: finalTf,
              max_score: 5,
              feedback: tfFeedback || `${fulfilledCount} of ${totalPoints} Leitpunkte fulfilled, ${partialCount} partial, ${missingCount} missing.`
            },
            {
              name: "Coherence & Structure",
              score: finalCs,
              max_score: 5,
              feedback: csFeedback || `Coherence & Structure: ${finalCs}/5.`
            },
            {
              name: "Vocabulary",
              score: finalVocab,
              max_score: 5,
              feedback: vocabFeedback || `Vocabulary: ${finalVocab}/5.`
            },
            {
              name: "Grammar & Form",
              score: finalGram,
              max_score: 5,
              feedback: gramFeedback || `Grammar & Form: ${finalGram}/5.`
            }
          ];

          return {
            score_percent: finalScore,
            cefr_level_met: finalScore >= 60,
            criteria: criteriaList,
            criteria_map: {
              task_fulfillment: { score: finalTf, max_score: 5 },
              coherence: { score: finalCs, max_score: 5 },
              vocabulary: { score: finalVocab, max_score: 5 },
              grammar_form: { score: finalGram, max_score: 5 }
            },
            applied_rules: appliedRules
          };
        }


        // Direct prioritized Flash model candidates (no runtime API discovery roundtrip)
        const modelCandidates = [
          "gemini-1.5-flash",
          "gemini-1.5-flash-latest",
          "gemini-2.0-flash",
          "gemini-2.0-flash-lite",
          "gemini-1.5-pro"
        ];

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
                  safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
                  ],
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

            const parts = geminiData?.candidates?.[0]?.content?.parts;
            const text = Array.isArray(parts)
              ? parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("").trim()
              : "";

            if (!text) {
              const finishReason = geminiData?.candidates?.[0]?.finishReason;
              console.error(`Empty evaluation response from model ${modelId}. FinishReason:`, finishReason);
              lastErrBody = `Empty response from ${modelId} (finishReason: ${finishReason || "unknown"})`;
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
                details: {
                  last_status: lastErrStatus,
                  last_error: lastErrBody,
                  models_tried: modelCandidates,
                },
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
          if (!parsed.criteria || (typeof parsed.criteria !== "object" && !Array.isArray(parsed.criteria))) {
            throw new Error("Gemini evaluation response missing criteria object.");
          }

          // Apply universal deterministic safety rules
          const taskInfo = {
            exam: examFormat,
            level: level,
            teil: teilText,
            points: pointsList,
            situation: situationText,
            task: instructionText,
            evaluation: evaluationConfig, // pass material caps through to safety rules
          };
          const ruleResult = applyUniversalSafetyRules(parsed, taskInfo, wordCount);

          const mistakes = Array.isArray(parsed.mistakes)
            ? parsed.mistakes.map((m) => ({
                original: String(m.original || "").trim(),
                correction: String(m.correction || "").trim(),
                type: String(m.type || "grammar").trim(),
                explanation: String(m.explanation || "").trim(),
              })).filter((m) => m.original || m.correction)
            : [];

          const feedbackSummary = typeof parsed.feedback === "object"
            ? String(parsed.feedback?.summary || "").trim()
            : String(parsed.feedback || "").trim();

          let feedbackText = feedbackSummary || "Your writing submission was evaluated against the examination task.";

          // Harmonize feedback with score: eliminate contradictory praise when failed
          if (ruleResult.score_percent < 60) {
            if (/^(excellent|great job|well done|congratulations|sehr gut|hervorragend)/i.test(feedbackText)) {
              feedbackText = `The submission does not meet the passing standard (${ruleResult.score_percent}% / minimum 60% required). While some language elements were attempted, required exam constraints were not satisfied. ${feedbackText}`;
            }
          }

          evaluationResult = {
            score_percent: ruleResult.score_percent,
            cefr_level_met: ruleResult.cefr_level_met,
            word_count: wordCount,
            criteria: ruleResult.criteria,
            criteria_map: ruleResult.criteria_map,
            mistakes,
            feedback: feedbackText,
            feedback_details: typeof parsed.feedback === "object" ? parsed.feedback : { summary: feedbackText, strengths: [], improvements: [] },
            task_fulfillment: parsed.task_fulfillment || null,
            language: parsed.language || null,
            development: parsed.development || null,
            format: parsed.format || null,
            applied_rules: ruleResult.applied_rules,
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
