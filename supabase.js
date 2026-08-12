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

let supabaseClient = null;

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
    let query = supabase.from("materials").select("*").order("created_at", { ascending: false });

    if (options.activeOnly !== false) {
      query = query.eq("active", true);
    }
    if (options.exam) query = query.eq("exam", options.exam);
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
    const { data, error } = await supabase.from("materials").select("*").eq("id", id).maybeSingle();
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
  const workerBase = (localStorage.getItem("r2_worker_url") || "https://cocogermany-r2-worker.cocogermany-ytd.workers.dev").replace(/\/$/, "");
  const endpoint = `${workerBase}/admin/material`;

  const payload = {
    id: String(material.id).trim(),
    title: String(material.title || "").trim(),
    exam: String(material.exam || "Goethe").trim(),
    level: String(material.level || "A1").trim(),
    module: String(material.module || "Lesen").trim(),
    material_number: parseInt(material.materialNumber || material.material_number || "1", 10),
    content_path: String(material.contentPath || material.content_path || `${material.level}/${material.id}.json`).trim(),
    difficulty: String(material.difficulty || "Medium").trim(),
    estimated_time: typeof material.estimatedTime === "number" ? material.estimatedTime : parseInt(material.estimatedTime || material.estimated_time || "15", 10) || 15,
    active: material.active !== undefined ? Boolean(material.active) : true,
  };

  const headers = {
    "Content-Type": "application/json",
  };
  if (idToken) {
    headers["Authorization"] = `Bearer ${idToken}`;
    try {
      const tokenParts = idToken.split(".");
      if (tokenParts.length === 3) {
        const decodedPayload = JSON.parse(atob(tokenParts[1].replace(/-/g, "+").replace(/_/g, "/")));
        console.log("[Firebase ID Token Client Debug]", {
          iss: decodedPayload.iss,
          aud: decodedPayload.aud,
          email: decodedPayload.email,
        });
      }
    } catch (e) {
      console.warn("Client ID Token payload parse warning:", e);
    }
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
    material_id: attemptData.materialId || attemptData.material_id,
    score: parseInt(attemptData.score || 0, 10),
    percentage: parseInt(attemptData.percentage || 0, 10),
    duration_seconds: parseInt(attemptData.durationSeconds || attemptData.duration_seconds || 0, 10),
    answers: attemptData.answers || {},
    created_at: new Date().toISOString(),
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
// 3. MEMBERSHIP & CREDITS SERVICE (PREPARED STRUCTURE)
// ===================================================

/**
 * Fetch or initialize Learning User record in Supabase users table
 */
async function getOrCreateLearningUserSupabase(uid) {
  const supabase = await getSupabaseClient();
  if (!supabase || !uid) return null;

  try {
    const { data: existing, error: fetchErr } = await supabase.from("users").select("*").eq("uid", uid).maybeSingle();
    if (fetchErr) throw fetchErr;

    if (existing) return existing;

    const newUser = {
      uid,
      plan_code: "free",
      credits_remaining: 10,
      last_credit_reset: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: created, error: insertErr } = await supabase.from("users").insert([newUser]).select();
    if (insertErr) throw insertErr;
    return created ? created[0] : newUser;
  } catch (err) {
    console.error("Supabase getOrCreateLearningUser error:", err);
    return null;
  }
}

/**
 * Upsert learning user record into public.learning_users table in Supabase
 */
async function ensureLearningUserSupabase(uid) {
  if (!uid) return null;
  const supabase = await getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("learning_users")
      .upsert({ uid }, { onConflict: "uid" })
      .select();

    if (error) throw error;
    return data ? data[0] : null;
  } catch (err) {
    console.error(`Supabase ensureLearningUser error (${uid}):`, err);
    return null;
  }
}

/**
 * Fetch Plan Details from Supabase plans table
 */
async function getPlanDetailsSupabase(planCode = "free") {
  const supabase = await getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.from("plans").select("*").eq("code", planCode).maybeSingle();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("Supabase getPlanDetails error:", err);
    return null;
  }
}

/**
 * Submit Learning Onboarding preferences ({ level, format }) to Cloudflare Worker POST /learning/onboarding
 */
async function submitLearningOnboardingSupabase({ level, format }, idToken) {
  const workerBase = (localStorage.getItem("r2_worker_url") || "https://cocogermany-r2-worker.cocogermany-ytd.workers.dev").replace(/\/$/, "");
  const endpoint = `${workerBase}/learning/onboarding`;

  const headers = {
    "Content-Type": "application/json",
  };
  if (idToken) {
    headers["Authorization"] = `Bearer ${idToken}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ level, format }),
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
};

if (typeof window !== "undefined") {
  window.SupabaseService = SupabaseService;
}


