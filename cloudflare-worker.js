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

// ============================================================================
// FIRESTORE REST API & REFERRAL SYSTEM HELPERS
// ============================================================================

const FIREBASE_WEB_API_KEY = "AIzaSyCAmxLSnUWMuhuuH8oFshZMTajeP2iXvpY";
let cachedGoogleAccessToken = null;
let googleAccessTokenExp = 0;

/**
 * Exchange Google Service Account credentials for OAuth2 Access Token
 * using standard Web Crypto PKCS8 RS256 signing.
 */
async function getGoogleOAuthToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedGoogleAccessToken && now < googleAccessTokenExp - 60) {
    return cachedGoogleAccessToken;
  }

  let serviceAccount = null;
  const rawSa = env.FIREBASE_SERVICE_ACCOUNT || env.FIREBASE_ADMIN_CREDENTIALS;
  if (rawSa) {
    try {
      serviceAccount = typeof rawSa === "string" ? JSON.parse(rawSa) : rawSa;
    } catch (e) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT:", e);
    }
  }

  if (!serviceAccount || !serviceAccount.private_key || !serviceAccount.client_email) {
    return null;
  }

  try {
    const pem = serviceAccount.private_key
      .replace(/-----BEGIN PRIVATE KEY-----/g, "")
      .replace(/-----END PRIVATE KEY-----/g, "")
      .replace(/\s+/g, "");
    const rawBinary = atob(pem);
    const binaryDer = new Uint8Array(rawBinary.length);
    for (let i = 0; i < rawBinary.length; i++) {
      binaryDer[i] = rawBinary.charCodeAt(i);
    }

    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      binaryDer.buffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
      iss: serviceAccount.client_email,
      sub: serviceAccount.client_email,
      aud: "https://oauth2.googleapis.com/token",
      scope: "https://www.googleapis.com/auth/datastore",
      iat: now,
      exp: now + 3600,
    };

    const encoder = new TextEncoder();
    const toB64Url = (obj) =>
      btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    const unsignedToken = `${toB64Url(header)}.${toB64Url(payload)}`;

    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKey,
      encoder.encode(unsignedToken)
    );

    const sigB64Url = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const signedJwt = `${unsignedToken}.${sigB64Url}`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: signedJwt,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("Google OAuth token exchange failed:", err);
      return null;
    }

    const tokenData = await tokenRes.json();
    cachedGoogleAccessToken = tokenData.access_token;
    googleAccessTokenExp = now + (tokenData.expires_in || 3600);
    return cachedGoogleAccessToken;
  } catch (err) {
    console.error("Error generating Google OAuth token:", err);
    return null;
  }
}

async function getFirestoreAuthHeaders(env, callerIdToken) {
  const googleToken = await getGoogleOAuthToken(env);
  if (googleToken) {
    return { Authorization: `Bearer ${googleToken}` };
  }
  if (env.FIREBASE_ADMIN_TOKEN) {
    return { Authorization: `Bearer ${env.FIREBASE_ADMIN_TOKEN}` };
  }
  if (callerIdToken) {
    return { Authorization: `Bearer ${callerIdToken}` };
  }
  return {};
}

function jsValToFirestore(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === "string") return { stringValue: val };
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(jsValToFirestore) } };
  if (typeof val === "object") {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = jsValToFirestore(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function firestoreValToJs(val) {
  if (!val || typeof val !== "object") return null;
  if ("stringValue" in val) return val.stringValue;
  if ("integerValue" in val) return parseInt(val.integerValue, 10);
  if ("doubleValue" in val) return parseFloat(val.doubleValue);
  if ("booleanValue" in val) return Boolean(val.booleanValue);
  if ("nullValue" in val) return null;
  if ("timestampValue" in val) return val.timestampValue;
  if ("arrayValue" in val) {
    const list = val.arrayValue?.values || [];
    return list.map(firestoreValToJs);
  }
  if ("mapValue" in val) {
    const out = {};
    const f = val.mapValue?.fields || {};
    for (const [k, v] of Object.entries(f)) {
      out[k] = firestoreValToJs(v);
    }
    return out;
  }
  return null;
}

function docToJs(doc) {
  if (!doc || !doc.fields) return null;
  const out = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    out[k] = firestoreValToJs(v);
  }
  if (doc.name) {
    const parts = doc.name.split("/");
    out.id = parts[parts.length - 1];
  }
  return out;
}

function jsToFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k !== "id" && v !== undefined) {
      fields[k] = jsValToFirestore(v);
    }
  }
  return fields;
}

async function getFirestoreDoc(collection, docId, env, callerIdToken) {
  const authHeaders = await getFirestoreAuthHeaders(env, callerIdToken);
  const projectId = env.FIREBASE_PROJECT_ID || FIREBASE_PROJECT_ID;
  let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${encodeURIComponent(docId)}`;
  if (!authHeaders.Authorization) {
    url += `?key=${FIREBASE_WEB_API_KEY}`;
  }
  const res = await fetch(url, { headers: { ...authHeaders } });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore GET ${collection}/${docId} failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return docToJs(data);
}

async function setFirestoreDoc(collection, docId, data, env, callerIdToken, merge = true) {
  const authHeaders = await getFirestoreAuthHeaders(env, callerIdToken);
  const projectId = env.FIREBASE_PROJECT_ID || FIREBASE_PROJECT_ID;
  const fields = jsToFields(data);
  let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${encodeURIComponent(docId)}`;
  const params = [];
  if (merge) {
    for (const k of Object.keys(data)) {
      if (k !== "id") params.push(`updateMask.fieldPaths=${encodeURIComponent(k)}`);
    }
  }
  if (!authHeaders.Authorization) {
    params.push(`key=${FIREBASE_WEB_API_KEY}`);
  }
  if (params.length > 0) {
    url += `?${params.join("&")}`;
  }
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore PATCH ${collection}/${docId} failed (${res.status}): ${text}`);
  }
  const resData = await res.json();
  return docToJs(resData);
}

async function queryFirestore(collection, field, operator, value, env, callerIdToken) {
  const authHeaders = await getFirestoreAuthHeaders(env, callerIdToken);
  const projectId = env.FIREBASE_PROJECT_ID || FIREBASE_PROJECT_ID;
  let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  if (!authHeaders.Authorization) {
    url += `?key=${FIREBASE_WEB_API_KEY}`;
  }
  const body = {
    structuredQuery: {
      from: [{ collectionId: collection }],
      where: {
        fieldFilter: {
          field: { fieldPath: field },
          op: operator || "EQUAL",
          value: jsValToFirestore(value),
        },
      },
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore query ${collection} failed (${res.status}): ${text}`);
  }
  const rawList = await res.json();
  const results = [];
  for (const item of rawList) {
    if (item.document) {
      const parsed = docToJs(item.document);
      if (parsed) results.push(parsed);
    }
  }
  return results;
}

