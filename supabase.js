/**
 * Coco Germany - Supabase Service Layer
 * supabase.js
 * 
 * Enforces clean separation of concerns:
 * - Firebase handles Authentication & Website CMS (Products, Videos, Orders).
 * - Supabase handles Learning Data (Materials metadata, Mock Exam attempts, Learning Users, Plans, Analytics).
 * - Cloudflare Worker handles secure R2 JSON/Audio/Image asset delivery.
 */

const DEFAULT_SUPABASE_URL = "https://ejpxjizncocktzduyqdb.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqcHhqaXpuY29ja3R6ZHV5cWRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwOTMyNDIsImV4cCI6MjEwMTY2OTI0Mn0.NaaCUM1Yxh3UhFuOZSvDc-CQtLQLWWg_vxMjH1GNOx8";
const DEFAULT_WORKER_URL = "https://cocogermany-r2-worker.cocogermany-ytd.workers.dev";
const LEGACY_WORKER_URL = "https://cocogermany-r2-worker.workers.dev";

let supabaseClient = null;

/**
 * Return the one production Worker URL used by the website and practice app.
 * Older sessions can retain an obsolete workers.dev hostname in localStorage;
 * discard only that known-invalid value so it cannot block profile loading.
 */
function getWorkerBaseUrl() {
  const savedUrl = (localStorage.getItem("r2_worker_url") || "").trim().replace(/\/$/, "");
  if (!savedUrl || savedUrl === LEGACY_WORKER_URL) {
    if (savedUrl === LEGACY_WORKER_URL) localStorage.removeItem("r2_worker_url");
    return DEFAULT_WORKER_URL;
  }
  return savedUrl;
}

/**
 * Get or initialize Supabase client instance
 */
async function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const url = (localStorage.getItem("supabase_url") || DEFAULT_SUPABASE_URL).trim();
  const anonKey = (localStorage.getItem("supabase_anon_key") || DEFAULT_SUPABASE_ANON_KEY).trim();

  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    supabaseClient = createClient(url, anonKey);
    return supabaseClient;
  } catch (error) {
    console.error("Failed to load Supabase SDK from CDN:", error);
    return null;
  }
}

// ===================================================
// 1. MATERIALS METADATA SERVICE
// ===================================================

/**
 * Fetch materials metadata list from Supabase
 */
async function fetchMaterialsSupabase(options = {}) {
  const supabase = await getSupabaseClient();
  if (!supabase) return [];

  try {
    let query = supabase
      .from("materials")
      .select("id, title, description, exam, level, module, material_number, content_path, difficulty, duration_minutes, active")
      .order("material_number", { ascending: true });

    if (options.activeOnly !== false) {
      query = query.eq("active", true);
    }
    if (options.exam) query = query.in("exam", [options.exam.toLowerCase(), "both"]);
    if (options.level) query = query.eq("level", options.level);
    if (options.module) query = query.eq("module", options.module);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("Supabase fetchMaterials error:", err);
    return [];
  }
}

/**
 * Fetch single material metadata by ID
 */
async function fetchMaterialByIdSupabase(id) {
  const supabase = await getSupabaseClient();
  if (!supabase || !id) return null;

  try {
    const { data, error } = await supabase
      .from("materials")
      .select("id, title, description, exam, level, module, material_number, content_path, difficulty, duration_minutes, active")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error(`Supabase fetchMaterialById error (${id}):`, err);
    return null;
  }
}

/**
 * Upsert material metadata record to Supabase
 */
