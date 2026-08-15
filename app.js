const firebaseConfig = {
  apiKey: "AIzaSyCAmxLSnUWMuhuuH8oFshZMTajeP2iXvpY",
  authDomain: "cocogermany-ba33f.firebaseapp.com",
  projectId: "cocogermany-ba33f",
  storageBucket: "cocogermany-ba33f.firebasestorage.app",
  messagingSenderId: "689122181603",
  appId: "1:689122181603:web:a8bd80e2c187695ac8a0d6",
};

const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
const adminEmail = "cocogermany.ytd@gmail.com";
const fallbackProductImage = "public/images/hero-study.jpg";
let firebaseTools = null;
let currentUser = null;
let products = [];
let videos = [];
let orders = [];
let analyticsRecords = [];
let examMaterials = [];
let currentUserProfile = null;
let homeSectionObserver = null;
let pendingHomeSection = "";
let R2_WORKER_URL = "https://cocogermany-r2-worker.cocogermany-ytd.workers.dev";

async function getFirebaseTools() {
  if (!firebaseReady) return null;
  if (firebaseTools) return firebaseTools;

  const appModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
  const authModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
  const firestoreModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");

  const app = appModule.initializeApp(firebaseConfig);
  firebaseTools = {
    auth: authModule.getAuth(app),
    db: firestoreModule.getFirestore(app),
    authModule,
    firestoreModule,
  };

  return firebaseTools;
}

const starterProducts = [
  {
    id: "a1-foundations",
    title: "A1 Foundations",
    level: "A1",
    format: "Digital PDF",
    price: "₹1,599",
    prices: { INR: 1599, USD: 19, EUR: 18, GBP: 15, CAD: 25, AUD: 29 },
    productType: "paid",
    downloadUrl: "",
    image: "public/images/a1-foundations.png",
    summary: "A carefully sequenced workbook for learners beginning serious German study.",
    sku: "CG-A1-01",
    pages: "84 pages",
    audience: "New learners",
    includes: "Exercises, notes, revision pages",
    description:
      "A structured A1 foundation resource with concise grammar explanations, guided writing practice, and cultural notes for everyday communication.",
    benefits: [
      "Clear progression from sounds and sentence structure to everyday dialogue.",
      "Practice pages for independent study and classroom revision.",
      "Cultural notes that connect language patterns to real German life.",
    ],
    delivery: "PDF delivery by email after manual payment verification.",
    previewImages: ["public/images/a1-foundations.png", "public/images/hero-study.jpg"],
  },
  {
    id: "b1-exam-companion",
    title: "B1 Exam Companion",
    level: "B1",
    format: "Printed",
    price: "₹2,799",
    prices: { INR: 2799, USD: 34, EUR: 31, GBP: 27, CAD: 46, AUD: 52 },
    productType: "paid",
    downloadUrl: "",
    image: "public/images/b1-companion.png",
    summary: "A premium exam preparation guide with writing frames and speaking prompts.",
    sku: "CG-B1-01",
    pages: "116 pages",
    audience: "B1 exam learners",
    includes: "Writing frames, speaking prompts, revision plan",
    description:
      "A practical B1 companion for learners preparing for certification, with model structures, exam rhythms, and calm revision planning.",
    benefits: [
      "Writing and speaking templates for exam preparation.",
      "Realistic revision guidance without pressure tactics.",
      "Printed format for annotation, review, and classroom use.",
    ],
    delivery: "Printed orders are shipped by courier after manual payment verification.",
    previewImages: ["public/images/b1-companion.png", "public/images/hero-study.jpg"],
  },
];
products = [...starterProducts];

const starterVideos = [
  {
    id: "a1-pronunciation-intro",
    title: "Module 1 - Chapter 1: Pronunciation",
    category: "A1",
    embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    description: "A short A1 pronunciation warmup for new German learners.",
    imageLinks: ["public/images/a1-foundations.png", "public/images/hero-study.jpg"],
    publishedDate: "2026-03-18",
  },
  {
    id: "b1-speaking-frames",
    title: "Module 2 - Chapter 3: Speaking Frames",
    category: "B1",
    embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    description: "B1 exam speaking prompts with calmer response structure.",
    imageLinks: ["public/images/b1-companion.png", "public/images/hero-study.jpg"],
    publishedDate: "2026-04-02",
  },
];
videos = [...starterVideos];

const app = document.querySelector("#app");
const levels = ["A1", "A2", "B1", "B2"];
const orderStatuses = ["Pending", "Payment Requested", "Paid", "Processing", "Shipped", "Completed", "Cancelled"];

const countryOptions = [
  "India",
  "Australia",
  "United Kingdom",
  "Canada",
  "United States",
  "Germany",
  "Austria",
  "France",
  "Italy",
  "Spain",
  "Netherlands",
  "Czech Republic",
  "Denmark",
  "Hong Kong",
  "Hungary",
  "Israel",
  "Japan",
  "Mexico",
  "Taiwan",
  "New Zealand",
  "Norway",
  "Philippines",
  "Poland",
  "Russia",
  "Singapore",
  "Sweden",
  "Switzerland",
  "Thailand",
  "Other",
];

const currencyOptions = [
  ["INR", "INR (Indian Rupee)"],
  ["AUD", "Australian Dollar (AUD)"],
  ["GBP", "British Pound (GBP)"],
  ["CAD", "Canadian Dollar (CAD)"],
  ["CZK", "Czech Koruna (CZK)"],
  ["DKK", "Danish Krone (DKK)"],
  ["EUR", "Euro (EUR)"],
  ["HKD", "Hong Kong Dollar (HKD)"],
  ["HUF", "Hungarian Forint (HUF)"],
  ["ILS", "Israeli New Shekel (ILS)"],
  ["JPY", "Japanese Yen (JPY)"],
  ["MXN", "Mexican Peso (MXN)"],
  ["TWD", "New Taiwan Dollar (TWD)"],
  ["NZD", "New Zealand Dollar (NZD)"],
  ["NOK", "Norwegian Krone (NOK)"],
  ["PHP", "Philippine Peso (PHP)"],
  ["PLN", "Polish Zloty (PLN)"],
  ["RUB", "Russian Rouble (RUB)"],
  ["SGD", "Singapore Dollar (SGD)"],
  ["SEK", "Swedish Krona (SEK)"],
  ["CHF", "Swiss Franc (CHF)"],
  ["THB", "Thai Baht (THB)"],
  ["USD", "USD (US Dollar)"],
  ["Other", "Other"],
];

const examFormatOptions = [
  ["goethe", "Goethe"],
  ["telc", "TELC"],
];

const germanLevelOptions = ["A1", "A2", "B1", "B2"];

function icon(name) {
  return `<i data-lucide="${name}" aria-hidden="true"></i>`;
}

function renderIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function html(strings, ...values) {
  return strings.reduce((result, string, index) => result + string + (values[index] ?? ""), "");
}

function isAdmin() {
  return currentUser && currentUser.email === adminEmail;
}

function friendlyError(error) {
  const code = error && error.code ? error.code : "";

  if (code.includes("auth/invalid-credential") || code.includes("auth/wrong-password")) {
    return "The email or password is incorrect.";
  }
  if (code.includes("auth/user-not-found")) {
    return "No account was found with this email.";
  }
  if (code.includes("auth/email-already-in-use")) {
    return "An account already exists with this email. Please login instead.";
  }
  if (code.includes("auth/weak-password")) {
    return "Please use a stronger password with at least 6 characters.";
  }
  if (code.includes("auth/popup-closed-by-user")) {
    return "Google login was closed before it finished.";
  }
  if (code.includes("auth/too-many-requests")) {
    return "Too many attempts. Please wait a little and try again.";
  }
  if (code.includes("permission-denied")) {
    return "You do not have permission to do this. Please check Firebase rules or login with the admin account.";
  }
  if (code.includes("unavailable")) {
    return "Firebase is temporarily unavailable. Please try again shortly.";
  }

  return "Something went wrong. Please try again.";
}

function redirectAfterLogin() {
  const destination = localStorage.getItem("loginRedirect") || "#/account";
  localStorage.removeItem("loginRedirect");
  if (destination.includes("practice") || destination.startsWith("http")) {
    window.location.href = destination;
    return;
  }
  location.hash = profileIsComplete() ? destination.replace("#", "") : "/profile-setup";
}

function cleanWhatsappNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeCdnImageUrl(value) {
  const url = String(value || "").trim();

  if (url.startsWith("https://github.com/") && url.includes("/blob/")) {
    const withoutHost = url.replace("https://github.com/", "");
    const [owner, repo, ...rest] = withoutHost.split("/");
    const blobIndex = rest.indexOf("blob");

    if (owner && repo && blobIndex >= 0 && rest[blobIndex + 1]) {
      const branch = rest[blobIndex + 1];
      const filePath = rest.slice(blobIndex + 2).join("/");
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
    }
  }

  return url;
}

function isProductImageLink(value) {
  return /^https:\/\/(raw\.githubusercontent\.com|github\.com|cdn\.jsdelivr\.net\/gh)\//i.test(String(value || ""));
}


function parseImageLinks(value) {
  const list = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[\n,]+/)
        .map((item) => item.trim());

  return [...new Set(list.map(normalizeCdnImageUrl).filter(Boolean))];
}

function productImages(resource) {
  const images = parseImageLinks(resource.previewImages || resource.imageLinks || resource.images);
  const cover = normalizeCdnImageUrl(resource.image || resource.imageUrl || "");
  const fullList = parseImageLinks([...images, cover]);
  return fullList.length ? fullList : [fallbackProductImage];
}

function mediaImages(item) {
  const images = parseImageLinks(item.imageLinks || item.previewImages || item.images);
  return images.length ? images : [fallbackProductImage];
}

function normalizeYouTubeEmbedUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";

  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      const id = parsed.pathname.replace("/", "");
      return id ? `https://www.youtube.com/embed/${id}` : url;
    }
    if (parsed.hostname.includes("youtube.com")) {
      if (parsed.pathname.startsWith("/embed/")) return url;
      const id = parsed.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
  } catch {
    return url;
  }

  return url;
}

function normalizeVideo(id, data) {
  return {
    id,
    title: data.title || "Untitled video",
    category: data.category || data.level || "A1",
    level: data.level || data.category || "A1",
    embedUrl: normalizeYouTubeEmbedUrl(data.embedUrl || data.youtubeUrl || data.youtubeEmbedUrl || data.iframeUrl),
    description: data.description || "Coco Germany video lesson.",
    imageLinks: mediaImages(data),
    publishedDate: data.publishedDate || data.date || new Date().toISOString().slice(0, 10),
    deleted: Boolean(data.deleted),
  };
}

function sortedVideosForLevel(level) {
  return videos
    .filter((video) => !video.deleted && (video.category === level || video.level === level))
    .sort((a, b) => new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime());
}

function dateLabel(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Not available";
}

function normalizeDownloadUrl(value) {
  return normalizeCdnImageUrl(value);
}

function normalizeProductType(value) {
  return String(value || "paid").toLowerCase() === "free" ? "free" : "paid";
}

function isFreeProduct(resource) {
  return normalizeProductType(resource.productType || resource.type) === "free";
}

function isDigitalProduct(resource) {
  return /digital|pdf|ebook|download/i.test(`${resource.format || ""} ${resource.deliveryType || ""} ${resource.delivery || ""}`);
}

function productActionText(resource) {
  return isFreeProduct(resource) ? "Download Free" : "Buy Now";
}

function productTypeLabel(resource) {
  return isFreeProduct(resource) ? "Free Product" : "Paid Product";
}

function orderDateLabel(order) {
  const value = order.createdAt && typeof order.createdAt.toDate === "function" ? order.createdAt.toDate() : order.createdAt;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Not available";
}

function matchesProductFilter(resource, filter) {
  if (filter === "All") return true;
  if (levels.includes(filter)) return resource.level === filter || resource.category === filter;
  if (filter === "Free") return isFreeProduct(resource);
  if (filter === "Paid") return !isFreeProduct(resource);
  if (filter === "Digital") return isDigitalProduct(resource);
  if (filter === "Printed") return !isDigitalProduct(resource);
  return true;
}

function filterResources(query = "", filter = "All") {
  const normalizedQuery = query.trim().toLowerCase();
  return activeProducts().filter((resource) => {
    const searchable = `${resource.title} ${resource.summary} ${resource.description} ${resource.level} ${resource.format} ${resource.sku}`.toLowerCase();
    return matchesProductFilter(resource, filter) && (!normalizedQuery || searchable.includes(normalizedQuery));
  });
}

function referrerSource() {
  const referrer = document.referrer || "";
  if (!referrer) return "direct";
  try {
    return new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return "direct";
  }
}

function profileIsComplete(profile = currentUserProfile) {
  return Boolean(profile && profile.country && profile.currency);
}

function activeCurrency() {
  return profileIsComplete() && currentUserProfile.currency !== "Other" ? currentUserProfile.currency : "USD";
}

function currencyLocale(currency) {
  const locales = {
    INR: "en-IN",
    USD: "en-US",
    EUR: "de-DE",
    GBP: "en-GB",
    CAD: "en-CA",
    AUD: "en-AU",
    CZK: "cs-CZ",
    DKK: "da-DK",
    HKD: "zh-HK",
    HUF: "hu-HU",
    ILS: "he-IL",
    JPY: "ja-JP",
    MXN: "es-MX",
    TWD: "zh-TW",
    NZD: "en-NZ",
    NOK: "nb-NO",
    PHP: "en-PH",
    PLN: "pl-PL",
    RUB: "ru-RU",
    SGD: "en-SG",
    SEK: "sv-SE",
    CHF: "de-CH",
    THB: "th-TH",
  };
  return locales[currency] || "en-US";
}