function generateReferralCode() {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 32 characters, no 0, O, 1, I
  let code = "COCO";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function getOrCreateReferralCode(uid, email, env, callerIdToken) {
  let profile = await getFirestoreDoc("userProfiles", uid, env, callerIdToken).catch(() => null);
  if (profile && profile.referralCode) {
    return { referralCode: profile.referralCode, profile };
  }

  let newCode = "";
  let attempts = 0;
  while (attempts < 5) {
    newCode = generateReferralCode();
    const existing = await queryFirestore("userProfiles", "referralCode", "EQUAL", newCode, env, callerIdToken).catch(() => []);
    if (!existing || existing.length === 0) break;
    attempts++;
  }

  const nowIso = new Date().toISOString();
  await setFirestoreDoc(
    "userProfiles",
    uid,
    {
      referralCode: newCode,
      referralCreatedAt: nowIso,
      updatedAt: nowIso,
    },
    env,
    callerIdToken,
    true
  ).catch((e) => console.warn("Could not save referralCode to profile:", e));

  if (profile) {
    profile.referralCode = newCode;
    profile.referralCreatedAt = nowIso;
  } else {
    profile = { uid, email: email || "", referralCode: newCode, referralCreatedAt: nowIso };
  }
  return { referralCode: newCode, profile };
}

async function getOrCreateReferralWallet(uid, env, callerIdToken) {
  let wallet = await getFirestoreDoc("referralWallets", uid, env, callerIdToken).catch(() => null);
  if (!wallet) {
    wallet = {
      coinBalance: 0,
      totalEarned: 0,
      totalSpent: 0,
      transactions: [],
      updatedAt: new Date().toISOString(),
    };
    await setFirestoreDoc("referralWallets", uid, wallet, env, callerIdToken, true).catch((e) => console.warn("Could not create wallet:", e));
  }
  return wallet;
}

function parsePurchasePrice(priceStr) {
  if (typeof priceStr === "number") return { amount: priceStr, currency: "EUR" };
  const raw = String(priceStr || "").trim();
  let currency = "EUR";
  if (raw.includes("₹") || /inr/i.test(raw) || /rs\.?/i.test(raw)) currency = "INR";
  else if (raw.includes("$") || /usd/i.test(raw)) currency = "USD";
  else if (raw.includes("£") || /gbp/i.test(raw)) currency = "GBP";
  else if (raw.includes("€") || /eur/i.test(raw)) currency = "EUR";

  const num = parseFloat(raw.replace(/[^0-9.]/g, ""));
  return {
    amount: isNaN(num) ? 0 : num,
    currency,
  };
}

function calculateReferralCoins(amount, currency, commissionPercent = 10) {
  const commAmount = (amount * commissionPercent) / 100;
  let multiplier = 100; // 1 EUR / USD / GBP = 100 coins
  if (currency === "INR") {
    multiplier = 10; // 1 INR = 10 coins
  }
  const coins = Math.round(commAmount * multiplier);
  return Math.max(1, coins);
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
          const nowIso = new Date().toISOString();
          const weeklyMockExams = (plan && typeof plan.weekly_mock_exams === "number") ? plan.weekly_mock_exams : 1;
          const newUser = {
            uid,
            membership: membershipCode,
            current_level: "A1",
            format: "goethe",
            credits_remaining: dailyPracticeCredits,
            last_reset: todayIsoDate,
            mock_exams_remaining: weeklyMockExams,
            mock_exams_last_reset: nowIso,
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
        let weeklyMockExams = 1;
        if (planRes.ok) {
          const planData = await planRes.json();
          if (planData && planData[0]) {
            if (typeof planData[0].daily_practice_credits === "number") {
              dailyPracticeCredits = planData[0].daily_practice_credits;
            }
            if (typeof planData[0].weekly_mock_exams === "number") {
              weeklyMockExams = planData[0].weekly_mock_exams;
            }
          }
        }

        // Initialize user if missing
        if (!userRow) {
          const todayIsoDate = new Date().toISOString().split("T")[0];
          const nowIso = new Date().toISOString();
          const newUser = {
            uid,
            membership: membershipCode,
            current_level: "A1",
            format: "goethe",
            credits_remaining: dailyPracticeCredits,
            last_reset: todayIsoDate,
            mock_exams_remaining: weeklyMockExams,
            mock_exams_last_reset: nowIso,
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
        const weeklyMockExams = (plan && typeof plan.weekly_mock_exams === "number") ? plan.weekly_mock_exams : 1;

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
            mock_exams_remaining: weeklyMockExams,
            mock_exams_last_reset: nowIso,
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

        // 1. ONE Supabase fetch: user_schreiben_entitlement VIEW
        //    Joins learning_users → plans → schreiben_plan_config in a single query.
        //    Supabase is the sole source of truth — the Worker never invents plan config.
        const entitlementRes = await fetch(
          `${supabaseUrl}/rest/v1/user_schreiben_entitlement?uid=eq.${encodeURIComponent(uid)}&select=*`,
          {
            headers: {
              "apikey": serviceRoleKey,
              "Authorization": `Bearer ${serviceRoleKey}`,
            },
          }
        );

        if (!entitlementRes.ok) {
          const errText = await entitlementRes.text();
          console.error(`user_schreiben_entitlement fetch failed (${entitlementRes.status}):`, errText);
          return responseJSON(
            {
              success: false,
              error: "entitlement_fetch_error",
              message: `Server error: could not load user entitlement configuration (${entitlementRes.status}). Please try again.`,
            },
            503,
            request
          );
        }

        const entitlementData = await entitlementRes.json();
        let entitlement = entitlementData && entitlementData.length > 0 ? entitlementData[0] : null;

        // If the user row does not exist yet, create it and retry the VIEW once.
        let userRow = entitlement ? { ...entitlement } : null;

        if (!entitlement) {
          // User record missing — initialise with FREE defaults from the plans table.
          const planBootRes = await fetch(
            `${supabaseUrl}/rest/v1/plans?code=eq.FREE&select=daily_practice_credits,weekly_schreiben_limit,weekly_mock_exams`,
            {
              headers: {
                "apikey": serviceRoleKey,
                "Authorization": `Bearer ${serviceRoleKey}`,
              },
            }
          );
          const planBootData = planBootRes.ok ? await planBootRes.json() : null;
          const bootPlan = planBootData && planBootData[0];
          const todayIsoDate = new Date().toISOString().split("T")[0];
          const nowIso = new Date().toISOString();
          const bootCredits = (bootPlan && typeof bootPlan.daily_practice_credits === "number") ? bootPlan.daily_practice_credits : 10;
          const bootSchreiben = (bootPlan && typeof bootPlan.weekly_schreiben_limit === "number") ? bootPlan.weekly_schreiben_limit : 0;
          const bootMock = (bootPlan && typeof bootPlan.weekly_mock_exams === "number") ? bootPlan.weekly_mock_exams : 1;

          const newUser = {
            uid,
            membership: "FREE",
            current_level: "A1",
            format: "goethe",
            credits_remaining: bootCredits,
            last_reset: todayIsoDate,
            schreiben_credits_remaining: bootSchreiben,
            schreiben_last_reset: nowIso,
            mock_exams_remaining: bootMock,
            mock_exams_last_reset: nowIso,
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
            return responseJSON(
              { error: `Supabase user creation error (${createRes.status}): ${errText}` },
              createRes.status,
              request
            );
          }

          // Re-query the VIEW now that the row exists
          const retryRes = await fetch(
            `${supabaseUrl}/rest/v1/user_schreiben_entitlement?uid=eq.${encodeURIComponent(uid)}&select=*`,
            {
              headers: {
                "apikey": serviceRoleKey,
                "Authorization": `Bearer ${serviceRoleKey}`,
              },
            }
          );
          const retryData = retryRes.ok ? await retryRes.json() : null;
          const retryRow = retryData && retryData.length > 0 ? retryData[0] : null;

          if (!retryRow) {
            return responseJSON(
              {
                success: false,
                error: "entitlement_unavailable",
                message: "Server error: user entitlement could not be established. Please try again.",
              },
              503,
              request
            );
          }
          userRow = retryRow;
        }

        // ── Membership & plan fields (from VIEW) ─────────────────────────────
        const membershipCode = String(userRow.membership || "FREE").toUpperCase().trim();
        const schreibenEnabled = Boolean(userRow.schreiben_enabled);
        const weeklySchreibenLimit = typeof userRow.weekly_schreiben_limit === "number" ? userRow.weekly_schreiben_limit : 0;
        const weeklyMockExams = typeof userRow.weekly_mock_exams === "number" ? userRow.weekly_mock_exams : 1;

        // ── Fail-safe: schreiben_plan_config must be present in the VIEW row ─
        //    If max_key_mistakes is null the JOIN found no config row → fail clearly.
        if (userRow.max_key_mistakes === null || userRow.max_key_mistakes === undefined) {
          console.error(
            `schreiben_plan_config row missing for membership '${membershipCode}' (uid: ${uid}). ` +
            "Populate the schreiben_plan_config table for this plan code."
          );
          return responseJSON(
            {
              success: false,
              error: "plan_config_unavailable",
              message:
                "Server error: Schreiben evaluation configuration is not available for your plan. " +
                "Please contact support if this persists.",
            },
            503,
            request
          );
        }

        // ── Build activePlanConfig directly from the VIEW row (no defaults, no hardcoding) ──
        const activePlanConfig = {
          plan_code:                       String(userRow.plan_code || membershipCode),
          max_key_mistakes:                userRow.max_key_mistakes,
          max_grammar_explanations:        userRow.max_grammar_explanations,
          max_word_usage_items:            userRow.max_word_usage_items,
          unclear_sentence_limit:          userRow.unclear_sentence_limit,
          redemittel_limit:                userRow.redemittel_limit,
          max_strengths:                   userRow.max_strengths,
          max_improvements:                userRow.max_improvements,
          max_corrections:                 userRow.max_corrections,
          max_improved_sentences:          userRow.max_improved_sentences,
          task_fulfillment:                userRow.task_fulfillment,
          task_fulfillment_depth:          userRow.task_fulfillment_depth,
          grammar_depth:                   userRow.grammar_depth,
          word_usage_depth:                userRow.word_usage_depth,
          structure_depth:                 userRow.structure_depth,
          redemittel_depth:                userRow.redemittel_depth,
          correction_depth:                userRow.correction_depth,
          improved_version:                userRow.improved_version,
          improved_version_depth:          userRow.improved_version_depth,
          strengths_depth:                 userRow.strengths_depth,
          improvements_depth:              userRow.improvements_depth,
          show_error_patterns:             userRow.show_error_patterns,
          show_long_term_weaknesses:       userRow.show_long_term_weaknesses,
          show_personalized_learning_plan: userRow.show_personalized_learning_plan,
          register_analysis:               userRow.register_analysis,
        };

        // ── Derive canonical plan name for display / logging ─────────────────
        //    (membership always comes from the DB — never trusted from the frontend)
        const VALID_PLANS = ["Free", "Basic", "Pro", "Advanced", "Personal"];
        const matchedPlan = VALID_PLANS.find((p) => p.toLowerCase() === membershipCode.toLowerCase());
        const validatedPlan = matchedPlan || "Free";

        // Parse input body early to check for mock exam context
        let body = {};
        try {
          body = await request.json();
        } catch (e) {
          body = {};
        }

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

        // 4. Validate input payload and obtain authoritative exam task (body was parsed earlier)

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

        // 6. Build dynamic prompt with DB-backed schreiben_plan_config and qualitative teacher evaluation
        // Centralized depth interpretations
        const DEPTH_DESCRIPTIONS = {
          summary: "concise overview",
          limited: "brief explanation focused on the most important issue",
          medium: "clear explanation with reason, correction and useful example where appropriate",
          full: "comprehensive explanation including the rule, problem, correction and example",
          deep: "detailed teacher-style explanation including the underlying rule, why the student's wording fails, natural alternatives, examples and prevention advice",
          deep_personal: "deep explanation additionally adapted to the student's demonstrated weaknesses and writing level",
          targeted: "concentrate on the most useful areas for this particular task/student",
          personalized: "adapt explanations, examples and recommendations specifically to the student's writing and weaknesses",
          enhanced: "more detailed/polished than standard full analysis",
          extensive: "broad useful suggestions without unnecessary repetition"
        };

        function resolveDepth(depthKey, fallback = "medium") {
          const k = String(depthKey || "").toLowerCase().trim();
          return DEPTH_DESCRIPTIONS[k] || DEPTH_DESCRIPTIONS[fallback] || k;
        }


        const evaluationPrompt = `
You are a qualified German writing teacher and Goethe/telc exam-preparation evaluator analyzing a student's ${examFormat.toUpperCase()} ${level} (${teilText}) writing submission.

CRITICAL INSTRUCTION - EVALUATION LANGUAGE:
- You must write ALL evaluations, pedagogical explanations, feedback, criteria assessments, overall summaries, register/tone analyses, error pattern analyses, long-term weaknesses, and personalized learning plans in ENGLISH.
- The student's original German text must be kept unchanged in "original" and "evidence" fields.
- All German corrections ("correction"), rewritten sentences ("rewritten"), improved sentences ("improved"), model revisions ("improved_version"), and German Redemittel phrases ("phrase") must remain in natural, authentic German.
- Do NOT translate German text, German corrections, or German examples to English unless specifically requested. Explain the German text in clear English while keeping the German words/sentences in German.

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

CALIBRATED EXPLANATION DEPTH REQUIREMENTS:
- Task Fulfillment Analysis Depth: ${resolveDepth(activePlanConfig.task_fulfillment_depth)}
- Grammar Explanations Depth: ${resolveDepth(activePlanConfig.grammar_depth)}
- Word Usage & Choice Depth: ${resolveDepth(activePlanConfig.word_usage_depth)}
- Structure & Organization Depth: ${resolveDepth(activePlanConfig.structure_depth)}
- Redemittel Suggestions Depth: ${resolveDepth(activePlanConfig.redemittel_depth)}
- Corrections & Re-writes Depth: ${resolveDepth(activePlanConfig.correction_depth)}
- Strengths Depth: ${resolveDepth(activePlanConfig.strengths_depth)}
- Improvements Depth: ${resolveDepth(activePlanConfig.improvements_depth)}
- Improved Version Depth: ${resolveDepth(activePlanConfig.improved_version_depth)}

EVALUATION RESPONSIBILITIES (ANALYZE THOROUGHLY ACROSS ALL AREAS WHERE APPLICABLE — WRITE ALL EXPLANATIONS IN ENGLISH):
1. Task fulfillment: Check every required Leitpunkt individually. Determine whether each is "fulfilled", "partial", or "missing". Cite the student's exact German wording in "evidence". If missing, set evidence to "". Write qualitative feedback in criteria.task_fulfillment in English.
2. Grammar mistakes: Identify genuine grammatical errors (syntax, morphology, case government, endings, word order). Provide original German wording in "original", corrected German wording in "correction" (in German), and pedagogical explanation of the rule written in English.
3. Word usage / improper usage: Identify words or expressions that are grammatically possible but inappropriate, unnatural, or unsuitable in the sentence/context. Provide original German wording in "original", suggested German wording in "suggestion" (in German), and pedagogical explanation written in English.
4. Word choice: Identify cases where an alternative German word or expression communicates the intended meaning more accurately, idiomatically, or naturally for CEFR ${level}.
5. Unclear sentences: Identify sentences whose meaning is unclear, awkward, or difficult to comprehend. Provide the original German sentence in "original", a completely rewritten natural German version in "rewritten" (in German), and explanation written in English.
6. Why it is wrong / problematic: In all explanations, explain the underlying linguistic issue at CEFR ${level} level in English rather than simply giving a bare correction.
7. Structure and organization: Evaluate how ideas are introduced, developed, connected, and concluded. Assess paragraph transitions and connective flow in criteria.coherence in English.
8. Redemittel: Suggest useful, natural German Redemittel and sentence connectors in "phrase" (in German) and explain how and when to use them in "usage" in English.
9. How to improve: Provide practical, specific, actionable advice written in English based on the student's actual demonstrated weaknesses.
10. Improved version: Produce a fully corrected, naturally rewritten version of the student's entire submission in authentic German in "improved_version" while strictly preserving the student's intended meaning. Do NOT translate it to English. Do not introduce ideas that were not present unless necessary to make the text coherent.
11. Systematic error patterns: If recurring habits or systematic mistake patterns exist (e.g. Nebensatz verb position, adjective declension), explain them in error_patterns in English.
12. Long-term weaknesses: Identify broader language learning hurdles to focus on over coming weeks in long_term_weaknesses in English.
13. Personalized learning plan: Recommend tailored next study steps and practice drills in personalized_learning_plan in English.
14. Register analysis: Analyze formality, salutations, closing etiquette, and situational tone in register_analysis in English (e.g. tone description and analysis in English).
15. Strengths & improvements: Identify genuine strengths in feedback.strengths (in English) and priority growth points in feedback.improvements (in English).
16. Summary: Provide a concise, objective overall qualitative assessment in feedback.summary written in English.

MANDATORY RULES & CONSTRAINTS:
1. OUTPUT LANGUAGE IS STRICTLY ENGLISH:
   - All evaluation texts, pedagogical explanations, criteria assessments, feedback comments, register/tone observations, strengths, improvements, summaries, error pattern descriptions, long-term weaknesses, and learning plan steps MUST be written in ENGLISH.
   - The student's original German submission and cited quotes must remain in original German in "original" and "evidence".
   - All German corrections ("correction"), rewritten sentences ("rewritten"), improved sentences ("improved"), model revisions ("improved_version"), and German Redemittel phrases ("phrase") MUST remain in authentic German.
   - Do NOT translate German corrections, German sentences, or German examples into English. Explain them in English.
2. STRICTLY QUALITATIVE: Completely remove all percentage, marks, pass/fail, and score-based evaluation concepts. You must NOT calculate, recommend, determine, or return any numeric score, mark, or percentage. Focus exclusively on qualitative feedback, explanations, and actionable observations in English.
3. DO NOT INVENT MISTAKES: Only identify authentic linguistic, grammatical, lexical, or structural issues present in the student's text. If the student's text contains no genuine issue in a category, return an empty array. Never invent mistakes simply to fill a limit.
4. CEFR LEVEL CALIBRATION: Calibrate all feedback, corrections, explanations, and Redemittel strictly to CEFR ${level}.
5. INTERNAL LOGIC CONFIDENTIALITY: Never expose internal plan names, limits, AI model selection, or database configuration in the feedback or report.
6. OBJECTIVE TEACHER TONE: Maintain an encouraging yet objective pedagogical tone in English. Avoid generic empty praise ("Very good", "Super", "Great job").
7. LANGUAGE REQUIREMENT: If the student's submission is mostly non-German (English/other), set language.detected to the detected language, language.appropriate = false, and provide guidance in English explaining the requirement to write in German.

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
        "evidence": "Exact German quote from student text, or \\"\\" if missing"
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
      "feedback": "Detailed qualitative assessment in English of task fulfillment and addressing of Leitpunkte."
    },
    "coherence": {
      "feedback": "Detailed qualitative assessment in English of text structure, organization, and connective flow."
    },
    "vocabulary": {
      "feedback": "Detailed qualitative assessment in English of vocabulary range, word choice, and appropriateness."
    },
    "grammar_form": {
      "feedback": "Detailed qualitative assessment in English of grammatical correctness, syntax, morphology, and form."
    }
  },
  "mistakes": [
    {
      "original": "Exact student German wording",
      "correction": "Correct German wording (in German)",
      "type": "grammar",
      "explanation": "Clear pedagogical explanation in English of the grammar rule and error."
    }
  ],
  "word_usage": [
    {
      "original": "Exact student German wording",
      "suggestion": "Recommended German wording (in German)",
      "explanation": "Clear explanation in English of why the word is unnatural or inappropriate."
    }
  ],
  "unclear_sentences": [
    {
      "original": "Original student German sentence",
      "rewritten": "Naturally rewritten German sentence (in German)",
      "explanation": "Explanation in English of what made the sentence unclear."
    }
  ],
  "redemittel": [
    {
      "phrase": "German Redemittel phrase or connector (in German)",
      "usage": "Guidance in English on how and when to use this phrase."
    }
  ],
  "improved_sentences": [
    {
      "original": "Original student German sentence",
      "improved": "Naturally improved German sentence (in German)",
      "explanation": "Explanation in English of why this improved version is better."
    }
  ],
  "improved_version": "Complete, naturally rewritten version of the student's entire submission in authentic German (keep in German, do not translate to English).",
  "error_patterns": [
    {
      "pattern": "Name of error pattern in English (e.g. Subordinate Clause Verb Position)",
      "explanation": "Explanation in English of how this pattern manifests.",
      "advice": "Actionable advice in English on how to prevent this mistake."
    }
  ],
  "long_term_weaknesses": [
    {
      "area": "Focus area in English (e.g. Dative vs. Accusative Prepositions)",
      "diagnostic": "Diagnostic in English of why this is a challenge.",
      "remedy": "Recommended study action in English."
    }
  ],
  "personalized_learning_plan": [
    {
      "step": 1,
      "focus": "Study topic in English",
      "action": "Concrete practice exercise in English"
    }
  ],
  "register_analysis": {
    "appropriate": true,
    "tone": "Description of tone in English (e.g. Appropriate informal, Too formal, Incomplete for an informal letter)",
    "analysis": "Detailed register analysis in English.",
    "recommendation": "Recommendation in English for proper greeting, register, and sign-off."
  },
  "feedback": {
    "summary": "Objective qualitative overview of the submission in English.",
    "strengths": [
      "Strength in English",
      "Strength in English"
    ],
    "improvements": [
      "Improvement suggestion in English",
      "Improvement suggestion in English"
    ]
  }
}
`.trim();


        // Helper: safely sanitize Gemini error messages to never leak secrets
        function sanitizeGeminiError(errorText, keyToRedact) {
          if (!errorText) return "";
          let clean = String(errorText);
          if (keyToRedact && typeof keyToRedact === "string" && keyToRedact.length > 5) {
            clean = clean.split(keyToRedact).join("[REDACTED_API_KEY]");
          }
          clean = clean.replace(/key=[a-zA-Z0-9_\-]+/gi, "key=[REDACTED_API_KEY]");
          clean = clean.replace(/apikey:[^,\s}]+/gi, "apikey:[REDACTED_API_KEY]");
          return clean;
        }

        // Minimum model-selection configuration required for plan-based AI selection
        // Current available evaluator model
        const AVAILABLE_EVALUATOR_MODEL = "gemini-3.5-flash-lite";

        // AI selection mapping per plan tier:
        // Free -> Gemini 3.5 Flash-Lite
        // Basic -> Gemini 3.5 Flash-Lite
        // Pro -> [PRO_AI_PLACEHOLDER]
        // Advanced -> [ADVANCED_AI_PLACEHOLDER]
        // Personal -> [PERSONAL_AI_PLACEHOLDER]
        const PLAN_AI_MODEL_MAP = {
          Free: AVAILABLE_EVALUATOR_MODEL,
          Basic: AVAILABLE_EVALUATOR_MODEL,
          Pro: "[PRO_AI_PLACEHOLDER]",
          Advanced: "[ADVANCED_AI_PLACEHOLDER]",
          Personal: "[PERSONAL_AI_PLACEHOLDER]",
        };

        // Determine configured model; higher-tier placeholders are not currently available
        // If placeholder model is unavailable, automatically fall back to Gemini 3.5 Flash-Lite
        const targetModelConfig = PLAN_AI_MODEL_MAP[validatedPlan];
        const isPlaceholderUnavailable = !targetModelConfig || targetModelConfig.includes("PLACEHOLDER");
        const selectedModel = isPlaceholderUnavailable ? AVAILABLE_EVALUATOR_MODEL : targetModelConfig;

        // Model candidates priority: selectedModel (or fallback evaluator) followed by available evaluator and resilient backups
        const modelCandidates = [
          selectedModel,
          AVAILABLE_EVALUATOR_MODEL,
          "gemini-3.5-flash",
          "gemini-3.8-flash",
          "gemini-2.5-flash-lite",
          "gemini-2.0-flash-lite"
        ].filter((m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx);

        let evaluationResult = null;
        try {
          let candidateText = null;
          let lastErrStatus = null;
          let lastErrBody = null;
          const attempts = [];

          for (const modelId of modelCandidates) {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
            let geminiRes;
            try {
              geminiRes = await fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [
                    {
                      role: "user",
                      parts: [{ text: evaluationPrompt }]
                    }
                  ],
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
              const sanitizedErr = sanitizeGeminiError(String(fetchErr), geminiApiKey);
              console.error(`Gemini fetch error for model ${modelId}:`, sanitizedErr);
              lastErrBody = sanitizedErr;
              attempts.push({ model: modelId, error: sanitizedErr });
              continue;
            }

            if (!geminiRes.ok) {
              lastErrStatus = geminiRes.status;
              const rawBody = await geminiRes.text();
              lastErrBody = sanitizeGeminiError(rawBody, geminiApiKey);
              console.error(`Gemini API Error (${modelId}):`, lastErrStatus, lastErrBody);
              attempts.push({ model: modelId, status: lastErrStatus, error: lastErrBody });
              continue; // try next model
            }

            let geminiData;
            try {
              geminiData = await geminiRes.json();
            } catch (jsonErr) {
              const sanitizedJsonErr = sanitizeGeminiError(String(jsonErr), geminiApiKey);
              console.error(`Gemini JSON parse error for model ${modelId}:`, sanitizedJsonErr);
              attempts.push({ model: modelId, error: `JSON parse error: ${sanitizedJsonErr}` });
              continue;
            }

            const parts = geminiData?.candidates?.[0]?.content?.parts;
            const text = Array.isArray(parts)
              ? parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("").trim()
              : "";

            if (!text) {
              const finishReason = geminiData?.candidates?.[0]?.finishReason || "unknown";
              console.error(`Empty evaluation response from model ${modelId}. FinishReason:`, finishReason);
              lastErrBody = `Empty response from ${modelId} (finishReason: ${finishReason})`;
              attempts.push({ model: modelId, error: lastErrBody });
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
                  models_attempted: modelCandidates,
                  attempts: attempts,
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

          // Extract qualitative criteria feedback
          const rawCriteria = parsed?.criteria || {};
          const criteriaList = [
            {
              name: "Task Fulfillment",
              feedback: String(rawCriteria.task_fulfillment?.feedback || rawCriteria.task_fulfillment || "").trim() || "Task fulfillment and Leitpunkte were qualitatively evaluated."
            },
            {
              name: "Coherence & Structure",
              feedback: String(rawCriteria.coherence?.feedback || rawCriteria.coherence || "").trim() || "Text structure, connective flow, and organization were qualitatively evaluated."
            },
            {
              name: "Vocabulary",
              feedback: String(rawCriteria.vocabulary?.feedback || rawCriteria.vocabulary || "").trim() || "Vocabulary range and word choice were qualitatively evaluated."
            },
            {
              name: "Grammar & Form",
              feedback: String(rawCriteria.grammar_form?.feedback || rawCriteria.grammar_form || "").trim() || "Grammatical accuracy and form were qualitatively evaluated."
            }
          ];

          const criteriaMap = {
            task_fulfillment: { feedback: criteriaList[0].feedback },
            coherence: { feedback: criteriaList[1].feedback },
            vocabulary: { feedback: criteriaList[2].feedback },
            grammar_form: { feedback: criteriaList[3].feedback }
          };

          // Helper: safely apply numeric plan limit (999 means no practical restriction)
          const applyLimit = (arr, limit) => {
            if (!Array.isArray(arr)) return [];
            const numLimit = typeof limit === "number" ? limit : parseInt(String(limit || "999"), 10);
            if (isNaN(numLimit) || numLimit >= 999) return arr;
            return arr.slice(0, Math.max(0, numLimit));
          };

          // Helper: extract first two sentences for German text
          const extractFirstTwoSentences = (text) => {
            if (!text) return "";
            const str = String(text).trim();
            const sentenceMatches = str.match(/[^.!?]+[.!?]+(?:\s+|$)/g);
            if (sentenceMatches && sentenceMatches.length >= 2) {
              return (sentenceMatches[0] + sentenceMatches[1]).trim();
            }
            if (sentenceMatches && sentenceMatches.length === 1) {
              return sentenceMatches[0].trim();
            }
            const parts = str.split(/(?<=[.!?])\s+/);
            if (parts.length >= 2) {
              return (parts[0] + " " + parts[1]).trim();
            }
            return str;
          };

          // 1. Process genuine mistakes (Grammar, Spelling, Form)
          const rawMistakes = Array.isArray(parsed.mistakes)
            ? parsed.mistakes.map((m) => ({
                original: String(m.original || "").trim(),
                correction: String(m.correction || "").trim(),
                type: String(m.type || "grammar").trim(),
                explanation: String(m.explanation || "").trim(),
              })).filter((m) => m.original || m.correction)
            : [];

          // Apply max_key_mistakes limit
          let filteredMistakes = applyLimit(rawMistakes, activePlanConfig.max_key_mistakes);

          // Apply max_corrections (cap total correction items)
          const maxCorrections = typeof activePlanConfig.max_corrections === "number"
            ? activePlanConfig.max_corrections
            : 999;
          if (maxCorrections < 999 && filteredMistakes.length > maxCorrections) {
            filteredMistakes = filteredMistakes.slice(0, Math.max(0, maxCorrections));
          }

          // Apply max_grammar_explanations (limit explanations on grammar issues)
          const maxGrammarExplanations = typeof activePlanConfig.max_grammar_explanations === "number"
            ? activePlanConfig.max_grammar_explanations
            : 999;
          let hasMoreGrammarExplanations = false;
          if (maxGrammarExplanations < 999) {
            let grammarExpCount = 0;
            filteredMistakes = filteredMistakes.map((m) => {
              if (m.type === "grammar" && m.explanation) {
                grammarExpCount++;
                if (grammarExpCount > maxGrammarExplanations) {
                  hasMoreGrammarExplanations = true;
                  return { ...m, explanation: "" };
                }
              }
              return m;
            });
          }

          // 2. Word usage
          const rawWordUsage = Array.isArray(parsed.word_usage)
            ? parsed.word_usage.map((wu) => ({
                original: String(wu.original || "").trim(),
                suggestion: String(wu.suggestion || wu.correction || "").trim(),
                explanation: String(wu.explanation || "").trim(),
              })).filter((wu) => wu.original || wu.suggestion)
            : [];
          const filteredWordUsage = applyLimit(rawWordUsage, activePlanConfig.max_word_usage_items);

          // 3. Unclear sentences
          const rawUnclearSentences = Array.isArray(parsed.unclear_sentences)
            ? parsed.unclear_sentences.map((us) => ({
                original: String(us.original || "").trim(),
                rewritten: String(us.rewritten || us.correction || "").trim(),
                explanation: String(us.explanation || "").trim(),
              })).filter((us) => us.original || us.rewritten)
            : [];
          const filteredUnclearSentences = applyLimit(rawUnclearSentences, activePlanConfig.unclear_sentence_limit);

          // 4. Register analysis (Boolean gate)
          const allowRegisterAnalysis = Boolean(activePlanConfig.register_analysis);
          const filteredRegisterAnalysis = (allowRegisterAnalysis && parsed.register_analysis)
            ? {
                appropriate: parsed.register_analysis.appropriate !== false,
                tone: String(parsed.register_analysis.tone || "").trim(),
                analysis: String(parsed.register_analysis.analysis || parsed.register_analysis.feedback || "").trim(),
                recommendation: String(parsed.register_analysis.recommendation || "").trim(),
              }
            : null;

          // 5. Improved sentences
          const rawImprovedSentences = Array.isArray(parsed.improved_sentences)
            ? parsed.improved_sentences.map((is) => ({
                original: String(is.original || "").trim(),
                improved: String(is.improved || is.correction || "").trim(),
                explanation: String(is.explanation || is.reason || "").trim(),
              })).filter((is) => is.original || is.improved)
            : [];
          const filteredImprovedSentences = applyLimit(rawImprovedSentences, activePlanConfig.max_improved_sentences);

          // 6. Redemittel
          const rawRedemittel = Array.isArray(parsed.redemittel)
            ? parsed.redemittel.map((r) => ({
                phrase: typeof r === "object" ? String(r.phrase || r.text || "").trim() : String(r || "").trim(),
                usage: typeof r === "object" ? String(r.usage || r.context || "").trim() : "",
              })).filter((r) => r.phrase)
            : [];
          const filteredRedemittel = applyLimit(rawRedemittel, activePlanConfig.redemittel_limit);

          // 7. Improved version feature gate ("first_2_sentences" | "full" | "none"/falsy)
          let rawImprovedVersion = "";
          if (typeof parsed.improved_version === "string") {
            rawImprovedVersion = parsed.improved_version.trim();
          } else if (parsed.improved_version && typeof parsed.improved_version === "object") {
            rawImprovedVersion = String(parsed.improved_version.text || parsed.improved_version.improved || parsed.improved_version.content || parsed.improved_version.version || "").trim();
          } else if (typeof parsed.improved_text === "string") {
            rawImprovedVersion = parsed.improved_text.trim();
          } else if (typeof parsed.improvedVersion === "string") {
            rawImprovedVersion = parsed.improvedVersion.trim();
          } else if (typeof parsed.model_revision === "string") {
            rawImprovedVersion = parsed.model_revision.trim();
          }

          const improvedVersionConfig = String(activePlanConfig.improved_version || "").toLowerCase().trim();
          const isProOrAbove = ["pro", "advanced", "personal"].includes(String(validatedPlan).toLowerCase());
          const isFullConfig = isProOrAbove || improvedVersionConfig === "full" || improvedVersionConfig === "true" || activePlanConfig.improved_version === true;

          let filteredImprovedVersion = null;
          let improvedVersionMode = "none";

          if (isFullConfig) {
            filteredImprovedVersion = rawImprovedVersion;
            improvedVersionMode = "full";

            // Fallback for Pro/above if rawImprovedVersion was missing from AI output
            if (!filteredImprovedVersion && isProOrAbove) {
              if (Array.isArray(filteredImprovedSentences) && filteredImprovedSentences.length > 0) {
                filteredImprovedVersion = filteredImprovedSentences
                  .map((s) => String(s.improved || s.correction || "").trim())
                  .filter(Boolean)
                  .join(" ");
              }
              if (!filteredImprovedVersion && studentAnswer) {
                filteredImprovedVersion = studentAnswer;
              }
            }
          } else if (improvedVersionConfig === "first_2_sentences" && rawImprovedVersion) {
            filteredImprovedVersion = extractFirstTwoSentences(rawImprovedVersion);
            improvedVersionMode = "first_2_sentences";
          } else if (rawImprovedVersion && !isProOrAbove) {
            // Default Free/Basic to 2-sentence preview
            filteredImprovedVersion = extractFirstTwoSentences(rawImprovedVersion);
            improvedVersionMode = "first_2_sentences";
          } else {
            filteredImprovedVersion = null;
            improvedVersionMode = "none";
          }

          // 8. Strengths and improvements
          const feedbackObj = typeof parsed.feedback === "object" ? parsed.feedback : {};
          const rawStrengths = Array.isArray(feedbackObj?.strengths)
            ? feedbackObj.strengths.map((s) => String(s || "").trim()).filter(Boolean)
            : [];
          const rawImprovements = Array.isArray(feedbackObj?.improvements)
            ? feedbackObj.improvements.map((i) => String(i || "").trim()).filter(Boolean)
            : [];

          const filteredStrengths = applyLimit(rawStrengths, activePlanConfig.max_strengths);
          const filteredImprovements = applyLimit(rawImprovements, activePlanConfig.max_improvements);

          const feedbackSummary = String(feedbackObj?.summary || parsed.feedback || "").trim();
          const feedbackText = feedbackSummary || "Your writing submission was evaluated against the examination task.";

          // 9. Task fulfillment feature gate
          let filteredTaskFulfillment = parsed.task_fulfillment || null;
          if (activePlanConfig.task_fulfillment === false) {
            filteredTaskFulfillment = null;
          }

          // 10. Systematic error patterns (Boolean gate)
          const rawErrorPatterns = Array.isArray(parsed.error_patterns)
            ? parsed.error_patterns.map((ep) => ({
                pattern: String(ep.pattern || "").trim(),
                description: String(ep.description || "").trim(),
                frequency: String(ep.frequency || "").trim(),
                examples: Array.isArray(ep.examples) ? ep.examples.map((ex) => String(ex || "").trim()).filter(Boolean) : [],
              })).filter((ep) => ep.pattern || ep.description)
            : [];
          const filteredErrorPatterns = activePlanConfig.show_error_patterns ? rawErrorPatterns : null;

          // 11. Long-term weaknesses (Boolean gate)
          const rawLongTermWeaknesses = Array.isArray(parsed.long_term_weaknesses)
            ? parsed.long_term_weaknesses.map((w) => ({
                area: String(w.area || "").trim(),
                diagnostic: String(w.diagnostic || "").trim(),
                remedy: String(w.remedy || "").trim(),
              })).filter((w) => w.area || w.diagnostic)
            : [];
          const filteredLongTermWeaknesses = activePlanConfig.show_long_term_weaknesses ? rawLongTermWeaknesses : null;

          // 12. Personalized learning plan (Boolean gate)
          const rawLearningPlan = Array.isArray(parsed.personalized_learning_plan)
            ? parsed.personalized_learning_plan.map((lp) => ({
                focus: String(lp.focus || "").trim(),
                action_items: Array.isArray(lp.action_items) ? lp.action_items.map((ai) => String(ai || "").trim()).filter(Boolean) : [],
                recommended_topics: Array.isArray(lp.recommended_topics) ? lp.recommended_topics.map((rt) => String(rt || "").trim()).filter(Boolean) : [],
              })).filter((lp) => lp.focus || (lp.action_items && lp.action_items.length > 0))
            : [];
          const filteredLearningPlan = activePlanConfig.show_personalized_learning_plan ? rawLearningPlan : null;

          // Compute locked_features metadata for frontend
          const lockedFeatures = {
            has_more_mistakes: rawMistakes.length > filteredMistakes.length,
            has_more_grammar_explanations: hasMoreGrammarExplanations,
            has_more_word_usage: rawWordUsage.length > filteredWordUsage.length,
            has_more_unclear_sentences: rawUnclearSentences.length > filteredUnclearSentences.length,
            has_more_improved_sentences: rawImprovedSentences.length > filteredImprovedSentences.length,
            has_more_redemittel: rawRedemittel.length > filteredRedemittel.length,
            has_more_strengths: rawStrengths.length > filteredStrengths.length,
            has_more_improvements: rawImprovements.length > filteredImprovements.length,
            has_more_improved_version: isProOrAbove ? false : (improvedVersionMode === "first_2_sentences"),
            improved_version_locked: isProOrAbove ? false : (improvedVersionMode === "none" || !filteredImprovedVersion),
            task_fulfillment_locked: activePlanConfig.task_fulfillment === false,
            register_analysis_locked: !activePlanConfig.register_analysis,
            error_patterns_locked: !activePlanConfig.show_error_patterns,
            long_term_weaknesses_locked: !activePlanConfig.show_long_term_weaknesses,
            personalized_learning_plan_locked: !activePlanConfig.show_personalized_learning_plan,
          };

          evaluationResult = {
            score_percent: null,
            cefr_level_met: true,
            word_count: wordCount,
            criteria: criteriaList,
            criteria_map: criteriaMap,
            mistakes: filteredMistakes,
            feedback: feedbackText,
            feedback_details: {
              summary: feedbackText,
              strengths: filteredStrengths,
              improvements: filteredImprovements,
            },
            task_fulfillment: filteredTaskFulfillment,
            language: parsed.language || { detected: "German", appropriate: true },
            development: parsed.development || null,
            format: parsed.format || null,
            improved_version: filteredImprovedVersion,
            improved_version_mode: improvedVersionMode,
            improved_sentences: filteredImprovedSentences,
            redemittel: filteredRedemittel,
            unclear_sentences: filteredUnclearSentences,
            word_usage: filteredWordUsage,
            register_analysis: filteredRegisterAnalysis,
            error_patterns: filteredErrorPatterns,
            long_term_weaknesses: filteredLongTermWeaknesses,
            personalized_learning_plan: filteredLearningPlan,
            applied_rules: ["qualitative_evaluation", "schreiben_plan_config"],
            plan_config: activePlanConfig,
            locked_features: lockedFeatures,
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

      // 8. Mock Exams Weekly Credits Check (POST/GET /learning/mock-exams/check or /learning/mock/check)
      if ((request.method === "POST" || request.method === "GET") && (url.pathname === "/learning/mock-exams/check" || url.pathname === "/learning/mock/check")) {
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
        const weeklyMockExams = (plan && typeof plan.weekly_mock_exams === "number") ? plan.weekly_mock_exams : 1;
        const dailyPracticeCredits = (plan && typeof plan.daily_practice_credits === "number") ? plan.daily_practice_credits : 10;
        const weeklySchreibenLimit = (plan && typeof plan.weekly_schreiben_limit === "number") ? plan.weekly_schreiben_limit : 0;

        // Initialize user record if missing
        if (!userRow) {
          const todayIsoDate = new Date().toISOString().split("T")[0];
          const nowIso = new Date().toISOString();
          const newUser = {
            uid,
            membership: membershipCode,
            current_level: "A1",
            format: "goethe",
            credits_remaining: dailyPracticeCredits,
            last_reset: todayIsoDate,
            schreiben_credits_remaining: weeklySchreibenLimit,
            schreiben_last_reset: nowIso,
            mock_exams_remaining: weeklyMockExams,
            mock_exams_last_reset: nowIso,
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
        let mockLastReset = userRow.mock_exams_last_reset ? String(userRow.mock_exams_last_reset) : "";
        let mockExamsRemaining = typeof userRow.mock_exams_remaining === "number"
          ? userRow.mock_exams_remaining
          : weeklyMockExams;

        let needsReset = false;
        if (!mockLastReset) {
          needsReset = true;
        } else {
          const lastResetWeekStart = getLocalCalendarWeekStart(mockLastReset, userTimezone);
          if (currentWeekStart > lastResetWeekStart) {
            needsReset = true;
          }
        }

        if (needsReset) {
          mockExamsRemaining = weeklyMockExams;
          mockLastReset = new Date().toISOString();

          await fetch(`${supabaseUrl}/rest/v1/learning_users?uid=eq.${encodeURIComponent(uid)}`, {
            method: "PATCH",
            headers: {
              "apikey": serviceRoleKey,
              "Authorization": `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              mock_exams_remaining: mockExamsRemaining,
              mock_exams_last_reset: mockLastReset,
              updated_at: new Date().toISOString(),
            }),
          });
        }

        return responseJSON(
          {
            success: true,
            uid,
            membership: membershipCode,
            mock_exams_remaining: mockExamsRemaining,
            weekly_mock_exams: weeklyMockExams,
            mock_exams_last_reset: mockLastReset,
            timezone: userTimezone,
          },
          200,
          request
        );
      }

      // 9. Atomic Mock Exam Credit Consumption (POST /learning/mock-exams/consume or /learning/mock/consume)
      if (request.method === "POST" && (url.pathname === "/learning/mock-exams/consume" || url.pathname === "/learning/mock/consume")) {
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
        const weeklyMockExams = (plan && typeof plan.weekly_mock_exams === "number") ? plan.weekly_mock_exams : 1;
        const dailyPracticeCredits = (plan && typeof plan.daily_practice_credits === "number") ? plan.daily_practice_credits : 10;
        const weeklySchreibenLimit = (plan && typeof plan.weekly_schreiben_limit === "number") ? plan.weekly_schreiben_limit : 0;

        // Initialize user record if missing
        if (!userRow) {
          const todayIsoDate = new Date().toISOString().split("T")[0];
          const nowIso = new Date().toISOString();
          const newUser = {
            uid,
            membership: membershipCode,
            current_level: "A1",
            format: "goethe",
            credits_remaining: dailyPracticeCredits,
            last_reset: todayIsoDate,
            schreiben_credits_remaining: weeklySchreibenLimit,
            schreiben_last_reset: nowIso,
            mock_exams_remaining: weeklyMockExams,
            mock_exams_last_reset: nowIso,
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
        let mockLastReset = userRow.mock_exams_last_reset ? String(userRow.mock_exams_last_reset) : "";
        let mockExamsRemaining = typeof userRow.mock_exams_remaining === "number"
          ? userRow.mock_exams_remaining
          : weeklyMockExams;

        let needsReset = false;
        if (!mockLastReset) {
          needsReset = true;
        } else {
          const lastResetWeekStart = getLocalCalendarWeekStart(mockLastReset, userTimezone);
          if (currentWeekStart > lastResetWeekStart) {
            needsReset = true;
          }
        }

        // If new week has started, reset allowance before checking balance
        if (needsReset) {
          mockExamsRemaining = weeklyMockExams;
          mockLastReset = new Date().toISOString();

          await fetch(`${supabaseUrl}/rest/v1/learning_users?uid=eq.${encodeURIComponent(uid)}`, {
            method: "PATCH",
            headers: {
              "apikey": serviceRoleKey,
              "Authorization": `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              mock_exams_remaining: mockExamsRemaining,
              mock_exams_last_reset: mockLastReset,
              updated_at: new Date().toISOString(),
            }),
          });
        }

        // 4. Verify user has at least 1 mock exam credit remaining
        if (mockExamsRemaining <= 0) {
          return responseJSON(
            {
              success: false,
              error: "insufficient_mock_credits",
              message: "You have used all your weekly mock exams. Upgrade your plan or wait until next week for your quota to reset.",
              mock_exams_remaining: 0,
              weekly_mock_exams: weeklyMockExams,
              membership: membershipCode,
            },
            200,
            request
          );
        }

        // 5. ATOMIC conditional decrement on mock_exams_remaining
        const newCredits = mockExamsRemaining - 1;
        const deductRes = await fetch(
          `${supabaseUrl}/rest/v1/learning_users?uid=eq.${encodeURIComponent(uid)}&mock_exams_remaining=gt.0`,
          {
            method: "PATCH",
            headers: {
              "apikey": serviceRoleKey,
              "Authorization": `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
              "Prefer": "return=representation",
            },
            body: JSON.stringify({
              mock_exams_remaining: newCredits,
              updated_at: new Date().toISOString(),
            }),
          }
        );

        if (!deductRes.ok) {
          const errText = await deductRes.text();
          return responseJSON({ error: `Supabase mock credit update error (${deductRes.status}): ${errText}` }, deductRes.status, request);
        }

        const deductData = await deductRes.json();
        if (!deductData || deductData.length === 0) {
          // Concurrency: already consumed by another request
          return responseJSON(
            {
              success: false,
              error: "insufficient_mock_credits",
              message: "You have used all your weekly mock exams. Upgrade your plan or wait until next week for your quota to reset.",
              mock_exams_remaining: 0,
              weekly_mock_exams: weeklyMockExams,
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
            mock_exams_remaining: updatedUser.mock_exams_remaining,
            weekly_mock_exams: weeklyMockExams,
            membership: updatedUser.membership || membershipCode,
            uid,
          },
          200,
          request
        );
      }

      // 10. Upload File (POST /upload)
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

      // ============================================================================
      // REFERRAL SYSTEM ENDPOINTS
      // ============================================================================

      // 1. Referral Dashboard (GET/POST /referral/dashboard)
      if ((request.method === "GET" || request.method === "POST") && url.pathname === "/referral/dashboard") {
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
        const email = tokenPayload.email || "";

        // 1. Ensure referralCode exists
        const { referralCode } = await getOrCreateReferralCode(uid, email, env, idToken);

        // 2. Get wallet
        const wallet = await getOrCreateReferralWallet(uid, env, idToken);

        // 3. Count total referrals where referrerUid == uid
        const referralsList = await queryFirestore("referrals", "referrerUid", "EQUAL", uid, env, idToken).catch(() => []);
        const totalReferrals = referralsList.length;

        // 4. Count successful referred purchases from wallet transactions
        const transactions = Array.isArray(wallet.transactions) ? wallet.transactions : [];
        const successfulPurchases = transactions.filter((tx) => tx && tx.type === "referral_reward").length;

        // Dynamic referral link using incoming origin or request origin pointing to normal login page
        const reqOrigin = (request.headers.get("Origin") || url.origin || "https://www.cocogermany.site").replace(/\/$/, "");
        const referralLink = `${reqOrigin}/index.html#/login?ref=${referralCode}`;

        return responseJSON(
          {
            success: true,
            referralCode,
            referralLink,
            stats: {
              totalReferrals,
              successfulPurchases,
              coinBalance: wallet.coinBalance || 0,
              totalEarned: wallet.totalEarned || 0,
              totalSpent: wallet.totalSpent || 0,
            },
            transactions,
          },
          200,
          request
        );
      }

      // 2. Referral Attribution (POST /referral/attribute)
      if (request.method === "POST" && url.pathname === "/referral/attribute") {
        const authHeader = request.headers.get("Authorization") || "";
        const idToken = authHeader.replace(/^Bearer\s+/i, "").trim();

        if (!idToken) {
          return responseJSON({ error: "Unauthorized: Missing Authorization Bearer token." }, 401, request);
        }

        const tokenPayload = await verifyFirebaseToken(idToken, env);
        if (!tokenPayload || !tokenPayload.sub) {
          console.error("[Worker/referral/attribute] Token verification failed.");
          return responseJSON({ error: "Unauthorized: Invalid or unverified Firebase ID token signature." }, 401, request);
        }

        const referredUid = tokenPayload.sub;
        const body = await request.json().catch(() => ({}));
        const rawCode = String(body.referralCode || body.ref || "").trim().toUpperCase();

        console.log(`[Worker/referral/attribute] referredUid=${referredUid} code=${rawCode}`);

        if (!rawCode) {
          return responseJSON({ error: "Bad Request: referralCode is required." }, 400, request);
        }

        // 1. Fetch current profile of the referred user
        let userProfile = await getFirestoreDoc("userProfiles", referredUid, env, idToken).catch(() => null);
        console.log(`[Worker/referral/attribute] userProfile exists=${!!userProfile} referredBy=${userProfile?.referredBy || "none"}`);

        // 2. Prevent overwriting existing referral attribution
        if (userProfile && userProfile.referredBy) {
          console.log(`[Worker/referral/attribute] Already attributed to ${userProfile.referredBy}, returning alreadyReferred.`);
          return responseJSON({
            success: false,
            alreadyReferred: true,
            message: "User already has an existing referral attribution.",
            referrerUid: userProfile.referredBy,
          }, 200, request);
        }

        // 3. Find referrer by referralCode (query is exact-match, uppercase stored codes)
        const referrerResults = await queryFirestore("userProfiles", "referralCode", "EQUAL", rawCode, env, idToken).catch(() => []);
        console.log(`[Worker/referral/attribute] Referrer query results count=${referrerResults?.length || 0} for code=${rawCode}`);

        if (!referrerResults || referrerResults.length === 0) {
          console.warn(`[Worker/referral/attribute] No referrer found for code: ${rawCode}`);
          return responseJSON({ error: "Invalid referral code: No matching referrer found.", code: rawCode }, 404, request);
        }

        const referrer = referrerResults[0];
        const referrerUid = referrer.uid || referrer.id;

        console.log(`[Worker/referral/attribute] Found referrer: uid=${referrerUid}`);

        // 4. Prevent self-referral
        if (referrerUid === referredUid) {
          console.warn(`[Worker/referral/attribute] Self-referral blocked: uid=${referredUid}`);
          return responseJSON({ error: "Self-referrals are not permitted." }, 400, request);
        }

        // 5. Update userProfiles with referredBy
        const nowIso = new Date().toISOString();
        const effectiveCountry = (userProfile?.country || body.country || "").trim();
        const effectiveCurrency = (userProfile?.currency || body.currency || "INR").trim();

        await setFirestoreDoc(
          "userProfiles",
          referredUid,
          {
            referredBy: referrerUid,
            updatedAt: nowIso,
          },
          env,
          idToken,
          true
        );

        // 6. Create relationship document in referrals/{referralId}
        const referralId = `${referrerUid}_${referredUid}`;
        await setFirestoreDoc(
          "referrals",
          referralId,
          {
            referrerUid,
            referredUid,
            referralCode: rawCode,
            country: effectiveCountry,
            currency: effectiveCurrency,
            createdAt: nowIso,
          },
          env,
          idToken,
          true
        );

        console.log(`[Worker/referral/attribute] SUCCESS: referralId=${referralId} referrerUid=${referrerUid} referredUid=${referredUid}`);

        return responseJSON(
          {
            success: true,
            message: "Referral attribution attached successfully.",
            referrerUid,
          },
          200,
          request
        );
      }

      // 3. Referral Order Reward & Reversal Processing (POST /referral/process-order)
      if (request.method === "POST" && url.pathname === "/referral/process-order") {
        const authHeader = request.headers.get("Authorization") || "";
        const idToken = authHeader.replace(/^Bearer\s+/i, "").trim();

        if (!idToken) {
          return responseJSON({ error: "Unauthorized: Missing Authorization Bearer token." }, 401, request);
        }

        const tokenPayload = await verifyFirebaseToken(idToken, env);
        if (!tokenPayload) {
          return responseJSON({ error: "Unauthorized: Invalid or unverified Firebase ID token." }, 401, request);
        }

        const body = await request.json().catch(() => ({}));
        const orderId = String(body.orderId || "").trim();

        if (!orderId) {
          return responseJSON({ error: "Bad Request: Missing required orderId." }, 400, request);
        }

        // 1. Fetch order from Firestore (trusted source)
        const order = await getFirestoreDoc("orders", orderId, env, idToken).catch(() => null);
        if (!order) {
          return responseJSON({ error: `Order '${orderId}' not found.` }, 404, request);
        }

        const status = String(body.status || order.status || "Pending").trim();
        const purchaserUid = order.userId;

        if (!purchaserUid) {
          return responseJSON({ success: false, message: "Order does not have an attached customer userId." }, 200, request);
        }

        // 2. Fetch purchaser profile
        const purchaserProfile = await getFirestoreDoc("userProfiles", purchaserUid, env, idToken).catch(() => null);
        if (!purchaserProfile || !purchaserProfile.referredBy) {
          return responseJSON({
            success: true,
            rewardAwarded: false,
            message: "Purchaser does not have a referrer attribution.",
          }, 200, request);
        }

        const referrerUid = purchaserProfile.referredBy;
        if (referrerUid === purchaserUid) {
          return responseJSON({ success: false, message: "Self-referral ignored." }, 200, request);
        }

        // 3. Fetch referrer wallet
        const wallet = await getOrCreateReferralWallet(referrerUid, env, idToken);
        const transactions = Array.isArray(wallet.transactions) ? wallet.transactions : [];

        // 4. Handle Status Transitions
        const isCompleted = ["Paid", "Completed"].some((s) => s.toLowerCase() === status.toLowerCase());
        const isCancelled = ["Cancelled", "Refunded"].some((s) => s.toLowerCase() === status.toLowerCase());

        if (isCompleted) {
          // Idempotency: check if this order already has a referral reward
          const alreadyRewarded = transactions.some((tx) => tx && tx.orderId === orderId && tx.type === "referral_reward");
          if (alreadyRewarded) {
            return responseJSON({
              success: true,
              alreadyRewarded: true,
              message: `Order ${orderId} referral reward has already been processed.`,
            }, 200, request);
          }

          // Calculate reward — use per-user referralCommission if set, else global env fallback, else 10%
          const referrerProfile = await getFirestoreDoc("userProfiles", referrerUid, env, idToken).catch(() => null);
          const perUserCommission = referrerProfile?.referralCommission;
          const commissionPercent = (perUserCommission != null && !isNaN(Number(perUserCommission)))
            ? Number(perUserCommission)
            : Number(env.REFERRAL_COMMISSION_PERCENT || 10);
          console.log(`[Worker/referral/process-order] referrerUid=${referrerUid} commissionPercent=${commissionPercent} (source=${perUserCommission != null ? "user-profile" : "env-default"})`);
          const { amount, currency } = parsePurchasePrice(order.price || order.amount || 0);
          const coins = calculateReferralCoins(amount, currency, commissionPercent);

          const newTransaction = {
            id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            type: "referral_reward",
            coins,
            orderId,
            purchaseAmount: amount,
            purchaseCurrency: currency,
            percentage: commissionPercent,
            description: "Referral purchase",
            createdAt: new Date().toISOString(),
          };

          const newBalance = (wallet.coinBalance || 0) + coins;
          const newEarned = (wallet.totalEarned || 0) + coins;
          const updatedTransactions = [newTransaction, ...transactions];

          await setFirestoreDoc(
            "referralWallets",
            referrerUid,
            {
              coinBalance: newBalance,
              totalEarned: newEarned,
              totalSpent: wallet.totalSpent || 0,
              transactions: updatedTransactions,
              updatedAt: new Date().toISOString(),
            },
            env,
            idToken,
            true
          );

          return responseJSON(
            {
              success: true,
              rewardAwarded: true,
              coins,
              orderId,
              referrerUid,
              newBalance,
            },
            200,
            request
          );
        } else if (isCancelled) {
          // Check if previously rewarded
          const origReward = transactions.find((tx) => tx && tx.orderId === orderId && tx.type === "referral_reward");
          const alreadyReversed = transactions.some((tx) => tx && tx.orderId === orderId && tx.type === "reversal");

          if (!origReward || alreadyReversed) {
            return responseJSON({
              success: true,
              reversalNeeded: false,
              message: "No referral reward to reverse or already reversed.",
            }, 200, request);
          }

          const reverseCoins = origReward.coins || 0;
          const reversalTransaction = {
            id: `tx_rev_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            type: "reversal",
            coins: -reverseCoins,
            orderId,
            purchaseAmount: origReward.purchaseAmount,
            purchaseCurrency: origReward.purchaseCurrency,
            percentage: origReward.percentage,
            description: "Reversal for cancelled order",
            createdAt: new Date().toISOString(),
          };

          const newBalance = Math.max(0, (wallet.coinBalance || 0) - reverseCoins);
          const updatedTransactions = [reversalTransaction, ...transactions];

          await setFirestoreDoc(
            "referralWallets",
            referrerUid,
            {
              coinBalance: newBalance,
              transactions: updatedTransactions,
              updatedAt: new Date().toISOString(),
            },
            env,
            idToken,
            true
          );

          return responseJSON(
            {
              success: true,
              reversed: true,
              coinsDeducted: reverseCoins,
              newBalance,
            },
            200,
            request
          );
        }

        return responseJSON({
          success: true,
          status,
          message: "No action required for this order status.",
        }, 200, request);
      }

      // 4. Referral Wallet (GET /referral/wallet)
      if (request.method === "GET" && url.pathname === "/referral/wallet") {
        const authHeader = request.headers.get("Authorization") || "";
        const idToken = authHeader.replace(/^Bearer\s+/i, "").trim();

        if (!idToken) {
          return responseJSON({ error: "Unauthorized: Missing Authorization Bearer token." }, 401, request);
        }

        const tokenPayload = await verifyFirebaseToken(idToken, env);
        if (!tokenPayload || !tokenPayload.sub) {
          return responseJSON({ error: "Unauthorized: Invalid or unverified Firebase ID token." }, 401, request);
        }

        const uid = tokenPayload.sub;
        const wallet = await getOrCreateReferralWallet(uid, env, idToken);

        return responseJSON(
          {
            success: true,
            wallet,
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