async function saveMaterialMetadataSupabase(material, idToken) {
  const workerBase = getWorkerBaseUrl();
  const endpoint = `${workerBase}/admin/material`;

  const durationMin = material.duration_minutes !== undefined && material.duration_minutes !== null && material.duration_minutes !== ""
    ? parseInt(material.duration_minutes || material.durationMinutes, 10)
    : (material.durationMinutes !== undefined && material.durationMinutes !== null && material.durationMinutes !== "" ? parseInt(material.durationMinutes, 10) : null);

  const payload = {
    id: String(material.id).trim(),
    title: String(material.title || "").trim(),
    description: material.description !== undefined && material.description !== null ? String(material.description).trim() : null,
    exam: String(material.exam || "goethe").trim(),
    level: String(material.level || "A1").trim(),
    module: String(material.module || "Lesen").trim(),
    material_number: parseInt(material.materialNumber || material.material_number || "1", 10),
    content_path: String(material.contentPath || material.content_path || `${material.level}/${material.id}.json`).trim(),
    difficulty: String(material.difficulty || "Medium").trim(),
    duration_minutes: durationMin && !isNaN(durationMin) && durationMin > 0 ? durationMin : null,
    active: material.active !== undefined ? Boolean(material.active) : true,
  };

  const headers = {
    "Content-Type": "application/json",
  };
  if (idToken) {
    headers["Authorization"] = `Bearer ${idToken}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const resData = await response.json();
  if (!response.ok || resData.error) {
    throw new Error(resData.error || `Worker API returned HTTP ${response.status}`);
  }

  return resData;
}

/**
 * Delete material metadata record from Supabase
 */
async function deleteMaterialMetadataSupabase(id) {
  const supabase = await getSupabaseClient();
  if (!supabase || !id) throw new Error("Supabase client not initialized or missing ID.");

  const { error } = await supabase.from("materials").delete().eq("id", id);
  if (error) throw error;
  return true;
}

// ===================================================
// 2. MOCK EXAM ATTEMPTS SERVICE
// ===================================================

/**
 * Save Mock Exam attempt result into Supabase mock_attempts table
 */
async function saveMockAttemptSupabase(attemptData) {
  const supabase = await getSupabaseClient();
  if (!supabase) {
    console.warn("Supabase client unavailable. Skipping mock attempt save.");
    return null;
  }

  const payload = {
    uid: attemptData.uid || "anonymous",
    level: attemptData.level || "A1",
    format: attemptData.format || attemptData.exam || "goethe",
    score_percent: parseInt(attemptData.score_percent || attemptData.percentage || attemptData.score || 0, 10),
    completed_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase.from("mock_attempts").insert([payload]).select();
    if (error) throw error;
    return data ? data[0] : payload;
  } catch (err) {
    console.error("Supabase saveMockAttempt error:", err);
    return null;
  }
}

// ===================================================
// 3. MEMBERSHIP & CREDITS SERVICE
// ===================================================

/**
 * Fetch a Learning User record. User creation and credit initialization are
 * intentionally handled only by the authenticated Worker endpoint.
 */
async function getOrCreateLearningUserSupabase(uid) {
  const supabase = await getSupabaseClient();
  if (!supabase || !uid) return null;

  try {
    const { data: existing, error: fetchErr } = await supabase.from("learning_users").select("*").eq("uid", uid).maybeSingle();
    if (fetchErr) throw fetchErr;

    if (existing) return existing;

    console.warn("Learning user does not exist. Use the authenticated credit Worker to create it.");
    return null;
  } catch (err) {
    console.error("Supabase getOrCreateLearningUser error:", err);
    return null;
  }
}

/**
 * Deprecated client-side user creation entry point. The authenticated Worker
 * owns learning_users creation so its plan allowance is always authoritative.
 */
async function ensureLearningUserSupabase(uid) {
  if (uid) console.warn("ensureLearningUser is deprecated. Use the authenticated credit Worker instead.");
  return null;
}

/**
 * Fetch Plan Details from Supabase plans table
 */
async function getPlanDetailsSupabase(planCode = "FREE") {
  const supabase = await getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.from("plans").select("*").eq("code", planCode.toUpperCase()).maybeSingle();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("Supabase getPlanDetails error:", err);
    return null;
  }
}

/**
 * Submit Learning Onboarding preferences ({ level, format, timezone }) to Cloudflare Worker POST /learning/onboarding
 */
async function submitLearningOnboardingSupabase({ level, format, timezone }, idToken) {
  const workerBase = getWorkerBaseUrl();
  const endpoint = `${workerBase}/learning/onboarding`;

  const tz = timezone || (typeof Intl !== "undefined" && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC");

  const headers = {
    "Content-Type": "application/json",
  };
  if (idToken) {
    headers["Authorization"] = `Bearer ${idToken}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ level, format, timezone: tz }),
  });

  const resData = await response.json();
  if (!response.ok || resData.error) {
    throw new Error(resData.error || `Worker returned HTTP ${response.status}`);
  }

  return resData;
}

/**
 * Perform Learning Credits Check via Cloudflare Worker POST /learning/credits/check
 */
async function checkLearningCreditsSupabase(idToken) {
  const workerBase = getWorkerBaseUrl();
  const endpoint = `${workerBase}/learning/credits/check`;

  const headers = {
    "Content-Type": "application/json",
  };
  if (idToken) {
    headers["Authorization"] = `Bearer ${idToken}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });

  const resData = await response.json();
  if (!response.ok || resData.error) {
    throw new Error(resData.error || `Worker returned HTTP ${response.status}`);
  }

  return resData;
}

// ===================================================
// GLOBAL EXPORT FOR NON-MODULE SCRIPTS
// ===================================================
const SupabaseService = {
  getSupabaseClient,
  fetchMaterials: fetchMaterialsSupabase,
  fetchMaterialById: fetchMaterialByIdSupabase,
  saveMaterialMetadata: saveMaterialMetadataSupabase,
  deleteMaterialMetadata: deleteMaterialMetadataSupabase,
  saveMockAttempt: saveMockAttemptSupabase,
  getOrCreateLearningUser: getOrCreateLearningUserSupabase,
  ensureLearningUser: ensureLearningUserSupabase,
  getPlanDetails: getPlanDetailsSupabase,
  submitLearningOnboarding: submitLearningOnboardingSupabase,
  checkLearningCredits: checkLearningCreditsSupabase,
  getWorkerBaseUrl,
};

if (typeof window !== "undefined") {
  window.SupabaseService = SupabaseService;
}