function parsePricesJson(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function productPrices(resource) {
  return parsePricesJson(resource.prices || resource.currencyPrices || resource.priceMap || {});
}

function displayPrice(resource) {
  if (isFreeProduct(resource)) return "Free";
  const currency = activeCurrency();
  const prices = productPrices(resource);
  const amount = Number(prices[currency] ?? prices.INR ?? prices.USD ?? parseBasePrice(resource.price));
  return new Intl.NumberFormat(currencyLocale(currency), {
    style: "currency",
    currency,
    maximumFractionDigits: ["INR", "JPY", "HUF", "TWD", "KRW"].includes(currency) ? 0 : 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function priceAccessMarkup(resource, className = "price") {
  if (isFreeProduct(resource)) return `<p class="${className}">Free</p>`;
  if (!currentUser) {
    return html`
      <div class="login-price-callout">
        <a class="button-light" href="#/login" data-login-price="${resource.id}">${icon("log-in")}Login to see price</a>
      </div>
    `;
  }
  return `<p class="${className}">${displayPrice(resource)}</p>`;
}

function actionMarkup(resource, returnHash = "#/resources") {
  if (isFreeProduct(resource)) {
    return `<button class="button" type="button" data-free-download="${resource.id}" data-return-hash="${returnHash}">${icon("download")} ${productActionText(resource)}</button>`;
  }
  if (!currentUser) {
    return `<a class="button" href="#/login" data-login-price="${resource.id}">${icon("log-in")}Login to see price</a>`;
  }
  return `<a class="button" href="#/checkout/${resource.id}">${icon("shopping-bag")} ${productActionText(resource)}</a>`;
}

function analyticsTimestampLabel(record) {
  const value = record.firstVisitAt && typeof record.firstVisitAt.toDate === "function" ? record.firstVisitAt.toDate() : record.firstVisitAtLocal;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Not available";
}

async function ensureUserProfile(user, provider = "firebase") {
  if (!user) {
    currentUserProfile = null;
    return null;
  }

  const tools = await getFirebaseTools();
  if (!tools) return null;

  const profileRef = tools.firestoreModule.doc(tools.db, "userProfiles", user.uid);
  const snapshot = await tools.firestoreModule.getDoc(profileRef);
  const baseProfile = {
    uid: user.uid,
    email: user.email || "",
    referrer: referrerSource(),
    provider,
  };

  if (snapshot.exists()) {
    currentUserProfile = { ...baseProfile, ...snapshot.data() };
    if (!snapshot.data().email) {
      await tools.firestoreModule.setDoc(
        profileRef,
        { email: currentUserProfile.email, updatedAt: tools.firestoreModule.serverTimestamp() },
        { merge: true },
      );
    }
    return currentUserProfile;
  }

  currentUserProfile = {
    ...baseProfile,
    firstVisitAtLocal: new Date().toISOString(),
  };

  await tools.firestoreModule.setDoc(profileRef, {
    ...currentUserProfile,
    firstVisitAt: tools.firestoreModule.serverTimestamp(),
    updatedAt: tools.firestoreModule.serverTimestamp(),
  });

  return currentUserProfile;
}

function activeProducts() {
  return products.filter((product) => !product.archived);
}

function parseBasePrice(value) {
  const numeric = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatPrice(value) {
  const price = String(value || "").trim();
  if (!price) return "₹0";
  if (/^₹/.test(price)) return price;
  if (/^inr\s*/i.test(price)) return price.replace(/^inr\s*/i, "₹");
  if (/^rs\.?\s*/i.test(price)) return price.replace(/^rs\.?\s*/i, "₹");
  if (/^\d/.test(price)) return `₹${price}`;
  return price;
}

function normalizeProduct(id, data) {
  const previewImages = parseImageLinks(data.previewImages || data.imageLinks || data.images || data.image || data.imageUrl);
  const image = previewImages[0] || normalizeCdnImageUrl(data.image || data.imageUrl || fallbackProductImage);
  const productType = normalizeProductType(data.productType || data.type);

  return {
    id,
    title: data.title || data.name || "Untitled resource",
    level: data.level || data.category || "A1",
    category: data.category || data.level || "A1",
    format: data.format || "Digital PDF",
    prices: parsePricesJson(data.prices || data.currencyPrices || data.priceMap),
    price: formatPrice(productType === "free" ? data.price || "0" : data.price || "1599"),
    productType,
    archived: Boolean(data.archived),
    downloadUrl: normalizeDownloadUrl(data.downloadUrl || data.downloadURL || data.fileUrl || ""),
    image,
    summary: data.summary || data.description || "Coco Germany learning resource.",
    sku: data.sku || "CG-ITEM",
    pages: data.pages || "Pages TBC",
    audience: data.audience || `${data.category || data.level || "A1"} learners`,
    includes: data.includes || data.deliveryType || "Study material",
    description: data.description || data.summary || "A Coco Germany resource for structured German learning.",
    benefits: data.benefits || [
      "Structured learning support.",
      "Clear editorial sequence.",
      "Practical study material.",
    ],
    delivery: data.delivery || data.deliveryType || (productType === "free" ? "Instant download after login." : "Delivery after manual payment verification."),
    deliveryType: data.deliveryType || data.delivery || (productType === "free" ? "Instant digital download" : "Email or courier"),
    previewImages: previewImages.length ? previewImages : [image],
  };
}

async function loadProducts() {
  const tools = await getFirebaseTools();
  if (!tools) return;

  try {
    const snapshot = await tools.firestoreModule.getDocs(tools.firestoreModule.collection(tools.db, "products"));
    const firestoreProducts = snapshot.docs
      .map((doc) => ({ id: doc.id, data: doc.data() }))
      .filter((item) => !item.data.deleted)
      .map((item) => normalizeProduct(item.id, item.data));
    products = snapshot.docs.length ? firestoreProducts : [...starterProducts];
  } catch (error) {
    console.error(error);
    products = [...starterProducts];
  }
}

async function loadVideos() {
  const tools = await getFirebaseTools();
  if (!tools) {
    videos = [...starterVideos];
    return;
  }

  try {
    const snapshot = await tools.firestoreModule.getDocs(tools.firestoreModule.collection(tools.db, "videos"));
    const firestoreVideos = snapshot.docs
      .map((doc) => normalizeVideo(doc.id, doc.data()))
      .filter((video) => !video.deleted);
    videos = snapshot.docs.length ? firestoreVideos : [...starterVideos];
  } catch (error) {
    console.error(error);
    videos = [...starterVideos];
  }
}

async function loadOrders() {
  const tools = await getFirebaseTools();
  if (!tools || !currentUser) {
    orders = [];
    return;
  }

  try {
    const snapshot = await tools.firestoreModule.getDocs(tools.firestoreModule.collection(tools.db, "orders"));
    orders = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((order) => isAdmin() || order.userId === currentUser.uid || order.email === currentUser.email);
  } catch (error) {
    console.error(error);
    orders = [];
  }
}


async function loadAnalyticsEvents() {
  const tools = await getFirebaseTools();
  if (!tools || !isAdmin()) {
    analyticsRecords = [];
    return;
  }

  try {
    const snapshot = await tools.firestoreModule.getDocs(tools.firestoreModule.collection(tools.db, "userProfiles"));
    analyticsRecords = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error(error);
    analyticsRecords = [];
  }
}

async function loadExamMaterials() {
  if (window.SupabaseService) {
    try {
      const items = await window.SupabaseService.fetchMaterials({ activeOnly: false });
      examMaterials = (items || []).map((item) => ({
        id: item.id,
        exam: item.exam,
        level: item.level,
        module: item.module,
        materialNumber: item.material_number || item.materialNumber || 1,
        title: item.title,
        description: item.description || "",
        difficulty: item.difficulty,
        durationMinutes: item.duration_minutes !== undefined && item.duration_minutes !== null ? item.duration_minutes : "",
        estimatedTime: item.duration_minutes ? `${item.duration_minutes} mins` : "--",
        contentPath: item.content_path || item.contentPath,
        active: Boolean(item.active),
      }));
    } catch (err) {
      console.error("Supabase loadExamMaterials error:", err);
      examMaterials = [];
    }
  } else {
    examMaterials = [];
  }
}

function pageHeader(eyebrow, title, intro) {
  return html`
    <div>
      <p class="eyebrow">${eyebrow}</p>
      <h1>${title}</h1>
      <p class="intro">${intro}</p>
    </div>
  `;
}

function resourceCard(resource) {
  const images = productImages(resource);
  const action = actionMarkup(resource, "#/resources");

  return html`
    <article class="card resource-card store-product-card">
      <a href="#/resources/${resource.id}" class="store-product-image">
        <img class="resource-image" src="${images[0]}" alt="${resource.title} cover preview" loading="lazy" />
      </a>
      <div class="card-body">
        <div class="badges compact-badges">
          <span class="badge badge-gold">${resource.level}</span>
          <span class="badge">${isFreeProduct(resource) ? "Free" : "Paid"}</span>
        </div>
        <h3><a href="#/resources/${resource.id}">${resource.title}</a></h3>
        <p class="store-format">${icon(isDigitalProduct(resource) ? "file-text" : "package")} ${resource.format}</p>
        ${priceAccessMarkup(resource)}
        <div class="actions store-actions">
          ${action}
          <a class="button-light" href="#/resources/${resource.id}">${icon("eye")}Details</a>
        </div>
      </div>
    </article>
  `;
}

function renderProductGallery(resource, options = {}) {
  const images = productImages(resource);
  const label = options.label || `${resource.title} product images`;
  const className = options.className || "";

  return html`
    <div class="product-gallery ${className}" data-product-gallery aria-label="${label}">
      <button class="gallery-nav gallery-prev" type="button" data-gallery-prev aria-label="Previous product image">
        ${icon("chevron-left")}
      </button>
      <div class="gallery-track" data-gallery-track>
        ${images
          .map(
            (image, index) => html`
              <img src="${image}" alt="${resource.title} product image ${index + 1}" loading="${index ? "lazy" : "eager"}" />
            `,
          )
          .join("")}
      </div>
      <button class="gallery-nav gallery-next" type="button" data-gallery-next aria-label="Next product image">
        ${icon("chevron-right")}
      </button>
      <div class="gallery-dots" aria-hidden="true">
        ${images.map((_, index) => `<span class="${index === 0 ? "active" : ""}"></span>`).join("")}
      </div>
    </div>
  `;
}

function attachProductGalleries() {
  document.querySelectorAll("[data-product-gallery]").forEach((gallery) => {
    const track = gallery.querySelector("[data-gallery-track]");
    const slides = [...track.querySelectorAll("img")];
    const dots = [...gallery.querySelectorAll(".gallery-dots span")];
    const updateDots = () => {
      const activeIndex = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
      dots.forEach((dot, index) => dot.classList.toggle("active", index === activeIndex));
    };
    const scrollBySlide = (direction) => {
      track.scrollBy({ left: direction * track.clientWidth, behavior: "smooth" });
    };

    gallery.querySelector("[data-gallery-prev]").addEventListener("click", () => scrollBySlide(-1));
    gallery.querySelector("[data-gallery-next]").addEventListener("click", () => scrollBySlide(1));
    track.addEventListener("scroll", updateDots, { passive: true });
    gallery.classList.toggle("single-image", slides.length < 2);
  });
}

function comingSoonCard(level) {
  return html`
    <article class="card coming-soon-card">
      <div class="card-body">
        <div class="badges">
          <span class="badge badge-blue">${icon("graduation-cap")}${level}</span>
          <span class="badge">${icon("clock")}Coming Soon</span>
        </div>
        <h3>${level} resources</h3>
        <p>
          This category is being prepared. Coco Germany will add carefully edited ${level} materials when they are ready.
        </p>
        <a class="button-light" href="#/contact">${icon("mail")}Ask about this level</a>
      </div>
    </article>
  `;
}

function renderResourcesForLevel(level) {
  const items = activeProducts().filter((resource) => resource.level === level || resource.category === level);
  return items.length ? items.map(resourceCard).join("") : comingSoonCard(level);
}

function renderLevelTabs(activeLevel) {
  return html`
    <div class="category-tabs" role="tablist" aria-label="German level categories">
      ${levels
        .map(
          (level) => html`
            <button
              type="button"
              class="${level === activeLevel ? "active" : ""}"
              data-level-tab="${level}"
              aria-selected="${level === activeLevel}"
            >
              <span>${level}</span>
              <small>${activeProducts().filter((resource) => resource.level === level || resource.category === level).length || "Soon"}</small>
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderCategoryBrowser(activeLevel = "A1") {
  return html`
    <div class="category-browser" data-category-browser>
      ${renderLevelTabs(activeLevel)}
      <div class="grid two category-results" data-category-results>${renderResourcesForLevel(activeLevel)}</div>
    </div>
  `;
}

function attachCategoryTabs() {
  document.querySelectorAll("[data-category-browser]").forEach((browser) => {
    const results = browser.querySelector("[data-category-results]");

    browser.querySelectorAll("[data-level-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        const level = button.dataset.levelTab;
        browser.querySelectorAll("[data-level-tab]").forEach((tab) => {
          const isActive = tab.dataset.levelTab === level;
          tab.classList.toggle("active", isActive);
          tab.setAttribute("aria-selected", String(isActive));
        });
        results.innerHTML = renderResourcesForLevel(level);
        attachFreeDownloads();
        renderIcons();
      });
    });
  });
}

function renderTrustStrip() {
  return html`
    <section class="trust-strip" aria-label="Trust signals">
      ${trustItems
        .map(
          (item) => html`
            <div>
              ${icon(item[0])}
              <strong>${item[1]}</strong>
              <span>${item[2]}</span>
            </div>
          `,
        )
        .join("")}
    </section>
  `;
}

function renderStatistics() {
  return html`
    <section class="section stats-section">
      <p class="eyebrow">At a glance</p>
      <h2>Small catalogue, clear purpose.</h2>
      <div class="stats-grid">
        ${statistics
          .map(
            (item) => html`
              <div class="stat-card">
                <strong>${item[0]}</strong>
                <h3>${item[1]}</h3>
                <p>${item[2]}</p>
              </div>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderDeliveryTimeline() {
  const steps = [
    ["send", "Request", "Send the form with your chosen resource and contact details."],
    ["message-square", "Reply", "Coco Germany replies with payment instructions and any delivery questions."],
    ["shield-check", "Verify", "Payment is checked manually before fulfilment begins."],
    ["package-check", "Deliver", "PDFs are emailed. Printed materials are packed and shipped by courier."],
  ];

  return html`
    <section class="section">
      <p class="eyebrow">Delivery timeline</p>
      <h2>Simple manual fulfilment.</h2>
      <div class="timeline">
        ${steps
          .map(
            (step, index) => html`
              <div class="timeline-step">
                <span class="step-number">0${index + 1}</span>
                ${icon(step[0])}
                <h3>${step[1]}</h3>
                <p>${step[2]}</p>
              </div>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderTestimonials() {
  return html`
    <section class="section">
      <p class="eyebrow">Learner confidence</p>
      <h2>Clear material, calm experience.</h2>
      <div class="grid three">
        ${testimonials
          .map(
            (item) => html`
              <blockquote class="testimonial">
                ${icon("quote")}
                <p>${item[0]}</p>
                <footer>${item[1]}</footer>
              </blockquote>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderFounderStory() {
  return html`
    <section class="section founder">
      <div>
        <p class="eyebrow">Founder story</p>
        <h2>Built like a study desk, not a sales funnel.</h2>
        <p class="lead">
          Coco Germany was shaped around a simple belief: learners do better when material is clear, honest, and
          carefully edited. The brand keeps its catalogue focused, explains delivery plainly, and treats every resource
          as part of a serious study routine.
        </p>
      </div>
      <div class="founder-note">
        ${icon("pen-line")}
        <h3>Editorial promise</h3>
        <p>
          Each resource should help a learner know what to study, why it matters, and how to continue without noise.
        </p>
      </div>
    </section>
  `;
}

function renderFaq() {
  return html`
    <section class="section">
      <p class="eyebrow">Questions</p>
      <h2>FAQ</h2>
      <div class="faq">
        ${faqs
          .map(
            (item) => html`
              <details>
                <summary>${item[0]} ${icon("chevron-down")}</summary>
                <p>${item[1]}</p>
          </details>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderHome() {
  const featuredVideos = videos && videos.length ? videos.slice(0, 2) : starterVideos;

  app.innerHTML = html`
    <!-- 1. FULL VIEWPORT IMMERSIVE HERO SECTION -->
    <section class="section home-hero" id="hero">
      <div class="home-hero-glow"></div>
      <div class="home-hero-card">
        <div class="home-hero-badge">
          <img class="home-hero-logo" src="public/images/cocoLogo.jpg" alt="Coco Germany logo" />
          <span class="home-hero-brand">CocoGermany</span>
          <span class="badge badge-gold hero-edition-pill">2026 SaaS Platform</span>
        </div>
        <h1 class="home-hero-title">Master German with Precision.</h1>
        <p class="home-hero-subtitle">German learning made practical. Goethe & telc exam preparation, interactive drills, and AI feedback engineered for serious learners.</p>
        
        <div class="home-hero-actions">
          <a class="button button-primary" href="#/practice">${icon("pen-tool")} Start Practice</a>
          <a class="button button-secondary" href="#/practice">${icon("award")} Explore Mock Exams</a>
        </div>

        <!-- FLOATING VISUAL INFOGRAPHIC CARDS -->
        <div class="home-hero-floating-grid">
          <div class="floating-card float-card-1">
            <div class="floating-card-icon">${icon("award")}</div>
            <div class="floating-card-text">
              <strong>Goethe A1–B2 Ready</strong>
              <small>Simulated Exam Rhythms</small>
            </div>
          </div>

          <div class="floating-card float-card-2">
            <div class="floating-card-icon glow-gold">${icon("sparkles")}</div>
            <div class="floating-card-text">
              <strong>AI Essay Evaluator</strong>
              <small>Real-time Grammar Scoring</small>
            </div>
          </div>

          <div class="floating-card float-card-3">
            <div class="floating-card-icon glow-blue">${icon("check-circle-2")}</div>
            <div class="floating-card-text">
              <strong>98.4% Target Rate</strong>
              <small>Certified Learner Path</small>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 2. TRUST & CREDIBILITY STRIP -->
    <section class="home-trust-bar">
      <div class="home-trust-inner">
        <span class="trust-item">${icon("shield-check")} A1–B2 Level Coverage</span>
        <span class="trust-divider">•</span>
        <span class="trust-item">${icon("award")} Goethe & telc Prepared</span>
        <span class="trust-divider">•</span>
        <span class="trust-item">${icon("clock")} Daily Practice Drills</span>
        <span class="trust-divider">•</span>
        <span class="trust-item">${icon("sparkles")} Instant AI Feedback</span>
        <span class="trust-divider">•</span>
        <span class="trust-item">${icon("book-open")} Editorial Standards</span>
      </div>
    </section>

    <!-- 3. FOUR LARGE FEATURE BLOCKS -->
    <section class="section home-products">
      
      <!-- BLOCK 1: MOCK EXAMS -->
      <div class="home-feature-block" id="mock-exams">
        <div class="home-block-header">
          <div class="home-block-icon">${icon("award")}</div>
          <div>
            <h2>Mock Exams</h2>
            <p class="home-block-subtitle">Goethe & telc practice exams with timed modules and scoring feedback.</p>
          </div>
        </div>

        <div class="home-block-grid two">
          <div class="home-feature-subcard">
            <div class="home-subcard-top">
              <span class="badge badge-gold">Official Format</span>
              <h3>Goethe Zertifikat</h3>
            </div>
            <p>Complete A1–B2 practice tests with exam rhythm guidance.</p>
            <a class="home-subcard-btn" href="#/practice">${icon("arrow-right")} Start Goethe Exam</a>
          </div>

          <div class="home-feature-subcard">
            <div class="home-subcard-top">
              <span class="badge badge-blue">Official Format</span>
              <h3>telc Deutsch</h3>
            </div>
            <p>Standardized test modules for reading, listening, and writing.</p>
            <a class="home-subcard-btn" href="#/practice">${icon("arrow-right")} Start telc Exam</a>
          </div>
        </div>
      </div>

      <!-- BLOCK 2: PRACTICE CENTRE -->
      <div class="home-feature-block" id="practice">
        <div class="home-block-header">
          <div class="home-block-icon">${icon("pen-tool")}</div>
          <div>
            <h2>Practice Centre</h2>
            <p class="home-block-subtitle">Targeted interactive drills for reading, listening, grammar, and AI writing.</p>
          </div>
        </div>

        <div class="home-block-grid three">
          <div class="home-feature-subcard">
            <div class="home-subcard-icon">${icon("book-open")}</div>
            <h3>Reading</h3>
            <p>Comprehension passages with exam questions.</p>
          </div>

          <div class="home-feature-subcard">
            <div class="home-subcard-icon">${icon("headphones")}</div>
            <h3>Listening</h3>
            <p>Audio exercises with transcripts & keys.</p>
          </div>

          <div class="home-feature-subcard">
            <div class="home-subcard-icon">${icon("file-text")}</div>
            <h3>Grammar</h3>
            <p>Step-by-step rules & interactive exercises.</p>
          </div>

          <div class="home-feature-subcard">
            <div class="home-subcard-icon">${icon("sparkles")}</div>
            <h3>Writing</h3>
            <p>Smart evaluation & essay feedback.</p>
          </div>

          <div class="home-feature-subcard">
            <div class="home-subcard-icon">${icon("users")}</div>
            <h3>Speaking</h3>
            <p>Partner practice & study group prompts.</p>
          </div>

          <div class="home-feature-subcard">
            <div class="home-subcard-icon">${icon("user-check")}</div>
            <h3>Vocabulary</h3>
            <p>Personal guidance & classroom support.</p>
          </div>
        </div>
        <div style="margin-top: 24px; text-align: center;">
          <a class="button button-primary" href="#/practice">${icon("pen-tool")} Explore Practice Centre</a>
        </div>
      </div>

      <!-- BLOCK 3: VIDEOS -->
      <div class="home-feature-block" id="videos">
        <div class="home-block-header">
          <div class="home-block-icon">${icon("video")}</div>
          <div>
            <h2>Video Lessons</h2>
            <p class="home-block-subtitle">Structured video walkthroughs and pronunciation guides for every level.</p>
          </div>
        </div>

        <div class="home-block-grid two">
          ${featuredVideos
            .map(
              (video) => html`
                <div class="home-feature-subcard home-video-card">
                  <div class="home-video-frame">
                    <iframe
                      src="${video.embedUrl}"
                      title="${video.title}"
                      frameborder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowfullscreen
                      loading="lazy"
                    ></iframe>
                  </div>
                  <div class="home-video-body">
                    <div class="badges">
                      <span class="badge badge-gold">${video.category || video.level || "A1"}</span>
                      <span class="badge">${icon("play-circle")} Video Lesson</span>
                    </div>
                    <h3>${video.title}</h3>
                    <p>${video.description}</p>
                  </div>
                </div>
              `,
            )
            .join("")}
        </div>
        <div style="margin-top: 24px; text-align: center;">
          <a class="button button-secondary" href="#/videos">${icon("video")} Watch Video Library</a>
        </div>
      </div>

      <!-- BLOCK 4: STUDY MATERIALS -->
      <div class="home-feature-block" id="study-materials">
        <div class="home-block-header">
          <div class="home-block-icon">${icon("book-marked")}</div>
          <div>
            <h2>Study Materials</h2>
            <p class="home-block-subtitle">Curated vocabulary lists, grammar notes, and downloadable workbooks.</p>
          </div>
        </div>

        <div class="home-block-grid two">
          <div class="home-feature-subcard">
            <div class="home-subcard-icon">${icon("list")}</div>
            <h3>Vocabulary</h3>
            <p>Essential word lists & thematic flashcards.</p>
            <a class="home-subcard-btn" href="#/resources/study-materials">${icon("arrow-right")} View Vocabulary</a>
          </div>

          <div class="home-feature-subcard">
            <div class="home-subcard-icon">${icon("notebook")}</div>
            <h3>Grammar Notes</h3>
            <p>Concise summaries covering A1 through B2.</p>
            <a class="home-subcard-btn" href="#/resources/study-materials">${icon("arrow-right")} View Grammar Notes</a>
          </div>

          <div class="home-feature-subcard">
            <div class="home-subcard-icon">${icon("download")}</div>
            <h3>Downloads</h3>
            <p>Printable practice sheets and PDF workbooks.</p>
            <a class="home-subcard-btn" href="#/resources/study-materials">${icon("arrow-right")} Access Downloads</a>
          </div>

          <div class="home-feature-subcard">
            <div class="home-subcard-icon">${icon("lightbulb")}</div>
            <h3>Exam Tips</h3>
            <p>Proven strategies for Goethe & telc success.</p>
            <a class="home-subcard-btn" href="#/resources/study-materials">${icon("arrow-right")} Read Exam Tips</a>
          </div>
        </div>
      </div>
    </section>

    <!-- 4. WHY COCOGERMANY? SECTION -->
    <section class="section home-why-section">
      <div class="home-section-title">
        <p class="eyebrow">The CocoGermany Standard</p>
        <h2>Why serious learners choose CocoGermany.</h2>
        <p class="subtitle">Built like a quiet study desk for clear, calm progress.</p>
      </div>

      <div class="home-why-grid">
        <div class="home-why-card">
          <div class="home-why-icon">${icon("target")}</div>
          <h3>Exam Focused</h3>
          <p>Structured specifically for Goethe-Zertifikat and telc certification formats.</p>
        </div>

        <div class="home-why-card">
          <div class="home-why-icon">${icon("sparkles")}</div>
          <h3>AI Writing Feedback</h3>
          <p>Instant evaluations and structural corrections for written exercises.</p>
        </div>

        <div class="home-why-card">
          <div class="home-why-icon">${icon("book-open")}</div>
          <h3>Editorial Care</h3>
          <p>Sequenced learning materials crafted with editorial clarity and zero clutter.</p>
        </div>

        <div class="home-why-card">
          <div class="home-why-icon">${icon("smartphone")}</div>
          <h3>Learn Anywhere</h3>
          <p>Mobile-first interactive platform designed for effortless daily practice.</p>
        </div>
      </div>
    </section>

    <!-- 5. FINAL HIGH-CONVERSION CTA -->
    <section class="section home-final-cta" id="membership">
      <div class="home-cta-card">
        <h2>Master German with Confidence</h2>
        <p>Prepare for Goethe & telc certification exams with clear, practical resources.</p>
        <div class="home-cta-actions">
          <a class="button button-primary" href="#/practice">${icon("pen-tool")} Start Practice Now</a>
          <a class="button button-secondary" href="#/resources/study-materials">${icon("book-open")} View Study Materials</a>
        </div>
      </div>
    </section>
  `;
}

function renderResourceStore(items) {
  return items.length
    ? items.map(resourceCard).join("")
    : `<div class="notice store-empty">No resources match this search. Try another level, product type, or format.</div>`;
}

function renderStoreFilters() {
  const filters = ["All", "A1", "A2", "B1", "B2", "Free", "Paid", "Digital", "Printed"];
  return html`
    <div class="store-toolbar" data-store-toolbar>
      <label class="store-search">
        ${icon("search")}
        <input type="search" data-resource-search placeholder="Search resources, level, format, or SKU" />
      </label>
      <div class="store-filters" role="list" aria-label="Resource filters">
        ${filters.map((filter) => `<button class="${filter === "All" ? "active" : ""}" type="button" data-resource-filter="${filter}">${filter}</button>`).join("")}
      </div>
    </div>
  `;
}

function renderPractice() {
  app.innerHTML = html`
    <section class="section practice-section">
      ${pageHeader(
        "Interactive Learning",
        "Practice Centre",
        "Practice exercises and mock exams will be available here soon to help you master German grammar, vocabulary, listening, and certification exams.",
      )}

      <div style="margin-top: 16px;">
        <span class="badge badge-gold">${icon("clock")} Coming Soon</span>
      </div>

      <div class="grid two practice-feature-grid" style="margin-top: 36px;">
        <article class="card coming-soon-card">
          <div class="card-body">
            <div class="badges">
              <span class="badge badge-gold">${icon("file-check")} Grammar & Vocabulary</span>
              <span class="badge">${icon("clock")} Coming Soon</span>
            </div>
            <h3>Practice Exercises</h3>
            <p>
              Interactive drills and practice exercises organized by level (A1, A2, B1, B2) for daily study and vocabulary retention.
            </p>
          </div>
        </article>

        <article class="card coming-soon-card">
          <div class="card-body">
            <div class="badges">
              <span class="badge badge-blue">${icon("award")} Certification Preparation</span>
              <span class="badge">${icon("clock")} Coming Soon</span>
            </div>
            <h3>Mock Exams</h3>
            <p>
              Full-length mock exams modeled on official Goethe and telc certificates with timed modules and scoring feedback.
            </p>
          </div>
        </article>
      </div>

      <div class="notice" style="margin-top: 36px;">
        ${icon("book-open-check")}
        In the meantime, explore our published <a href="#/resources/study-materials" style="text-decoration: underline; font-weight: 600;">Study Materials</a> and <a href="#/videos" style="text-decoration: underline; font-weight: 600;">Video Lessons</a>.
      </div>
    </section>
  `;
}

function renderResourcesHub() {
  app.innerHTML = html`
    <section class="section resources-hub-section">
      ${pageHeader(
        "Learning Hub",
        "Resources",
        "Explore our collection of study materials and video lessons tailored for serious German learners.",
      )}

      <div class="grid two resources-hub-grid">
        <a href="#/resources/study-materials" class="card hub-card">
          <div class="card-body">
            <div class="hub-card-icon">📚</div>
            <div class="badges">
              <span class="badge badge-gold">Catalogue</span>
              <span class="badge">${activeProducts().length} Resources</span>
            </div>
            <h2>Study Materials</h2>
            <p>
              Browse carefully sequenced workbooks, exam companions, and practice resources across A1, A2, B1, and B2 levels.
            </p>
            <div class="hub-card-action">
              <span>Explore Study Materials</span>
              ${icon("arrow-right")}
            </div>
          </div>
        </a>

        <a href="#/videos" class="card hub-card">
          <div class="card-body">
            <div class="hub-card-icon">🎥</div>
            <div class="badges">
              <span class="badge badge-blue">Video Library</span>
              <span class="badge">${videos.length} Videos</span>
            </div>
            <h2>Videos</h2>
            <p>
              Watch practical German video lessons, pronunciation warmups, and structured B1 exam speaking frames.
            </p>
            <div class="hub-card-action">
              <span>Watch Videos</span>
              ${icon("arrow-right")}
            </div>
          </div>
        </a>
      </div>
    </section>
  `;
}

function renderResources() {
  const visibleProducts = filterResources();

  app.innerHTML = html`
    <section class="section resources-store-section">
      <div style="margin-bottom: 16px;">
        <a class="button-light" href="#/resources" style="min-height: 36px; padding: 0 12px; font-size: 13px;">${icon("arrow-left")} Back to Resources Hub</a>
      </div>
      ${pageHeader(
        "Catalogue",
        "Study Materials",
        "Browse Coco Germany resources like a compact bookstore, with quick filters for level, price type, and format.",
      )}
      ${renderStoreFilters()}
      <div class="store-results-meta"><strong>${visibleProducts.length}</strong> resource${visibleProducts.length === 1 ? "" : "s"} available</div>
      <div class="store-grid" data-store-results>${renderResourceStore(visibleProducts)}</div>
    </section>
  `;
}

function attachResourceStore() {
  const toolbar = document.querySelector("[data-store-toolbar]");
  const results = document.querySelector("[data-store-results]");
  if (!toolbar || !results) return;

  const search = toolbar.querySelector("[data-resource-search]");
  let activeFilter = "All";

  const render = () => {
    const visibleProducts = filterResources(search.value, activeFilter);
    results.innerHTML = renderResourceStore(visibleProducts);
    const meta = document.querySelector(".store-results-meta");
    if (meta) meta.innerHTML = `<strong>${visibleProducts.length}</strong> resource${visibleProducts.length === 1 ? "" : "s"} available`;
    attachFreeDownloads();
    renderIcons();
  };

  search.addEventListener("input", render);
  toolbar.querySelectorAll("[data-resource-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.resourceFilter;
      toolbar.querySelectorAll("[data-resource-filter]").forEach((item) => item.classList.toggle("active", item === button));
      render();
    });
  });
}

function renderResourceDetail(id) {
  const resource = activeProducts().find((item) => item.id === id) || activeProducts()[0] || products[0];
  app.innerHTML = html`
    <section class="section split">
      ${renderProductGallery(resource, { className: "detail-gallery" })}
      <div>
        <p class="eyebrow">${resource.level} resource</p>
        <h1>${resource.title}</h1>
        <p class="lead">${resource.description}</p>
        ${priceAccessMarkup(resource)}
        <div class="badges">
          <span class="badge badge-gold">${icon("graduation-cap")}${resource.level}</span>
          <span class="badge">${icon(isDigitalProduct(resource) ? "file-text" : "package")}${resource.format}</span>
          <span class="badge">${productTypeLabel(resource)}</span>
          <span class="badge">${icon("eye")}${resource.pages}</span>
        </div>
        <div class="metadata detail-meta">
          <span>${icon("users")} ${resource.audience}</span>
          <span>${icon("list-checks")} ${resource.includes}</span>
          <span>${icon("barcode")} ${resource.sku}</span>
          <span>${icon("truck")} ${resource.delivery}</span>
        </div>
        <div class="actions">
          ${actionMarkup(resource, `#/resources/${resource.id}`)}
          <a class="button-light" href="#/resources/study-materials">Back to study materials</a>
        </div>
      </div>
    </section>

    <section class="section">
      <p class="eyebrow">Benefits</p>
      <h2>What this resource supports</h2>
      <div class="grid three">
        ${resource.benefits
          .map(
            (benefit) => html`
              <div class="card card-body icon-card">${icon("check-circle-2")}<p>${benefit}</p></div>
            `,
          )
          .join("")}
      </div>
    </section>

    <section class="section">
      <p class="eyebrow">Preview</p>
      <h2>Swipe through product images</h2>
      <div class="preview-grid product-preview">
        ${renderProductGallery(resource, { className: "preview-gallery", label: `${resource.title} preview images` })}
        <div class="notice">${resource.delivery}</div>
      </div>
    </section>

    ${renderDeliveryTimeline()}
    ${renderFaq()}
    <div class="mobile-purchase-cta">
      ${isFreeProduct(resource)
        ? `<button class="button" type="button" data-free-download="${resource.id}" data-return-hash="#/resources/${resource.id}">${icon("download")}Download Free</button>`
        : currentUser
          ? `<a class="button" href="#/checkout/${resource.id}">${icon("shopping-bag")}Buy Now - ${displayPrice(resource)}</a>`
          : `<a class="button" href="#/login" data-login-price="${resource.id}">${icon("log-in")}Login to see price</a>`}
    </div>
  `;
}

function renderVideoCard(video) {
  return html`
    <article class="card resource-card video-card">
      <div class="video-frame">
        <iframe
          src="${video.embedUrl}"
          title="${video.title}"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
        ></iframe>
      </div>
      <div class="card-body">
        <div class="badges compact-badges">
          <span class="badge badge-gold">${video.category}</span>
          <span class="badge">${icon("calendar-days")}${dateLabel(video.publishedDate)}</span>
        </div>
        <h3>${video.title}</h3>
        <p>${video.description}</p>
        ${renderProductGallery({ title: video.title, previewImages: video.imageLinks }, { className: "video-image-gallery", label: `${video.title} image gallery` })}
        <div class="actions store-actions">
          <a class="button" href="${video.embedUrl}" target="_blank" rel="noopener">${icon("play-circle")}Watch Video</a>
        </div>
      </div>
    </article>
  `;
}

function renderVideosForLevel(level) {
  const items = sortedVideosForLevel(level);
  return items.length
    ? items.map(renderVideoCard).join("")
    : html`
        <article class="card coming-soon-card">
          <div class="card-body">
            <div class="badges">
              <span class="badge badge-blue">${icon("graduation-cap")}${level}</span>
              <span class="badge">${icon("clock")}Coming Soon</span>
            </div>
            <h3>${level} videos</h3>
            <p>Coco Germany will add ${level} video lessons here when they are ready.</p>
          </div>
        </article>
      `;
}

function renderVideoLevelTabs(activeLevel) {
  return html`
    <div class="category-tabs" role="tablist" aria-label="Video level categories">
      ${levels
        .map(
          (level) => html`
            <button
              type="button"
              class="${level === activeLevel ? "active" : ""}"
              data-video-level-tab="${level}"
              aria-selected="${level === activeLevel}"
            >
              <span>${level}</span>
              <small>${sortedVideosForLevel(level).length || "Soon"}</small>
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderVideoBrowser(activeLevel = "A1") {
  return html`
    <div class="category-browser" data-video-browser>
      ${renderVideoLevelTabs(activeLevel)}
      <div class="grid two category-results video-results" data-video-results>${renderVideosForLevel(activeLevel)}</div>
    </div>
  `;
}

function attachVideoTabs() {
  document.querySelectorAll("[data-video-browser]").forEach((browser) => {
    const results = browser.querySelector("[data-video-results]");

    browser.querySelectorAll("[data-video-level-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        const level = button.dataset.videoLevelTab;
        browser.querySelectorAll("[data-video-level-tab]").forEach((tab) => {
          const isActive = tab.dataset.videoLevelTab === level;
          tab.classList.toggle("active", isActive);
          tab.setAttribute("aria-selected", String(isActive));
        });
        results.innerHTML = renderVideosForLevel(level);
        attachProductGalleries();
        renderIcons();
      });
    });
  });
}

function renderVideos() {
  app.innerHTML = html`
    <section class="section">
      ${pageHeader(
        "Video Library",
        "Video Library",
        "Browse Coco Germany video lessons by A1, A2, B1, and B2 level. Newest videos appear first.",
      )}
      ${renderVideoBrowser("A1")}
    </section>
  `;
}

function renderAbout() {
  app.innerHTML = html`
    <section class="section split">
      <div>
        ${pageHeader(
          "About",
          "A small independent German educational publisher.",
          "Coco Germany combines structured language education, editorial publishing standards, and practical cultural context.",
        )}
        <p class="lead">
          The brand is built for learners who prefer well-made materials over noisy study trends. Resources are simple,
          carefully sequenced, and designed for calm progress.
        </p>
      </div>
      <img class="detail-cover" src="public/images/hero-study.jpg" alt="Coco Germany editorial desk" />
    </section>
    ${renderFounderStory()}
    ${renderTrustStrip()}
  `;
}

function renderContact() {
  app.innerHTML = html`
    <section class="section split">
      <div>
        ${pageHeader(
          "Contact",
          "Reach Coco Germany",
          "For resource questions, teaching use, institutional orders, or publishing enquiries.",
        )}
        <div class="notice">
          Choose the quickest way to contact Coco Germany.
        </div>
        <div class="contact-actions">
          <a class="button" href="mailto:cocogermany.ytd@gmail.com">${icon("mail")}Email Coco Germany</a>
          <a class="button whatsapp-button" href="https://wa.me/917907211108" target="_blank" rel="noopener">${icon("message-circle")}WhatsApp</a>
        </div>
      </div>
      <div class="card card-body contact-card">
        ${icon("mail-check")}
        <h3>Quick contact</h3>
        
        <p>WhatsApp: <a href="https://wa.me/917907211108" target="_blank" rel="noopener">Whatsapp Now</a></p>
      </div>
    </section>
  `;
}

function renderLogin(mode = "login") {
  const isRegister = mode === "register";
  const isForgot = mode === "forgot";

  app.innerHTML = html`
    <section class="section auth-wrap">
      <div class="auth-card">
        <img class="auth-logo" src="public/images/cocoLogo.jpg" alt="Coco Germany logo" />
        <p class="eyebrow">Account</p>
        <h1>${isForgot ? "Reset password" : isRegister ? "Create account" : "Login"}</h1>
        <p class="intro">
          ${isForgot
            ? "Enter your email and Coco Germany will send a password reset link."
            : "Access orders, purchased resources, and account settings."}
        </p>

        ${isForgot
          ? ""
          : `<button class="button-light google-button" type="button" id="google-login">
              <svg class="google-g" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.35 12.25c0-.75-.07-1.3-.21-1.88H12v3.55h5.37c-.11.88-.71 2.2-2.04 3.09l-.02.12 2.96 2.29.2.02c1.83-1.68 2.88-4.16 2.88-7.19Z"/><path fill="#34A853" d="M12 21.75c2.63 0 4.84-.87 6.45-2.37l-3.07-2.43c-.82.57-1.92.97-3.38.97-2.58 0-4.77-1.7-5.55-4.05l-.11.01-3.08 2.37-.04.11A9.75 9.75 0 0 0 12 21.75Z"/><path fill="#FBBC05" d="M6.45 13.87A5.85 5.85 0 0 1 6.14 12c0-.65.11-1.28.3-1.87v-.13L3.33 7.58l-.1.05A9.74 9.74 0 0 0 2.25 12c0 1.58.38 3.08.98 4.37l3.22-2.5Z"/><path fill="#EA4335" d="M12 6.08c1.84 0 3.08.8 3.79 1.47l2.77-2.7C16.83 3.23 14.63 2.25 12 2.25a9.75 9.75 0 0 0-8.77 5.38l3.2 2.5c.8-2.35 2.99-4.05 5.57-4.05Z"/></svg> Continue with Google
            </button>
            <div class="auth-divider"><span>Email login</span></div>`}

        <form class="form auth-form" id="auth-form">
          <label class="field">Email <input name="email" type="email" autocomplete="email" required /></label>
          ${isForgot ? "" : `<label class="field">Password <input name="password" type="password" autocomplete="${isRegister ? "new-password" : "current-password"}" required /></label>`}
          ${isForgot
            ? ""
            : `<label class="remember-row"><input name="remember" type="checkbox" checked /> Remember me</label>`}
          <button class="button" type="submit">
            ${icon(isForgot ? "mail" : isRegister ? "user-plus" : "log-in")}
            ${isForgot ? "Send reset link" : isRegister ? "Register" : "Login"}
          </button>
          <p id="auth-message" aria-live="polite"></p>
        </form>

        <div class="auth-links">
          <a href="#/login">Login</a>
          <a href="#/register">Register</a>
          <a href="#/forgot-password">Forgot Password</a>
        </div>
      </div>
    </section>
  `;

  document.querySelector("#auth-form").addEventListener("submit", (event) => handleAuth(event, mode));
  const googleButton = document.querySelector("#google-login");
  if (googleButton) googleButton.addEventListener("click", handleGoogleLogin);
}

async function handleAuth(event, mode) {
  event.preventDefault();
  const message = document.querySelector("#auth-message");
  const formData = new FormData(event.currentTarget);
  const email = String(formData.get("email"));
  const password = String(formData.get("password") || "");
  const remember = Boolean(formData.get("remember"));
  const tools = await getFirebaseTools();

  try {
    if (mode !== "forgot") {
      await tools.authModule.setPersistence(
        tools.auth,
        remember ? tools.authModule.browserLocalPersistence : tools.authModule.browserSessionPersistence,
      );
    }

    if (mode === "register") {
      const result = await tools.authModule.createUserWithEmailAndPassword(tools.auth, email, password);
      await ensureUserProfile(result.user, "email");
      redirectAfterLogin();
    } else if (mode === "forgot") {
      await tools.authModule.sendPasswordResetEmail(tools.auth, email);
      message.textContent = "Password reset email sent.";
    } else {
      const result = await tools.authModule.signInWithEmailAndPassword(tools.auth, email, password);
      await ensureUserProfile(result.user, "email");
      redirectAfterLogin();
    }
  } catch (error) {
    message.className = "error";
    message.textContent = friendlyError(error);
  }
}

async function handleGoogleLogin() {
  const message = document.querySelector("#auth-message");
  const tools = await getFirebaseTools();

  try {
    const provider = new tools.authModule.GoogleAuthProvider();
    const result = await tools.authModule.signInWithPopup(tools.auth, provider);
    await ensureUserProfile(result.user, "google");
    redirectAfterLogin();
  } catch (error) {
    message.className = "error";
    message.textContent = friendlyError(error);
  }
}

async function logout() {
  const tools = await getFirebaseTools();
  await tools.authModule.signOut(tools.auth);
  currentUserProfile = null;
  location.hash = "#/";
}

function optionList(options, selected = "") {
  return options
    .map((option) => {
      const value = Array.isArray(option) ? option[0] : option;
      const label = Array.isArray(option) ? option[1] : option;
      return `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`;
    })
    .join("");
}

function renderOrderRow(order) {
  return html`
    <div class="order-row">
      <div>
        <strong>${order.resourceTitle || order.productName}</strong>
        <span>${order.id} - ${order.status || "Pending"}</span>
      </div>
      <span class="status-pill">${order.status || "Pending"}</span>
    </div>
  `;
}

function requireAdminPage() {
  if (isAdmin()) return true;
  app.innerHTML = html`
    <section class="section">
      <p class="eyebrow">Admin</p>
      <h1>Admin access required</h1>
      <p class="lead">Please login with ${adminEmail} to manage Coco Germany.</p>
      <div class="actions"><a class="button" href="#/login">Login</a></div>
    </section>
  `;
  return false;
}

function adminPath(id) {
  return id === "dashboard" ? "#/admin" : `#/admin/${id}`;
}

function adminShell(active, title, intro, content) {
  const links = [
    ["dashboard", "Dashboard", "layout-dashboard"],
    ["orders", "Orders", "shopping-bag"],
    ["products", "Products", "book-open"],
    ["exam-materials", "Exam Materials", "file-text"],
    ["analytics", "Analytics", "chart-column"],
    ["customers", "Customers", "users"],
    ["videos", "Videos", "video"],
    ["settings", "Settings", "settings"],
  ];

  app.innerHTML = html`
    <section class="section admin-panel">
      <div class="account-header">
        <div>
          <p class="eyebrow">Admin Panel</p>
          <h1>${title}</h1>
          <p class="intro">${intro}</p>
        </div>
        <button class="button-light" type="button" data-logout>${icon("log-out")}Logout</button>
      </div>

      <nav class="admin-nav admin-page-nav" aria-label="Admin pages">
        ${links
          .map(
            ([id, label, iconName]) => `<a class="${active === id ? "active" : ""}" href="${adminPath(id)}">${icon(iconName)}${label}</a>`,
          )
          .join("")}
      </nav>

      ${content}
    </section>
  `;

  document.querySelector("[data-logout]")?.addEventListener("click", logout);
  attachAdminCommonHandlers();
}

function attachAdminCommonHandlers() {
  document.querySelector("#product-form")?.addEventListener("submit", saveProduct);
  document.querySelector("[data-product-type]")?.addEventListener("change", toggleDownloadUrlField);
  document.querySelectorAll("[data-order-status]").forEach((select) => select.addEventListener("change", updateOrderStatus));
  document.querySelectorAll("[data-edit-product]").forEach((button) => button.addEventListener("click", fillProductForm));
  document.querySelectorAll("[data-delete-product]").forEach((button) => button.addEventListener("click", deleteProduct));
  document.querySelectorAll("[data-archive-product]").forEach((button) => button.addEventListener("click", archiveProduct));
  document.querySelectorAll("[data-order-filter]").forEach((button) => button.addEventListener("click", () => renderAdminOrders(button.dataset.orderFilter)));
  document.querySelector("#video-form")?.addEventListener("submit", saveVideo);
  document.querySelectorAll("[data-edit-video]").forEach((button) => button.addEventListener("click", fillVideoForm));
  document.querySelectorAll("[data-delete-video]").forEach((button) => button.addEventListener("click", deleteVideo));
  toggleDownloadUrlField();
}

function miniBarChart(items) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return html`
    <div class="mini-chart">
      ${items
        .map(
          (item) => html`
            <div class="mini-chart-row">
              <span>${item.name}</span>
              <div><i style="width:${Math.max(6, (item.value / max) * 100)}%"></i></div>
              <strong>${item.value}</strong>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function orderStatusCounts() {
  const counts = new Map();
  orders.forEach((order) => counts.set(order.status || "Pending", (counts.get(order.status || "Pending") || 0) + 1));
  return [...counts.entries()].map(([name, value]) => ({ name, value }));
}

function renderAdmin() {
  renderAdminDashboard();
}

function renderAdminDashboard() {
  if (!requireAdminPage()) return;
  const completedCount = orders.filter((order) => order.status === "Completed").length;
  const archivedCount = products.filter((product) => product.archived).length;

  adminShell(
    "dashboard",
    "Dashboard",
    "A quick operational overview for products, orders, customers, and store health.",
    html`
      <section class="admin-section">
        <div class="admin-stats dashboard-stats">
          <div class="stat-card"><strong>${products.length}</strong><h3>Products</h3><p class="muted">Total catalogue items</p></div>
          <div class="stat-card"><strong>${activeProducts().length}</strong><h3>Active products</h3><p class="muted">Visible in store</p></div>
          <div class="stat-card"><strong>${archivedCount}</strong><h3>Archived</h3><p class="muted">Hidden products</p></div>
          <div class="stat-card"><strong>${orders.length}</strong><h3>Orders</h3><p class="muted">Purchase requests</p></div>
          <div class="stat-card"><strong>${completedCount}</strong><h3>Completed</h3><p class="muted">Finished orders</p></div>
          <div class="stat-card"><strong>${analyticsRecords.length}</strong><h3>Profiles</h3><p class="muted">First-visit records</p></div>
        </div>
      </section>

      <section class="admin-section admin-grid-two">
        <div>
          <h2>Order status</h2>
          ${orders.length ? miniBarChart(orderStatusCounts()) : `<p class="muted">No orders yet.</p>`}
        </div>
        <div>
          <h2>Recent orders</h2>
          <div class="activity-list">
            ${orders.slice(0, 6).map((order) => `<div><strong>${order.resourceTitle || "Order"}</strong><span>${order.name || "Customer"} - ${order.status || "Pending"}</span></div>`).join("") || `<p class="muted">No recent orders yet.</p>`}
          </div>
        </div>
      </section>
    `,
  );
}

function renderAdminAnalytics() {
  if (!requireAdminPage()) return;
  adminShell(
    "analytics",
    "Analytics",
    "Minimal first-visit records from Firebase user profiles: email, timestamp, and source only.",
    html`
      <section class="admin-section">
        <div class="admin-table analytics-table">
          ${analyticsRecords.length
            ? analyticsRecords
                .map(
                  (record) => html`
                    <div class="admin-row analytics-row">
                      <div><strong>${record.email || "Unknown email"}</strong></div>
                      <span>First visit: ${analyticsTimestampLabel(record)}</span>
                      <span>Source: ${record.referrer || "direct"}</span>
                    </div>
                  `,
                )
                .join("")
            : `<p class="muted">No user profile analytics yet.</p>`}
        </div>
      </section>
    `,
  );
}

function renderAdminProducts() {
  if (!requireAdminPage()) return;
  adminShell(
    "products",
    "Products",
    "Manage compact bookstore products, free downloads, paid resources, levels, archive state, and CDN links.",
    html`
      <section class="admin-section">
        ${renderProductForm()}
      </section>
      <section class="admin-section">
        <div class="store-grid admin-product-grid">
          ${products.map(renderAdminProduct).join("")}
        </div>
      </section>
    `,
  );
}

function renderAdminOrders(filter = "All") {
  if (!requireAdminPage()) return;
  const filters = ["All", "Pending", "Processing", "Completed", "Cancelled"];
  const visibleOrders = filter === "All" ? orders : orders.filter((order) => (order.status || "Pending") === filter);

  adminShell(
    "orders",
    "Orders",
    "Review paid purchase requests by status and open each order for fulfilment details.",
    html`
      <section class="admin-section">
        <div class="store-filters order-filters">
          ${filters.map((item) => `<button class="${item === filter ? "active" : ""}" type="button" data-order-filter="${item}">${item}</button>`).join("")}
        </div>
        <div class="admin-table admin-order-table">
          ${visibleOrders.length ? visibleOrders.map(renderAdminOrder).join("") : `<p class="muted">No ${filter === "All" ? "" : filter.toLowerCase()} orders yet.</p>`}
        </div>
      </section>
    `,
  );
}

function customerSummaries() {
  const map = new Map();
  orders.forEach((order) => {
    const email = order.email || "Unknown";
    const customer = map.get(email) || { email, name: order.name || "Customer", country: order.country || "", currency: "", orders: 0 };
    customer.orders += 1;
    customer.country = customer.country || order.country || "";
    map.set(email, customer);
  });
  analyticsRecords.forEach((record) => {
    if (!record.email || map.has(record.email)) return;
    map.set(record.email, { email: record.email, name: record.email, country: record.country || "", currency: record.currency || "", orders: 0 });
  });
  return [...map.values()].sort((a, b) => b.orders - a.orders);
}

function renderAdminCustomers() {
  if (!requireAdminPage()) return;
  const customers = customerSummaries();
  adminShell(
    "customers",
    "Customers",
    "Known customers from Firestore orders and first-visit profile records.",
    html`
      <section class="admin-section">
        <div class="admin-table">
          ${customers.length
            ? customers.map((customer) => `<div class="admin-row"><div><strong>${customer.name}</strong><span>${customer.email}</span></div><span>${customer.country || "Country unknown"}</span><span>${customer.orders} order(s)</span><span>${customer.currency || "Currency unknown"}</span></div>`).join("")
            : `<p class="muted">Customers will appear after orders or first-login profile records.</p>`}
        </div>
      </section>
    `,
  );
}

function renderVideoForm() {
  return html`
    <form class="form product-form" id="video-form">
      <input type="hidden" name="id" />
      <label class="field">Video title <input name="title" placeholder="Module 1 - Chapter 3: Pronunciation" required /></label>
      <label class="field">
        Category
        <select name="category">${levels.map((level) => `<option value="${level}">${level}</option>`).join("")}</select>
      </label>
      <label class="field">YouTube iframe/embed URL <input name="embedUrl" placeholder="https://www.youtube.com/embed/..." required /></label>
      <label class="field">Published Date <input name="publishedDate" type="date" required /></label>
      <label class="field image-links-field">
        Image URLs
        <textarea name="imageLinks" placeholder="Paste one GitHub raw/CDN image URL per line" required></textarea>
      </label>
      <label class="field image-links-field">Description <textarea name="description" required></textarea></label>
      <button class="button" type="submit">${icon("save")}Save video</button>
      <p id="video-message" aria-live="polite"></p>
    </form>
  `;
}

function renderAdminVideo(video) {
  const images = mediaImages(video);
  return html`
    <article class="card resource-card store-product-card admin-product-card video-admin-card">
      <div class="video-frame">
        <iframe src="${video.embedUrl}" title="${video.title}" loading="lazy" allowfullscreen></iframe>
      </div>
      <div class="card-body">
        <div class="badges compact-badges">
          <span class="badge badge-gold">${video.category}</span>
          <span class="badge">${dateLabel(video.publishedDate)}</span>
        </div>
        <h3>${video.title}</h3>
        <p>${video.description}</p>
        <span class="muted">${images.length} image link${images.length === 1 ? "" : "s"}</span>
        <div class="actions store-actions">
          <button class="button-light" type="button" data-edit-video="${video.id}">${icon("pencil")}Edit</button>
          <button class="button-light danger-button" type="button" data-delete-video="${video.id}">${icon("trash-2")}Delete</button>
        </div>
      </div>
    </article>
  `;
}

function renderAdminVideos() {
  if (!requireAdminPage()) return;
  adminShell(
    "videos",
    "Video Management",
    "Manage video lessons by level, YouTube embed URL, published date, and GitHub CDN image galleries.",
    html`
      <section class="admin-section">
        ${renderVideoForm()}
      </section>
      <section class="admin-section">
        <div class="store-grid admin-product-grid">
          ${videos.length ? videos.map(renderAdminVideo).join("") : `<p class="muted">No videos yet.</p>`}
        </div>
      </section>
    `,
  );
}

function fillVideoForm(event) {
  const video = videos.find((item) => item.id === event.currentTarget.dataset.editVideo);
  const form = document.querySelector("#video-form");
  if (!video || !form) return;

  form.elements.id.value = video.id;
  form.elements.title.value = video.title;
  form.elements.category.value = video.category;
  form.elements.embedUrl.value = video.embedUrl;
  form.elements.publishedDate.value = video.publishedDate;
  form.elements.imageLinks.value = mediaImages(video).filter((image) => image !== fallbackProductImage).join("\n");
  form.elements.description.value = video.description;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveVideo(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector("#video-message");
  const data = new FormData(form);
  const tools = await getFirebaseTools();
  const id = String(data.get("id") || "").trim();
  const imageLinks = parseImageLinks(data.get("imageLinks"));

  try {
    if (!imageLinks.length) {
      message.className = "error";
      message.textContent = "Add at least one video image CDN link.";
      return;
    }

    if (imageLinks.some((link) => !isProductImageLink(link))) {
      message.className = "error";
      message.textContent = "Use GitHub raw, GitHub blob, or jsDelivr GitHub CDN image links only.";
      return;
    }

    const videoData = {
      title: String(data.get("title") || "").trim(),
      category: String(data.get("category") || "A1"),
      level: String(data.get("category") || "A1"),
      embedUrl: normalizeYouTubeEmbedUrl(data.get("embedUrl")),
      description: String(data.get("description") || "").trim(),
      imageLinks,
      publishedDate: String(data.get("publishedDate") || "").trim(),
      updatedAt: tools.firestoreModule.serverTimestamp(),
    };

    if (id) {
      await tools.firestoreModule.setDoc(tools.firestoreModule.doc(tools.db, "videos", id), videoData, { merge: true });
    } else {
      await tools.firestoreModule.addDoc(tools.firestoreModule.collection(tools.db, "videos"), {
        ...videoData,
        createdAt: tools.firestoreModule.serverTimestamp(),
      });
    }

    message.textContent = "Video saved.";
    form.reset();
    await loadVideos();
    renderAdminVideos();
  } catch (error) {
    message.className = "error";
    message.textContent = friendlyError(error);
  }
}

async function deleteVideo(event) {
  const id = event.currentTarget.dataset.deleteVideo;
  if (!confirm("Delete this video?")) return;

  try {
    const tools = await getFirebaseTools();
    await tools.firestoreModule.setDoc(
      tools.firestoreModule.doc(tools.db, "videos", id),
      { deleted: true, updatedAt: tools.firestoreModule.serverTimestamp() },
      { merge: true },
    );
    await loadVideos();
    renderAdminVideos();
  } catch (error) {
    alert(friendlyError(error));
  }
}

function renderAdminSettings() {
  if (!requireAdminPage()) return;
  const country = currentUserProfile?.country || "Not set";
  const currency = activeCurrency();
  adminShell(
    "settings",
    "Settings",
    "Store settings and operational defaults for the lightweight Firebase dashboard.",
    html`
      <section class="admin-section settings-grid">
        <div class="notice"><strong>Admin account</strong><br />${adminEmail}</div>
        <div class="notice"><strong>Base currency</strong><br />Prices are selected from each product JSON. Logged-in users see ${currency}; profile country is ${country}.</div>
        <div class="notice"><strong>Analytics storage</strong><br />First-visit profile records are saved in the Firestore <code>userProfiles</code> collection.</div>
        <div class="notice"><strong>Product mix</strong><br />${products.filter(isFreeProduct).length} free and ${products.filter((product) => !isFreeProduct(product)).length} paid products.</div>
      </section>
    `,
  );
}

function renderAdminOrder(order) {
  return html`
    <div class="admin-row admin-order-row">
      <div>
        <strong>${order.resourceTitle || order.productName}</strong>
        <span>Customer: ${order.name || "Customer"}</span>
        <span>Email: ${order.email || "Not provided"}</span>
      </div>
      <div class="admin-order-meta">
        <span>Date: ${orderDateLabel(order)}</span>
        <span class="status-pill">${order.status || "Pending"}</span>
      </div>
      <div class="admin-actions">
        <a class="button-light" href="#/admin/orders/${order.id}">${icon("eye")}View order</a>
        <select data-order-status="${order.id}">
          ${orderStatuses
            .map((status) => `<option value="${status}" ${status === (order.status || "Pending") ? "selected" : ""}>${status}</option>`)
            .join("")}
        </select>
      </div>
    </div>
  `;
}

function renderAdminOrderDetail(orderId) {
  if (!isAdmin()) {
    renderAdmin();
    return;
  }

  const order = orders.find((item) => item.id === orderId);
  if (!order) {
    app.innerHTML = html`
      <section class="section">
        <p class="eyebrow">Admin order</p>
        <h1>Order not found</h1>
        <div class="actions"><a class="button" href="#/admin/orders">Back to orders</a></div>
      </section>
    `;
    return;
  }

  const product = products.find((item) => item.id === order.resourceId);
  const whatsappNumber = cleanWhatsappNumber(order.whatsapp || order.phone);
  const whatsappText = encodeURIComponent(
    `Hello ${order.name || ""}, this is Coco Germany about your order for ${order.resourceTitle || "your resource"}.`,
  );

  app.innerHTML = html`
    <section class="section admin-order-detail">
      <div class="account-header">
        <div>
          <p class="eyebrow">Admin order</p>
          <h1>${order.resourceTitle || "Order detail"}</h1>
          <p class="intro">Customer request and fulfilment details.</p>
        </div>
        <a class="button-light" href="#/admin/orders">Back to orders</a>
      </div>

      <div class="split">
        <div class="card card-body">
          <h2>Requested product</h2>
          ${product ? renderProductGallery(product, { className: "order-product-gallery" }) : ""}
          <h3>${order.resourceTitle || product?.title || "Product"}</h3>
          <p class="muted">${order.format || product?.format || ""} - ${order.price || (product ? displayPrice(product) : "")}</p>
          <p class="muted">SKU: ${product?.sku || "Not available"}</p>
        </div>

        <div class="card card-body">
          <h2>Customer</h2>
          <p><strong>Name:</strong> ${order.name || "Not provided"}</p>
          <p><strong>Email:</strong> ${order.email || "Not provided"}</p>
          <p><strong>WhatsApp:</strong> ${order.whatsapp || order.phone || "Not provided"}</p>
          <p><strong>Address:</strong><br />${order.address || "Not provided"}</p>
          <p><strong>Country:</strong> ${order.country || "Not provided"}</p>
          <p><strong>Postal Code:</strong> ${order.postalCode || "Not provided"}</p>
          <p><strong>Notes:</strong> ${order.notes || "None"}</p>

          <label class="field">
            Order status
            <select data-order-status="${order.id}">
              ${orderStatuses
                .map((status) => `<option value="${status}" ${status === (order.status || "Pending") ? "selected" : ""}>${status}</option>`)
                .join("")}
            </select>
          </label>

          <div class="actions">
            ${whatsappNumber
              ? `<a class="button whatsapp-button" href="https://wa.me/${whatsappNumber}?text=${whatsappText}" target="_blank" rel="noopener">${icon("message-circle")}Chat on WhatsApp</a>`
              : `<span class="error">No WhatsApp number provided.</span>`}
          </div>
        </div>
      </div>
    </section>
  `;

  document.querySelectorAll("[data-order-status]").forEach((select) => select.addEventListener("change", updateOrderStatus));
}

function renderProductForm() {
  return html`
    <form class="form product-form" id="product-form">
      <input type="hidden" name="id" />
      <label class="field">Product name <input name="title" required /></label>
      <label class="field">
        Category
        <select name="category">${levels.map((level) => `<option value="${level}">${level}</option>`).join("")}</select>
      </label>
      <label class="field">
        Product Type
        <select name="productType" data-product-type>
          <option value="paid">Paid Product</option>
          <option value="free">Free Product</option>
        </select>
      </label>
      <label class="field prices-json-field">Currency prices JSON <textarea name="prices" placeholder='{"USD":19,"EUR":18,"INR":1599,"GBP":15,"CAD":25,"AUD":29}'></textarea></label>
      <label class="field download-url-field" data-download-url-field>Download URL <input name="downloadUrl" placeholder="GitHub raw/CDN download link" /></label>
      <label class="field">Description <textarea name="description" required></textarea></label>
      <label class="field image-links-field">
        Product image CDN links
        <textarea name="imageLinks" placeholder="Paste one GitHub raw/CDN image URL per line" required></textarea>
      </label>
      <label class="field">Format <input name="format" placeholder="Digital PDF or Printed" required /></label>
      <label class="field">Pages <input name="pages" placeholder="84 pages" /></label>
      <label class="field">SKU <input name="sku" placeholder="CG-A1-02" /></label>
      <label class="field">Delivery type <input name="deliveryType" placeholder="Instant download, email delivery, or courier" /></label>
      <button class="button" type="submit">${icon("save")}Save product</button>
      <p id="product-message" aria-live="polite"></p>
    </form>
  `;
}

function toggleDownloadUrlField() {
  const form = document.querySelector("#product-form");
  const field = document.querySelector("[data-download-url-field]");
  if (!form || !field) return;
  const isFree = form.elements.productType.value === "free";
  field.hidden = !isFree;
  field.querySelector("input").required = isFree;
}

function renderAdminProduct(product) {
  const images = productImages(product);

  return html`
    <article class="card resource-card store-product-card admin-product-card ${product.archived ? "is-archived" : ""}">
      <img class="resource-image" src="${images[0]}" alt="${product.title} cover" />
      <div class="card-body">
        <div class="badges compact-badges">
          <span class="badge badge-gold">${product.level}</span>
          <span class="badge">${isFreeProduct(product) ? "Free" : "Paid"}</span>
          ${product.archived ? `<span class="badge">Archived</span>` : ""}
        </div>
        <h3>${product.title}</h3>
        <p class="store-format">${icon(isDigitalProduct(product) ? "file-text" : "package")} ${product.format}</p>
        <p class="price">${displayPrice(product)}</p>
        <span class="muted">${images.length} image link${images.length === 1 ? "" : "s"}${isFreeProduct(product) && product.downloadUrl ? " - download ready" : ""}</span>
        <div class="actions store-actions">
          <button class="button-light" type="button" data-edit-product="${product.id}">${icon("pencil")}Edit</button>
          <button class="button-light" type="button" data-archive-product="${product.id}">${icon(product.archived ? "archive-restore" : "archive")} ${product.archived ? "Restore" : "Archive"}</button>
          <button class="button-light danger-button" type="button" data-delete-product="${product.id}">${icon("trash-2")}Delete</button>
        </div>
      </div>
    </article>
  `;
}

async function updateOrderStatus(event) {
  const tools = await getFirebaseTools();
  const orderId = event.currentTarget.dataset.orderStatus;

  try {
    await tools.firestoreModule.updateDoc(tools.firestoreModule.doc(tools.db, "orders", orderId), {
      status: event.currentTarget.value,
      updatedAt: tools.firestoreModule.serverTimestamp(),
    });
    await loadOrders();
    if (location.hash.includes("#/admin/orders/")) {
      renderAdminOrderDetail(orderId);
    } else {
      renderAdminOrders();
    }
  } catch (error) {
    alert(friendlyError(error));
  }
}

function fillProductForm(event) {
  const product = products.find((item) => item.id === event.currentTarget.dataset.editProduct);
  const form = document.querySelector("#product-form");
  form.elements.id.value = product.id;
  form.elements.title.value = product.title;
  form.elements.category.value = product.level;
  form.elements.productType.value = normalizeProductType(product.productType);
  form.elements.prices.value = JSON.stringify(productPrices(product), null, 2);
  form.elements.downloadUrl.value = product.downloadUrl || "";
  form.elements.description.value = product.description;
  form.elements.imageLinks.value = productImages(product).filter((image) => image !== fallbackProductImage).join("\n");
  form.elements.format.value = product.format;
  form.elements.pages.value = product.pages;
  form.elements.sku.value = product.sku;
  form.elements.deliveryType.value = product.deliveryType || product.delivery;
  toggleDownloadUrlField();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector("#product-message");
  const data = new FormData(form);
  const tools = await getFirebaseTools();
  const id = String(data.get("id") || "").trim();
  const imageLinks = parseImageLinks(data.get("imageLinks"));
  const productType = normalizeProductType(data.get("productType"));
  const downloadUrl = normalizeDownloadUrl(data.get("downloadUrl"));
  const prices = parsePricesJson(data.get("prices"));
  const existingProduct = id ? products.find((item) => item.id === id) : null;

  try {
    if (!imageLinks.length) {
      message.className = "error";
      message.textContent = "Add at least one product image CDN link.";
      return;
    }

    if (imageLinks.some((link) => !isProductImageLink(link))) {
      message.className = "error";
      message.textContent = "Use GitHub raw, GitHub blob, or jsDelivr GitHub CDN image links only.";
      return;
    }

    if (productType === "paid" && !Object.keys(prices).length) {
      message.className = "error";
      message.textContent = "Add a valid prices JSON object for paid products.";
      return;
    }

    if (productType === "free" && !downloadUrl) {
      message.className = "error";
      message.textContent = "Add a download URL for free products.";
      return;
    }

    const productData = {
      title: String(data.get("title")),
      category: String(data.get("category")),
      level: String(data.get("category")),
      prices: productType === "free" ? {} : prices,
      price: productType === "free" ? "0" : String(prices.INR || prices.USD || Object.values(prices)[0] || "0"),
      productType,
      archived: existingProduct ? Boolean(existingProduct.archived) : false,
      downloadUrl,
      image: imageLinks[0],
      previewImages: imageLinks,
      description: String(data.get("description")),
      summary: String(data.get("description")),
      format: String(data.get("format")),
      pages: String(data.get("pages")),
      sku: String(data.get("sku")),
      deliveryType: String(data.get("deliveryType")),
      delivery: String(data.get("deliveryType")),
      updatedAt: tools.firestoreModule.serverTimestamp(),
    };

    if (id) {
      await tools.firestoreModule.setDoc(tools.firestoreModule.doc(tools.db, "products", id), productData, { merge: true });
    } else {
      await tools.firestoreModule.addDoc(tools.firestoreModule.collection(tools.db, "products"), {
        ...productData,
        createdAt: tools.firestoreModule.serverTimestamp(),
      });
    }

    message.textContent = "Product saved.";
    form.reset();
    await loadProducts();
    renderAdminProducts();
  } catch (error) {
    message.className = "error";
    message.textContent = friendlyError(error);
  }
}

async function deleteProduct(event) {
  const id = event.currentTarget.dataset.deleteProduct;
  if (!confirm("Delete this product?")) return;

  try {
    const tools = await getFirebaseTools();
    await tools.firestoreModule.setDoc(
      tools.firestoreModule.doc(tools.db, "products", id),
      { deleted: true, updatedAt: tools.firestoreModule.serverTimestamp() },
      { merge: true },
    );
    await loadProducts();
    renderAdminProducts();
  } catch (error) {
    alert(friendlyError(error));
  }
}


async function archiveProduct(event) {
  const id = event.currentTarget.dataset.archiveProduct;
  const product = products.find((item) => item.id === id);
  if (!product) return;

  try {
    const tools = await getFirebaseTools();
    await tools.firestoreModule.setDoc(
      tools.firestoreModule.doc(tools.db, "products", id),
      { archived: !product.archived, updatedAt: tools.firestoreModule.serverTimestamp() },
      { merge: true },
    );
    await loadProducts();
    renderAdminProducts();
  } catch (error) {
    alert(friendlyError(error));
  }
}

function renderPurchase(resourceId) {
  const resource = activeProducts().find((item) => item.id === resourceId) || activeProducts()[0] || products[0];
  const images = productImages(resource);
  const digitalProduct = isDigitalProduct(resource);

  if (isFreeProduct(resource)) {
    handleFreeDownload(resource.id);
    return;
  }

  if (!currentUser) {
    localStorage.setItem("loginRedirect", `#/checkout/${resource.id}`);
    renderLogin("login");
    return;
  }

  app.innerHTML = html`
    <section class="section split">
      <div>
        <p class="eyebrow">Checkout</p>
        <h1>${resource.title}</h1>
        <p class="lead">
          ${digitalProduct ? "Add your contact details and confirm your digital purchase request." : "Add contact and shipping details to confirm your printed order request."}
        </p>
        <p class="price">${displayPrice(resource)}</p>
        <div class="notice">
          ${icon("shield-check")}
          Your order is stored as Pending. Coco Germany will update the status after manual payment and fulfilment.
        </div>
      </div>

      <form class="form" id="purchase-form">
        <div class="checkout-summary">
          <img src="${images[0]}" alt="${resource.title} cover" />
          <div>
            <strong>${resource.title}</strong>
            <span>${resource.level} - ${resource.format} - ${displayPrice(resource)}</span>
          </div>
        </div>
        ${renderProductGallery(resource, { className: "checkout-gallery" })}
        <input type="hidden" name="resourceId" value="${resource.id}" />
        <input type="hidden" name="isDigital" value="${digitalProduct ? "yes" : "no"}" />
        <label class="field">Full name <input name="name" required /></label>
        <label class="field">Email <input name="email" type="email" value="${currentUser ? currentUser.email : ""}" required /></label>
        <label class="field">WhatsApp number <input name="phone" placeholder="+91 79072 11108" required /></label>
        ${digitalProduct
          ? ""
          : html`
              <label class="field">Shipping Address <textarea name="address" placeholder="House, street, city" required></textarea></label>
              <label class="field">Country <input name="country" required /></label>
              <label class="field">Postal Code <input name="postalCode" required /></label>
            `}
        <label class="field">Notes <textarea name="notes" placeholder="Optional notes"></textarea></label>
        <button class="button" type="submit">${icon("send")}Confirm order</button>
        <p id="form-message" aria-live="polite"></p>
      </form>
    </section>
  `;

  document.querySelector("#purchase-form").addEventListener("submit", submitPurchaseRequest);
}

async function submitPurchaseRequest(event) {
  event.preventDefault();

  const message = document.querySelector("#form-message");
  const form = event.currentTarget;
  const formData = new FormData(form);
  const selectedResource = products.find((item) => item.id === formData.get("resourceId")) || products[0];

  if (!currentUser) {
    localStorage.setItem("loginRedirect", `#/checkout/${formData.get("resourceId")}`);
    location.hash = "#/login";
    return;
  }

  if (isFreeProduct(selectedResource)) {
    handleFreeDownload(selectedResource.id);
    return;
  }

  const order = {
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    whatsapp: formData.get("phone"),
    address: formData.get("address") || "",
    country: formData.get("country") || "",
    postalCode: formData.get("postalCode") || "",
    notes: formData.get("notes"),
    resourceId: selectedResource.id,
    resourceTitle: selectedResource.title,
    format: selectedResource.format,
    productType: selectedResource.productType,
    price: displayPrice(selectedResource),
    userId: currentUser ? currentUser.uid : "",
    status: "Pending",
  };

  const tools = await getFirebaseTools();

  if (!tools) {
    message.className = "error";
    message.textContent = "Ordering is not available right now. Please contact Coco Germany by email or WhatsApp.";
    return;
  }

  message.textContent = "Submitting...";

  try {
    await tools.firestoreModule.addDoc(tools.firestoreModule.collection(tools.db, "orders"), {
      ...order,
      createdAt: tools.firestoreModule.serverTimestamp(),
    });
    location.hash = "#/success";
  } catch (error) {
    message.className = "error";
    message.textContent = friendlyError(error);
    console.error(error);
  }
}

// --- Exam Materials CMS Functions (Metadata Only) ---

function generateExamMaterialId(exam, level, moduleName, number) {
  const examPrefix = exam === "telc" ? "Te" : exam === "both" ? "Bo" : "Go";
  const levelCode = level || "A1";
  const moduleCodes = {
    Lesen: "LM",
    Hören: "HM",
    Grammar: "GR",
    Schreiben: "WR",
    Sprechen: "SP",
    "Mock Exam": "ME",
  };
  const moduleCode = moduleCodes[moduleName] || "LM";
  const numPadded = String(number || 1).padStart(3, "0");
  return `${examPrefix}${levelCode}${moduleCode}${numPadded}`;
}

function getNextExamMaterialNumber(exam, level, moduleName) {
  const examPrefix = exam === "telc" ? "Te" : exam === "both" ? "Bo" : "Go";
  const levelCode = level || "A1";
  const moduleCodes = {
    Lesen: "LM",
    Hören: "HM",
    Grammar: "GR",
    Schreiben: "WR",
    Sprechen: "SP",
    "Mock Exam": "ME",
  };
  const moduleCode = moduleCodes[moduleName] || "LM";
  const prefix = `${examPrefix}${levelCode}${moduleCode}`;

  let maxNum = 0;
  examMaterials.forEach((item) => {
    if (item.id && item.id.startsWith(prefix)) {
      const numPart = parseInt(item.id.slice(prefix.length), 10);
      if (!isNaN(numPart) && numPart > maxNum) {
        maxNum = numPart;
      }
    }
  });

  return maxNum + 1;
}

function updateExamMaterialIdPreview() {
  const form = document.querySelector("#exam-material-form");
  const badge = document.querySelector("#id-preview-badge");
  if (!form || !badge) return;

  const exam = form.elements.exam.value;
  const level = form.elements.level.value;
  const moduleName = form.elements.module.value;

  if (!form.dataset.manualNum) {
    const nextNum = getNextExamMaterialNumber(exam, level, moduleName);
    form.elements.materialNumber.value = nextNum;
  }

  const materialNumber = parseInt(form.elements.materialNumber.value || "1", 10);
  const id = generateExamMaterialId(exam, level, moduleName, materialNumber);
  badge.textContent = id;

  if (!form.dataset.manualContentPath) {
    form.elements.contentPath.value = `${level}/${id}.json`;
  }
}

async function saveExamMaterial(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector("#exam-material-message");
  const submitBtn = form.querySelector("button[type='submit']");

  message.className = "";
  message.textContent = "Saving metadata to Supabase materials table...";
  if (submitBtn) submitBtn.disabled = true;

  try {
    const formData = new FormData(form);
    const exam = String(formData.get("exam") || "goethe");
    const level = String(formData.get("level") || "A1");
    const moduleName = String(formData.get("module") || "Lesen");
    const materialNumber = parseInt(formData.get("materialNumber") || "1", 10);
    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const difficulty = String(formData.get("difficulty") || "Medium");
    const active = formData.get("active") === "true";

    const durationVal = formData.get("durationMinutes");
    let durationMinutes = null;
    if (durationVal !== null && durationVal !== undefined && String(durationVal).trim() !== "") {
      durationMinutes = parseInt(String(durationVal).trim(), 10);
      if (isNaN(durationMinutes) || durationMinutes <= 0) {
        throw new Error("Duration (minutes) must be a positive number.");
      }
    }

    const id = generateExamMaterialId(exam, level, moduleName, materialNumber);
    const contentPath = String(formData.get("contentPath") || `${level}/${id}.json`).trim();

    if (!title) throw new Error("Title is required.");

    const docData = {
      id,
      title,
      description: description || null,
      exam,
      level,
      module: moduleName,
      material_number: materialNumber,
      content_path: contentPath,
      difficulty,
      duration_minutes: durationMinutes,
      active,
    };

    const tools = await getFirebaseTools();
    let idToken = "";
    if (tools && tools.auth && tools.auth.currentUser) {
      idToken = await tools.auth.currentUser.getIdToken(true);
    }

    if (window.SupabaseService) {
      await window.SupabaseService.saveMaterialMetadata(docData, idToken);
    } else {
      throw new Error("Supabase service layer is not available.");
    }

    await loadExamMaterials();

    message.className = "success";
    message.textContent = `Successfully saved metadata for ${id} in Supabase materials table!`;
    form.reset();
    delete form.dataset.manualNum;
    delete form.dataset.manualContentPath;
    renderAdminExamMaterials();
  } catch (error) {
    console.error(error);
    message.className = "error";
    message.textContent = `Failed to save metadata: ${error.message}`;
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function fillExamMaterialForm(id) {
  const item = examMaterials.find((m) => m.id === id);
  if (!item) return;

  const form = document.querySelector("#exam-material-form");
  if (!form) return;

  form.elements.exam.value = item.exam || "goethe";
  form.elements.level.value = item.level || "A1";
  form.elements.module.value = item.module || "Lesen";
  form.elements.materialNumber.value = item.materialNumber || 1;
  form.elements.title.value = item.title || "";
  form.elements.description.value = item.description || "";
  form.elements.contentPath.value = item.contentPath || `${item.level}/${item.id}.json`;
  form.elements.durationMinutes.value = item.durationMinutes !== undefined && item.durationMinutes !== null ? item.durationMinutes : "";
  form.elements.difficulty.value = item.difficulty || "Medium";
  form.elements.active.value = item.active !== false ? "true" : "false";

  form.dataset.manualNum = "true";
  form.dataset.manualContentPath = "true";
  updateExamMaterialIdPreview();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteExamMaterial(id) {
  if (!confirm(`Are you sure you want to delete exam material ${id}?`)) return;

  try {
    if (window.SupabaseService) {
      await window.SupabaseService.deleteMaterialMetadata(id);
    } else {
      throw new Error("Supabase service layer is not available.");
    }
    await loadExamMaterials();
    renderAdminExamMaterials();
  } catch (error) {
    alert(friendlyError(error));
  }
}

function renderAdminExamMaterials() {
  if (!requireAdminPage()) return;

  adminShell(
    "exam-materials",
    "Exam Materials Metadata CMS",
    "Manage exam materials metadata stored in Supabase materials table. R2 JSON files are uploaded manually.",
    html`
      <section class="admin-section admin-grid-two">
        <div class="card card-body">
          <h2>Create / Edit Exam Material</h2>
          <p class="muted">Fill in metadata fields. Content is loaded directly from Cloudflare R2 using Content Path.</p>

          <form class="form exam-material-form" id="exam-material-form">
            <div class="exam-material-form-grid">
              <label class="field">
                Exam
                <select name="exam">
                  <option value="goethe">Goethe</option>
                  <option value="telc">telc</option>
                  <option value="both">Both</option>
                </select>
              </label>

              <label class="field">
                Level
                <select name="level">
                  <option value="A1">A1</option>
                  <option value="A2">A2</option>
                  <option value="B1">B1</option>
                  <option value="B2">B2</option>
                </select>
              </label>

              <label class="field">
                Module
                <select name="module">
                  <option value="Lesen">Lesen (Reading)</option>
                  <option value="Hören">Hören (Listening)</option>
                  <option value="Grammar">Grammar</option>
                  <option value="Schreiben">Schreiben (Writing)</option>
                  <option value="Sprechen">Sprechen (Speaking)</option>
                  <option value="Mock Exam">Mock Exam</option>
                </select>
              </label>

              <label class="field">
                Material Number
                <input type="number" name="materialNumber" min="1" max="999" value="1" required />
              </label>
            </div>

            <div style="margin: 10px 0 18px;">
              <span class="muted" style="font-size: 13px;">Auto-generated ID (Read Only):</span><br />
              <span class="id-preview-badge" id="id-preview-badge">GoA1LM001</span>
            </div>

            <label class="field">
              Title
              <input name="title" placeholder="e.g. Restaurant Advertisement" required />
            </label>

            <label class="field">
              Description
              <textarea name="description" placeholder="Brief summary of this practice material..." rows="2"></textarea>
            </label>

            <label class="field">
              Content Path
              <input name="contentPath" placeholder="e.g. A1/GoA1LM001.json" required />
            </label>

            <div class="exam-material-form-grid">
              <label class="field">
                Duration (minutes)
                <input type="number" name="durationMinutes" min="1" max="999" placeholder="e.g. 15" />
              </label>

              <label class="field">
                Difficulty
                <select name="difficulty">
                  <option value="Easy">Easy</option>
                  <option value="Medium" selected>Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </label>

              <label class="field">
                Active
                <select name="active">
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
            </div>

            <div class="actions" style="margin-top: 20px;">
              <button class="button" type="submit">${icon("save")} Save Metadata to Supabase</button>
            </div>
            <p id="exam-material-message" aria-live="polite"></p>
          </form>
        </div>

        <div>
          <h2>Saved Materials Metadata (${examMaterials.length})</h2>
          <div class="card card-body" style="padding: 0; overflow-x: auto;">
            ${examMaterials.length
              ? html`
                  <table class="exam-materials-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Title</th>
                        <th>Exam / Level</th>
                        <th>Module</th>
                        <th>Duration</th>
                        <th>Content Path</th>
                        <th>Active</th>
                        <th>Difficulty</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${examMaterials
                        .map(
                          (item) => html`
                            <tr>
                              <td><strong>${item.id}</strong></td>
                              <td>${item.title}</td>
                              <td>${item.exam} ${item.level}</td>
                              <td><span class="badge">${item.module}</span></td>
                              <td>${item.durationMinutes ? `${item.durationMinutes} mins` : "--"}</td>
                              <td><code class="cdn-link">${item.contentPath || `${item.level}/${item.id}.json`}</code></td>
                              <td><span class="badge ${item.active ? "badge-gold" : ""}">${item.active ? "Yes" : "No"}</span></td>
                              <td><span class="muted">${item.difficulty || "Medium"}</span></td>
                              <td>
                                <div class="actions" style="gap: 4px;">
                                  <button class="button-light" type="button" data-edit-exam-material="${item.id}">${icon("pencil")}</button>
                                  <button class="button-light danger-button" type="button" data-delete-exam-material="${item.id}">${icon("trash-2")}</button>
                                </div>
                              </td>
                            </tr>
                          `,
                        )
                        .join("")}
                    </tbody>
                  </table>
                `
              : `<p class="muted" style="padding: 20px;">No exam materials saved yet. Fill in the form to add metadata to Supabase.</p>`}
          </div>
        </div>
      </section>
    `,
  );

  updateExamMaterialIdPreview();

  const form = document.querySelector("#exam-material-form");
  if (form) {
    ["exam", "level", "module"].forEach((fieldName) => {
      form.elements[fieldName]?.addEventListener("change", () => {
        delete form.dataset.manualNum;
        if (!form.dataset.manualContentPath) {
          form.elements.contentPath.value = "";
        }
        updateExamMaterialIdPreview();
      });
    });

    form.elements.materialNumber?.addEventListener("input", () => {
      form.dataset.manualNum = "true";
      if (!form.dataset.manualContentPath) {
        form.elements.contentPath.value = "";
      }
      updateExamMaterialIdPreview();
    });

    form.elements.contentPath?.addEventListener("input", () => {
      form.dataset.manualContentPath = "true";
    });
  }

  document.querySelector("#exam-material-form")?.addEventListener("submit", saveExamMaterial);

  document.querySelectorAll("[data-edit-exam-material]").forEach((button) => {
    button.addEventListener("click", () => fillExamMaterialForm(button.dataset.editExamMaterial));
  });

  document.querySelectorAll("[data-delete-exam-material]").forEach((button) => {
    button.addEventListener("click", () => deleteExamMaterial(button.dataset.deleteExamMaterial));
  });
}

function handleFreeDownload(productId) {
  const resource = products.find((item) => item.id === productId);
  if (!resource) return;

  if (!resource.downloadUrl) {
    alert("This free download is not ready yet. Please contact Coco Germany.");
    return;
  }

  window.open(resource.downloadUrl, "_blank", "noopener");
}

function attachFreeDownloads() {
  document.querySelectorAll("[data-free-download]").forEach((button) => {
    button.addEventListener("click", () => handleFreeDownload(button.dataset.freeDownload));
  });
}

function attachLoginPriceLinks() {
  document.querySelectorAll("[data-login-price]").forEach((link) => {
    link.addEventListener("click", () => {
      localStorage.setItem("loginRedirect", `#/resources/${link.dataset.loginPrice}`);
    });
  });
}

function renderSuccess() {
  app.innerHTML = html`
    <section class="section">
      <p class="eyebrow">Success</p>
      <h1>Purchase request received.</h1>
      <p class="lead">
        Your request has been recorded as Pending. Coco Germany will verify payment externally and then email the PDF or
        arrange courier shipment for printed material.
      </p>
      <div class="actions">
        <a class="button" href="#/account">${icon("user")}View my orders</a>
        <a class="button-light" href="#/resources/study-materials">Back to study materials</a>
        <a class="button-light" href="#/">Home</a>
      </div>
    </section>
  `;
}

function renderNotFound() {
  app.innerHTML = html`
    <section class="section">
      <p class="eyebrow">404</p>
      <h1>Page not found</h1>
      <div class="actions"><a class="button" href="#/">Return home</a></div>
    </section>
  `;
}

function setActiveNavigation(path) {
  document.querySelectorAll(".bottom-nav a, .desktop-nav a").forEach((link) => {
    const href = link.getAttribute("href").replace("#", "");
    link.classList.toggle("active", href === path || (href !== "/" && path.startsWith(href)));
  });
  document.querySelector(".nav-home-group")?.classList.toggle("is-collapsed", path !== "/");
}

function scrollToHomeSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return false;
  section.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

function updateNavScrollControl() {
  const nav = document.querySelector(".desktop-nav");
  const control = document.querySelector(".nav-scroll-control");
  if (!nav || !control) return;
  control.hidden = nav.scrollTop + nav.clientHeight >= nav.scrollHeight - 2;
}

function attachHomeScrollNavigation() {
  const links = document.querySelectorAll("[data-scroll-section]");
  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const sectionId = link.dataset.scrollSection;
      if (!scrollToHomeSection(sectionId)) {
        pendingHomeSection = sectionId;
        location.hash = "#/";
      }
    });
  });

  const homeToggle = document.querySelector("[data-nav-home]");
  if (homeToggle && !homeToggle.dataset.bound) {
    homeToggle.dataset.bound = "true";
    homeToggle.addEventListener("click", (event) => {
      if (!event.target.closest(".nav-chevron")) return;
      event.preventDefault();
      homeToggle.closest(".nav-home-group")?.classList.toggle("is-collapsed");
      window.setTimeout(updateNavScrollControl, 240);
    });
  }

  const navScrollControl = document.querySelector(".nav-scroll-control");
  if (navScrollControl && !navScrollControl.dataset.bound) {
    navScrollControl.dataset.bound = "true";
    navScrollControl.addEventListener("click", () => {
      const nav = document.querySelector(".desktop-nav");
      nav?.scrollBy({ top: 170, behavior: "smooth" });
      window.setTimeout(updateNavScrollControl, 220);
    });
  }
  const desktopNav = document.querySelector(".desktop-nav");
  if (desktopNav && !desktopNav.dataset.scrollBound) {
    desktopNav.dataset.scrollBound = "true";
    desktopNav.addEventListener("scroll", updateNavScrollControl, { passive: true });
  }
  requestAnimationFrame(updateNavScrollControl);
  if (!document.body.dataset.navScrollResizeBound) {
    document.body.dataset.navScrollResizeBound = "true";
    window.addEventListener("resize", updateNavScrollControl, { passive: true });
  }

  document.querySelectorAll("#practice .home-feature-subcard").forEach((card) => {
    card.setAttribute("role", "link");
    card.setAttribute("tabindex", "0");
    const openPractice = () => { window.location.href = "practice/index.html"; };
    card.addEventListener("click", openPractice);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openPractice(); }
    });
  });

  if (homeSectionObserver) homeSectionObserver.disconnect();
  const sections = document.querySelectorAll("#hero, #mock-exams, #practice, #videos, #study-materials, #membership");
  if (!sections.length) return;
  homeSectionObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      links.forEach((link) => link.classList.toggle("active", link.dataset.scrollSection === visible.target.id));
    },
    { rootMargin: "-20% 0px -58% 0px", threshold: [0.05, 0.3, 0.6] },
  );
  sections.forEach((section) => homeSectionObserver.observe(section));

}

function updateAuthNavigation() {
  document.querySelectorAll("[data-admin-link]").forEach((link) => {
    if (!isAdmin()) link.remove();
  });

  document.querySelectorAll("[data-account-link]").forEach((link) => {
    const labelText = currentUser ? "My Account" : "Account";
    const span = link.querySelector("span");
    if (span) {
      span.textContent = labelText;
    } else {
      link.innerHTML = `<i data-lucide="user"></i>${labelText}`;
    }
  });
}

function renderAIWriting() {
  if (!checkLearningAccess("#/ai-writing")) return;
  app.innerHTML = html`
    <section class="section">
      ${pageHeader("AI Assistant", "AI Writing Correction", "Submit German essays and written exercises for real-time AI feedback and grammar analysis.")}
      <div class="card card-body">
        <p class="muted">AI Writing Correction feature engine.</p>
      </div>
    </section>
  `;
}

function renderSpeaking() {
  if (!checkLearningAccess("#/speaking")) return;
  app.innerHTML = html`
    <section class="section">
      ${pageHeader("AI Assistant", "Speaking Practice", "Practice your spoken German with structured exam frames and voice evaluation.")}
      <div class="card card-body">
        <p class="muted">AI Speaking Practice feature engine.</p>
      </div>
    </section>
  `;
}

async function loadRouteData(path, parts) {
  const opensResources =
    path === "/resources" ||
    path === "/resources/study-materials" ||
    path === "/study-materials" ||
    (parts[0] === "resources" && parts[1]) ||
    (parts[0] === "checkout" && parts[1]) ||
    path === "/purchase" ||
    (parts[0] === "purchase" && parts[1]) ||
    path === "/admin/products";
  const opensVideos = path === "/videos" || path === "/admin/videos";
  const opensOrders =
    path === "/account" ||
    path === "/admin/orders" ||
    (parts[0] === "admin" && parts[1] === "orders" && parts[2]);

  if (opensResources) await loadProducts();
  if (opensVideos) await loadVideos();
  if (opensOrders) await loadOrders();
  if (path === "/admin/exam-materials") await loadExamMaterials();
  if (path === "/admin/analytics") await loadAnalyticsEvents();
}

async function router() {
  const path = location.hash.replace("#", "") || "/";
  const parts = path.split("/").filter(Boolean);
  document.body.classList.remove("account-chrome-hidden");

  if (currentUser && !profileIsComplete() && path !== "/profile-setup") {
    renderProfileSetup();
    setActiveNavigation(path);
    updateAuthNavigation();
    renderIcons();
    window.scrollTo(0, 0);
    app.focus();
    return;
  }

  await loadRouteData(path, parts);
  if ((location.hash.replace("#", "") || "/") !== path) return;

  if (path === "/") renderHome();
  else if (path === "/practice" || path === "/mock-exams") { window.location.href = "practice/index.html"; }
  else if (path === "/ai-writing") renderAIWriting();
  else if (path === "/speaking") renderSpeaking();
  else if (path === "/resources") renderResourcesHub();
  else if (path === "/resources/study-materials" || path === "/study-materials") renderResources();
  else if (parts[0] === "resources" && parts[1]) renderResourceDetail(parts[1]);
  else if (path === "/videos") renderVideos();
  else if (path === "/about") renderAbout();
  else if (path === "/contact") renderContact();
  else if (path === "/login") renderLogin("login");
  else if (path === "/register") renderLogin("register");
  else if (path === "/forgot-password") renderLogin("forgot");
  else if (path === "/profile-setup") renderProfileSetup();
  else if (path === "/account") renderAccount();
  else if (parts[0] === "admin" && parts[1] === "orders" && parts[2]) renderAdminOrderDetail(parts[2]);
  else if (path === "/admin" || path === "/admin/" || path === "/admin/dashboard") renderAdminDashboard();
  else if (path === "/admin/orders") renderAdminOrders();
  else if (path === "/admin/products") renderAdminProducts();
  else if (path === "/admin/analytics") renderAdminAnalytics();
  else if (path === "/admin/videos") renderAdminVideos();
  else if (path === "/admin/exam-materials") renderAdminExamMaterials();
  else if (path === "/admin/settings") renderAdminSettings();
  else if (parts[0] === "checkout" && parts[1]) renderPurchase(parts[1]);
  else if (path === "/purchase") renderPurchase(products[0].id);
  else if (parts[0] === "purchase" && parts[1]) renderPurchase(parts[1]);
  else if (path === "/success") renderSuccess();
  else renderNotFound();

  setActiveNavigation(path);
  updateAuthNavigation();
  attachCategoryTabs();
  attachResourceStore();
  attachVideoTabs();
  attachProductGalleries();
  attachFreeDownloads();
  attachLoginPriceLinks();
  attachHomeScrollNavigation();
  renderIcons();
  window.scrollTo(0, 0);
  app.focus();
  if (pendingHomeSection) {
    const sectionId = pendingHomeSection;
    pendingHomeSection = "";
    requestAnimationFrame(() => scrollToHomeSection(sectionId));
  }
}

async function startSite() {
  const tools = await getFirebaseTools();

  if (tools) {
    tools.authModule.onAuthStateChanged(tools.auth, async (user) => {
      currentUser = user;
      await ensureUserProfile(user);
      await router();
    });
  } else {
    await router();
  }
}

window.addEventListener("hashchange", router);
startSite();
