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

        // 4. Validate input payload
        let body = {};
        try {
          body = await request.json();
        } catch (e) {
          body = {};
        }

        const materialId = String(body.material_id || "schreiben-1");
        const examFormat = String(body.exam || body.format || "goethe").trim();
        const level = String(body.level || "A1").toUpperCase().trim();
        const studentAnswer = String(body.answer || body.student_answer || "").trim();
        const teilText = String(body.teil || body.part || "").trim();

        if (!studentAnswer) {
          return responseJSON(
            { success: false, error: "empty_answer", message: "Answer cannot be empty." },
            400,
            request
          );
        }

        // Count words in student answer only (FIX 6)
        const wordCount = studentAnswer.split(/\s+/).filter(Boolean).length;
        if (wordCount > 200) {
          return responseJSON(
            {
              success: false,
              error: "word_limit_exceeded",
              message: `Your answer exceeds the maximum allowed 200 words (current: ${wordCount} words).`,
            },
            400,
            request
          );
        }

        // Validate and decompose the task (FIX 1, FIX 2, FIX 9)
        const rawTask = String(body.task || body.prompt || body.question || "").trim();
        let situationText = String(body.situation || body.context || body.passage || "").trim();
        let instructionText = "";
        let pointsList = Array.isArray(body.points)
          ? body.points.map((p) => (typeof p === "string" ? p.trim() : String(p?.text || p?.point || "").trim())).filter(Boolean)
          : (typeof body.points === "string" && body.points.trim() ? [body.points.trim()] : []);

        if (rawTask) {
          // Check for structured sections: "Situation / Kontext:", "Aufgabe:", "Punkte:" / "Leitpunkte:"
          const situationMatch = rawTask.match(/(?:Situation\s*\/?\s*Kontext|Kontext|Situation)\s*:\s*([\s\S]*?)(?=(?:Aufgabe|Punkte|Leitpunkte)\s*:|$)/i);
          const instructionMatch = rawTask.match(/Aufgabe\s*:\s*([\s\S]*?)(?=(?:Punkte|Leitpunkte)\s*:|$)/i);
          const pointsMatch = rawTask.match(/(?:Punkte|Leitpunkte)\s*:\s*([\s\S]*)$/i);

          if (situationMatch && !situationText) {
            situationText = situationMatch[1].trim();
          }
          if (instructionMatch) {
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

        // Return error if task is missing or empty or a generic dummy placeholder (FIX 1, FIX 9)
        const isGenericPlaceholder = rawTask.toLowerCase() === "schreibaufgabe" || instructionText.toLowerCase() === "schreibaufgabe";
        if (
          (!rawTask && !instructionText && !situationText && pointsList.length === 0) ||
          (isGenericPlaceholder && !situationText && pointsList.length === 0)
        ) {
          return responseJSON(
            {
              success: false,
              error: "missing_task",
              message: "Authoritative exam task is missing. Cannot evaluate without an official examination prompt.",
            },
            400,
            request
          );
        }

        const pointsFormatted = pointsList.length > 0
          ? pointsList.map((p, idx) => `Point ${idx + 1}: ${p}`).join("\n")
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

        // Helper: retrieve official Goethe/telc writing criteria and checklist for specific exam, level, and Teil
        function getOfficialWritingChecklist(exam, lvl, teil) {
          const formatName = String(exam || "goethe").toLowerCase().trim();
          const level = String(lvl || "A1").toUpperCase().trim();
          const part = String(teil || "").toLowerCase().trim();

          let teilNum = 2; // Default for A1/A2 free writing
          if (part.includes("1") || part.includes("teil 1") || part.includes("part 1")) teilNum = 1;
          else if (part.includes("2") || part.includes("teil 2") || part.includes("part 2")) teilNum = 2;
          else if (part.includes("3") || part.includes("teil 3") || part.includes("part 3")) teilNum = 3;

          if (formatName === "telc") {
            if (level === "A1") {
              return `OFFICIAL TELC DEUTSCH A1 WRITING CRITERIA & CHECKLIST (Teil 2: Kurze Mitteilung):
- Format & Expected Length: Short personal or semi-formal message/note (~30 words, typically 20–40 words).
- Required Structure: Suitable greeting/salutation, concise text body addressing all Leitpunkte, closing formula with sender's name.
- Register & Formality: Match context (informal 'du/ihr' for friends/colleagues vs. formal 'Sie/Ihnen' for official recipients).
- Vocabulary & Connectors: Basic everyday A1 vocabulary; simple connectors ("und", "aber", "denn").
- Grammar & Syntax: Present tense, basic Perfekt, verb in position 2 in main clauses, simple question forms.
- Level Calibration: Simple, correct A1 German is fully sufficient for maximum marks. Do not penalize simple structures.`;
            }
            if (level === "A2") {
              return `OFFICIAL TELC DEUTSCH A2 WRITING CRITERIA & CHECKLIST (Teil 2: Kurzer Brief / E-Mail):
- Format & Expected Length: Short letter or email (~30–50 words).
- Required Structure: Clear salutation, structured body addressing all Leitpunkte, suitable closing formula and name.
- Register & Formality: Consistent register ('du/ihr' vs 'Sie/Ihnen') throughout.
- Connectors & Flow: Basic sentence connectors ("weil", "wenn", "deshalb", "denn", "dann").
- Grammar & Vocabulary: Present, Perfekt, modal verbs, prepositions with correct case (Akkusativ/Dativ), accurate everyday A2 vocabulary.
- Level Calibration: Reward effective communicative ability at A2 level. Do not expect complex subordinate clauses.`;
            }
            if (level === "B1") {
              return `OFFICIAL TELC DEUTSCH B1 WRITING CRITERIA & CHECKLIST (Brief / E-Mail):
- Format & Expected Length: Personal or semi-formal letter/email (~100 words).
- Required Structure: Full letter framework (appropriate salutation, introduction, distinct paragraphs for Leitpunkte, closing formula).
- Register & Formality: Precise adherence to register ('du/ihr' vs 'Sie/Ihnen'), courteous phrasing.
- Task Fulfillment: All provided Leitpunkte must be covered in detail with relevant explanations.
- Connectors & Coherence: Logical progression, connectors ("da", "obwohl", "trotzdem", "sowohl... als auch", "deswegen").
- Grammar & Vocabulary: Good range of B1 vocabulary, subordinate clauses (weil, dass, wenn, obwohl), relative clauses, infinitive with 'zu', correct cases and prepositions.
- Level Calibration: Judge against B1 standards. Clear, well-connected sentences without unnecessary artificial complexity.`;
            }
            if (level === "B2") {
              return `OFFICIAL TELC DEUTSCH B2 WRITING CRITERIA & CHECKLIST (Halbformelle / Formelle E-Mail):
- Format & Expected Length: Formal or semi-formal letter/email (~150 words, e.g. inquiry, complaint, application).
- Required Structure: Official letter conventions (formal salutation, reference line/opening statement, well-structured arguments/requests, formal closing).
- Register & Formality: High formal register ('Sie/Ihnen', 'Sehr geehrte Damen und Herren', 'Mit freundlichen Grüßen'), diplomatic and polite tone.
- Task Fulfillment: Comprehensive, differentiated coverage of all Leitpunkte with clear arguments and concrete details.
- Connectors & Cohesion: Sophisticated transitions ("in Bezug auf", "darüber hinaus", "folglich", "demgegenüber").
- Grammar & Vocabulary: Varied B2 vocabulary, idiomatic and professional expressions, Passiv, Konjunktiv II, complex subordinate clauses, prepositions with Genitiv/Dativ.`;
            }
          }

          // GOETHE (Default or Goethe-specific)
          if (level === "A1") {
            return `OFFICIAL GOETHE A1 (START DEUTSCH 1) WRITING CRITERIA & CHECKLIST (Teil 2: Persönliche Kurzmitteilung):
- Format & Expected Length: Short personal or semi-formal message, email, or note (~30 words, typically 20–40 words).
- Required Structure: Appropriate greeting (e.g., "Liebe Eva,", "Hallo Paul," or formal "Sehr geehrte(r)..."), body sentences addressing all 3 Leitpunkte, proper sign-off ("Viele Grüße", "Herzliche Grüße") with sender name.
- Register & Formality: Consistent address matching the relationship ('du' for friends/colleagues, 'Sie' for formal recipients).
- Vocabulary & Connectors: Essential everyday A1 vocabulary; basic sentence linking ("und", "aber", "oder", "weil").
- Grammar & Syntax: Regular verb conjugations, verb in position 2 (V2) in statements, verb in position 1 in yes/no questions, basic object pronouns and cases.
- Level Calibration: A1 expects simple, comprehensible language. Full marks MUST be awarded for simple, accurate German that covers all Leitpunkte. Do NOT demand or reward overly complex constructions.`;
          }
          if (level === "A2") {
            if (teilNum === 1) {
              return `OFFICIAL GOETHE A2 WRITING CRITERIA & CHECKLIST (Teil 1: Kurze SMS / Notiz):
- Format & Expected Length: Brief informal message/SMS (~20–30 words) with 3 points.
- Structure: Short greeting, concise direct statements covering the 3 points, informal closing.
- Register: Informal ('du/ihr').
- Vocabulary & Grammar: Practical daily vocabulary, present tense or Perfekt, modal verbs, correct verb placement.`;
            }
            return `OFFICIAL GOETHE A2 WRITING CRITERIA & CHECKLIST (Teil 2: Persönliche / Halbformelle E-Mail):
- Format & Expected Length: Personal or semi-formal message/email (~40 words, typically 35–55 words).
- Required Structure: Correct salutation, cohesive text body covering all 3 Leitpunkte, suitable closing formula with name.
- Register & Formality: Consistent informal ('du') or semi-formal ('Sie') register.
- Connectors & Coherence: Linking with "weil", "denn", "deshalb", "wenn", "oder", "aber", temporal sequence ("zuerst", "dann").
- Grammar & Vocabulary: Correct Perfekt with haben/sein, modal verbs, accusative/dative prepositions, appropriate A2 lexical range.
- Level Calibration: Judge whether communication is effective at A2. Do not penalize absence of B-level structures.`;
          }
          if (level === "B1") {
            if (teilNum === 1) {
              return `OFFICIAL GOETHE B1 WRITING CRITERIA & CHECKLIST (Teil 1: Persönliche E-Mail):
- Format & Expected Length: Personal email (~80 words) covering 3 Leitpunkte (describing an event, giving reasons, making a proposal/meeting).
- Structure: Friendly opening ("Liebe/Lieber..."), thematic paragraphs for each Leitpunkt, affectionate closing ("Liebe Grüße", "Bis bald").
- Register: Informal ('du/ihr'), personal, conversational tone.
- Task Fulfillment: Descriptive depth, clear reasons, concrete suggestion.
- Connectors: "weil", "da", "deshalb", "obwohl", "trotzdem", "wenn", "um... zu".
- Grammar & Vocabulary: Past tenses (Perfekt/Präteritum), Konjunktiv II for polite suggestions, varied B1 vocabulary.`;
            }
            if (teilNum === 2) {
              return `OFFICIAL GOETHE B1 WRITING CRITERIA & CHECKLIST (Teil 2: Forumsbeitrag / Meinung):
- Format & Expected Length: Discussion forum contribution (~80 words).
- Structure: Opening statement addressing the forum topic, main body stating personal opinion and reasons, personal experience, brief conclusion.
- Register: Public but accessible/neutral (no personal salutation like "Liebe...", but neutral greeting like "Hallo zusammen" or direct entry).
- Task Fulfillment: Clear expression of opinion, justification, personal reflection.
- Connectors: Argumentative connectors ("Meiner Meinung nach...", "Ein Grund dafür ist...", "Außerdem...", "Zusammenfassend...").
- Grammar & Vocabulary: Opinion phrases, modal verbs, subordinate clauses with 'dass' and 'weil'.`;
            }
            return `OFFICIAL GOETHE B1 WRITING CRITERIA & CHECKLIST (Teil 3: Formelle Entschuldigung / Bitte):
- Format & Expected Length: Brief formal message (~40 words, e.g. apologising for absence, requesting an appointment).
- Structure: Formal salutation ("Sehr geehrte(r) Frau/Herr..."), clear concise reason/request, polite formal closing ("Mit freundlichen Grüßen").
- Register: Strict formal register ('Sie/Ihnen'), courteous tone.
- Task Fulfillment: Promptly and politely achieves communicative goal.
- Grammar: Polite Konjunktiv II ("Ich möchte Sie bitten...", "Könnten Sie bitte..."), correct formal forms.`;
          }
          if (level === "B2") {
            if (teilNum === 1) {
              return `OFFICIAL GOETHE B2 WRITING CRITERIA & CHECKLIST (Teil 1: Diskussionsbeitrag / Forumsbeitrag):
- Format & Expected Length: Well-developed opinion essay / forum post (minimum 150 words).
- Required Content Points: 1) Personal opinion with arguments, 2) Reasons/causes for the situation, 3) Alternative options, 4) Evaluation of advantages/disadvantages.
- Structure: Engaging introduction, distinct argumentative paragraphs with topic sentences, logical transitions, rounded conclusion.
- Register: Neutral, articulate, and objective.
- Connectors & Flow: "einerseits... andererseits", "darüber hinaus", "demgegenüber", "nicht nur... sondern auch", "folglich".
- Grammar & Vocabulary: High lexical variety, abstract B2 terminology, Passiv, Konjunktiv II, Nomen-Verb-Verbindungen, relative and causal clauses.`;
            }
            return `OFFICIAL GOETHE B2 WRITING CRITERIA & CHECKLIST (Teil 2: Formelle Nachricht / Beschwerde / Bitte):
- Format & Expected Length: Official business/formal email (minimum 100 words, e.g. complaint, request, clarification).
- Structure: Standard formal letter layout (subject line concept, formal greeting, background context, detailed points of contention/request, deadline or expected action, formal sign-off).
- Register: Impeccable formal business register ('Sie/Ihnen'), diplomatic assertiveness.
- Grammar & Vocabulary: Advanced formal vocabulary, fixed idioms ("Ich wende mich an Sie, um...", "Bitte teilen Sie mir mit..."), passive forms, hypothetical and conditional clauses.`;
          }

          return `OFFICIAL ${formatName.toUpperCase()} ${level} WRITING CRITERIA & CHECKLIST:
- Task Fulfillment: Completely address all instructions and Leitpunkte.
- Structure: Logical layout, clear opening, developed body, appropriate closing.
- Register: Consistent formality ('du' vs 'Sie') matching the context.
- Connectors: Appropriate cohesive devices for CEFR ${level}.
- Grammar & Vocabulary: Accurate, effective usage calibrated strictly to CEFR ${level}. Do not penalize simple German if it is correct and completes the task.`;
        }

        const officialChecklist = getOfficialWritingChecklist(examFormat, level, teilText);

        // 6. Call Gemini Evaluation API with comprehensive dual-rubric prompt
        const evaluationPrompt = `
You are evaluating this exact examination task against official examination criteria, not a generic German writing sample.
You are an expert certified examination evaluator for official ${examFormat.toUpperCase()} German exams at the CEFR ${level} level.

EXAM SPECIFICATIONS:
- Examination: ${examFormat.toUpperCase()}
- CEFR Level: ${level}
- Teil / Component: ${teilText || "Schreiben"}

EXAM SITUATION:
${situationText || "No additional situation provided."}

EXAM TASK:
${instructionText || rawTask}

REQUIRED LEITPUNKTE / POINTS:
${pointsFormatted}

STUDENT SUBMISSION:
${studentAnswer}

================================================================================
OFFICIAL ${examFormat.toUpperCase()} ${level} ${teilText ? teilText.toUpperCase() : "SCHREIBEN"} WRITING CRITERIA & CHECKLIST:
================================================================================
${officialChecklist}

EVALUATION METHODOLOGY & MANDATORY CRITERIA:
You MUST evaluate the student's submission against BOTH:
(1) The exact task/question and all required Leitpunkte, AND
(2) The official ${examFormat.toUpperCase()} ${level} Teil-specific writing criteria and checklist above.

Verify each of the following 8 core dimensions:
1. TASK / LEITPUNKTE FULFILLMENT:
   - Check every individual Leitpunkt. Determine whether each was:
     * FULLY ADDRESSED: Clearly, comprehensibly, and adequately communicated in German.
     * PARTIALLY ADDRESSED: Incomplete, vague, or heavily obscured by grammatical/lexical errors.
     * NOT ADDRESSED: Omitted, ignored, or completely missing.
   - Task fulfillment MUST strongly affect the final score.
   - If 1 required Leitpunkt is missing: Task Fulfillment score MUST NOT exceed 3.0 / 5.
   - If 2 or more required Leitpunkte are missing: Task Fulfillment score MUST NOT exceed 1.5 / 5, and the overall score_percent MUST be heavily penalized (well below passing 60%).
   - A grammatically flawless answer that ignores required points must NOT receive a high score.
2. RELEVANCE & COMPLETENESS:
   - Does the answer stay strictly relevant to the scenario? Are all required components covered completely without off-topic filler?
3. TEXT STRUCTURE & APPROPRIATE CONNECTORS:
   - Check text layout: Opening greeting/salutation, coherent sentence and paragraph flow, suitable closing formula, sender name.
   - Check cohesive devices and connectors appropriate for CEFR ${level}.
4. VOCABULARY APPROPRIATE FOR THE LEVEL:
   - Check whether vocabulary is suitable, accurate, and natural for CEFR ${level}.
   - CRITICAL: Do NOT reward unnecessarily advanced German. Judge whether the language is appropriate and effective for the target level. An A1/A2 answer written in clear, natural, simple German that fulfills all Leitpunkte MUST be awarded full marks.
5. GRAMMAR & SENTENCE STRUCTURE:
   - Check sentence structure (verb position V2 in main clauses, verb-final in subordinate clauses), verb conjugation, cases (Nominativ, Akkusativ, Dativ), prepositions, spelling, and noun capitalization.
   - CRITICAL: Do NOT invent mistakes. Only flag genuine grammatical, orthographical, syntactical, or lexical errors. Accept natural German phrasing and common colloquialisms if suitable for the register.
6. REGISTER, FORMALITY & REQUIRED FORMAT:
   - Check register: Is the distinction between informal ('du/ihr') and formal ('Sie/Ihnen') consistently maintained as required by the recipient?
   - Is the format appropriate for the task type (e.g. personal email, formal inquiry, forum post)?
7. COMMUNICATIVE EFFECTIVENESS:
   - Can a native speaker understand the message effortlessly at the expected ${level} standard?
8. WORD LIMIT & EXTENT:
   - Student answer word count: ${wordCount} words.
   - Verify that the text satisfies the expected length for this exam part without excessive brevity or fluff.

LANGUAGE & FORMAT OF EVALUATION:
- All evaluator feedback, criteria explanations, and overall summaries MUST be in ENGLISH.
- Criteria names must be EXACTLY:
  "Task Fulfillment"
  "Coherence & Structure"
  "Vocabulary"
  "Grammar & Form"
- In "mistakes":
  * "original": Exact German text from the student with the error.
  * "correction": Corrected German phrasing.
  * "explanation": Concise English explanation of the grammatical/orthographic rule.
  * Do NOT translate the student's German text into English.
  * Do NOT rewrite the student's entire answer.
- "score_percent": Integer from 0 to 100 representing overall CEFR performance.
- "cefr_level_met": Boolean, true ONLY if score_percent >= 60.

Respond ONLY with a valid JSON object matching this exact schema (no markdown fences, no explanatory text outside JSON):
{
  "score_percent": <integer between 0 and 100>,
  "cefr_level_met": <boolean, true if score_percent >= 60>,
  "criteria": [
    {
      "name": "Task Fulfillment",
      "score": <number between 0 and 5, can use 0.5 increments>,
      "max_score": 5,
      "feedback": "<concise English feedback explicitly detailing the status of every required Leitpunkt and completeness>"
    },
    {
      "name": "Coherence & Structure",
      "score": <number between 0 and 5>,
      "max_score": 5,
      "feedback": "<concise English feedback on greeting, sign-off, text structure, connectors, and register>"
    },
    {
      "name": "Vocabulary",
      "score": <number between 0 and 5>,
      "max_score": 5,
      "feedback": "<concise English feedback on vocabulary range, appropriateness for target level, and register>"
    },
    {
      "name": "Grammar & Form",
      "score": <number between 0 and 5>,
      "max_score": 5,
      "feedback": "<concise English feedback on grammar, sentence structure, spelling, and verb placement>"
    }
  ],
  "mistakes": [
    {
      "original": "<exact German phrase with mistake from student text>",
      "correction": "<corrected German phrasing>",
      "explanation": "<grammatical explanation in English>"
    }
  ],
  "feedback": "<overall qualitative evaluation summary in English addressing communicative effectiveness, strengths, and areas for improvement>"
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

          // Validate required fields in parsed JSON
          const rawScorePct = typeof parsed.score_percent === "number" ? parsed.score_percent : parseInt(parsed.score_percent || 0, 10);
          const scorePercent = Math.max(0, Math.min(100, isNaN(rawScorePct) ? 60 : rawScorePct));

          // Criterion name normalization to English (FIX 3)
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

          const criteria = Array.isArray(parsed.criteria) && parsed.criteria.length > 0
            ? parsed.criteria.map((c) => {
                const rawName = String(c.name || "Criterion").trim();
                const normalizedName = nameMapping[rawName.toLowerCase()] || rawName;
                return {
                  name: normalizedName,
                  score: typeof c.score === "number" ? c.score : parseFloat(c.score || 0) || 0,
                  max_score: typeof c.max_score === "number" ? c.max_score : 5,
                  feedback: String(c.feedback || ""),
                };
              })
            : [
                { name: "Task Fulfillment", score: Math.round(scorePercent / 20), max_score: 5, feedback: "Task fulfillment evaluated against required points." },
                { name: "Coherence & Structure", score: Math.round(scorePercent / 20), max_score: 5, feedback: "Coherence, greeting, and structure evaluated." },
                { name: "Vocabulary", score: Math.round(scorePercent / 20), max_score: 5, feedback: "Vocabulary range evaluated." },
                { name: "Grammar & Form", score: Math.round(scorePercent / 20), max_score: 5, feedback: "Grammar and spelling evaluated." },
              ];

          const mistakes = Array.isArray(parsed.mistakes)
            ? parsed.mistakes.map((m) => ({
                original: String(m.original || ""),
                correction: String(m.correction || ""),
                explanation: String(m.explanation || ""),
              })).filter((m) => m.original || m.correction)
            : [];

          const feedback = String(parsed.feedback || "Your writing submission was evaluated against the examination task.");

          evaluationResult = {
            score_percent: scorePercent,
            cefr_level_met: scorePercent >= 60,
            word_count: wordCount,
            criteria,
            mistakes,
            feedback,
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
