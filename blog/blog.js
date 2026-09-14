/**
 * CocoGermany Blog — Interactive Logic (blog.js)
 * Standalone search, filter, reading progress bar, share buttons, and icon renderer.
 */

document.addEventListener("DOMContentLoaded", () => {
  initIcons();
  initReadingProgressBar();
  initBlogSearchAndFilter();
  initShareButtons();
});

function initIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

/**
 * Top reading progress bar for longform articles
 */
function initReadingProgressBar() {
  const progressBar = document.getElementById("reading-progress-bar");
  if (!progressBar) return;

  const updateProgress = () => {
    const article = document.querySelector(".article-layout") || document.body;
    const articleTop = article.offsetTop;
    const articleHeight = article.offsetHeight;
    const scrollY = window.scrollY;
    const windowHeight = window.innerHeight;

    if (scrollY < articleTop) {
      progressBar.style.width = "0%";
      return;
    }

    const progress = Math.min(100, Math.max(0, ((scrollY - articleTop) / (articleHeight - windowHeight)) * 100));
    progressBar.style.width = `${progress}%`;
  };

  window.addEventListener("scroll", updateProgress, { passive: true });
  updateProgress();
}

/**
 * Search & category filter on blog listing (index.html)
 */
function initBlogSearchAndFilter() {
  const grid = document.getElementById("articles-grid");
  const searchInput = document.getElementById("blog-search");
  const filterBtns = document.querySelectorAll("[data-blog-filter]");
  const countMeta = document.getElementById("articles-count-meta");
  if (!grid || typeof BLOG_ARTICLES === "undefined") return;

  let activeFilter = "All";

  const renderArticles = () => {
    const query = (searchInput ? searchInput.value : "").trim().toLowerCase();

    const filtered = BLOG_ARTICLES.filter((article) => {
      // 1. Category / Level Filter
      let matchesFilter = true;
      if (activeFilter !== "All") {
        matchesFilter =
          article.category === activeFilter ||
          article.level === activeFilter ||
          (article.tags && article.tags.includes(activeFilter)) ||
          (activeFilter === "A1" && article.level.includes("A1")) ||
          (activeFilter === "A2" && article.level.includes("A2")) ||
          (activeFilter === "B1" && article.level.includes("B1")) ||
          (activeFilter === "B2" && article.level.includes("B2"));
      }

      // 2. Search Query Filter
      let matchesQuery = true;
      if (query) {
        const searchable = `${article.title} ${article.excerpt} ${article.category} ${article.level} ${(article.tags || []).join(" ")}`.toLowerCase();
        matchesQuery = searchable.includes(query);
      }

      return matchesFilter && matchesQuery;
    });

    if (countMeta) {
      countMeta.textContent = `${filtered.length} article${filtered.length === 1 ? "" : "s"} available`;
    }

    if (!filtered.length) {
      grid.innerHTML = `
        <div class="blog-empty">
          <i data-lucide="book-open" style="width: 38px; height: 38px; color: var(--muted); margin-bottom: 12px;"></i>
          <h3>No articles found</h3>
          <p>Try adjusting your search query or switching filters.</p>
          <button class="filter-btn" type="button" id="reset-filters-btn">Clear Search & Filters</button>
        </div>
      `;
      const resetBtn = document.getElementById("reset-filters-btn");
      if (resetBtn) {
        resetBtn.addEventListener("click", () => {
          if (searchInput) searchInput.value = "";
          activeFilter = "All";
          filterBtns.forEach((b) => b.classList.toggle("active", b.dataset.blogFilter === "All"));
          renderArticles();
        });
      }
      initIcons();
      return;
    }

    grid.innerHTML = filtered
      .map(
        (article) => `
        <article class="article-card">
          <a class="article-card-image" href="${article.url}" aria-label="${article.title}">
            <img src="${article.coverImage}" alt="${article.title}" loading="lazy" />
          </a>
          <div class="article-card-body">
            <div class="article-badges">
              <span class="badge badge-brand">${article.category}</span>
              <span class="badge badge-teal">${article.level}</span>
            </div>
            <a href="${article.url}" style="text-decoration: none;">
              <h3 class="article-card-title">${article.title}</h3>
            </a>
            <p class="article-card-excerpt">${article.excerpt}</p>
            <div class="article-card-footer">
              <span><i data-lucide="clock"></i> ${article.readTime}</span>
              <a class="article-card-link" href="${article.url}">
                Read Article <i data-lucide="arrow-right"></i>
              </a>
            </div>
          </div>
        </article>
      `
      )
      .join("");

    initIcons();
  };

  if (searchInput) {
    searchInput.addEventListener("input", renderArticles);
  }

  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      activeFilter = btn.dataset.blogFilter || "All";
      filterBtns.forEach((b) => b.classList.toggle("active", b === btn));
      renderArticles();
    });
  });

  renderArticles();
}

/**
 * Social share & link copy
 */
function initShareButtons() {
  document.querySelectorAll("[data-share]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const type = btn.dataset.share;
      const url = window.location.href;
      const title = document.title;

      if (type === "copy") {
        try {
          await navigator.clipboard.writeText(url);
          const origHtml = btn.innerHTML;
          btn.innerHTML = `<i data-lucide="check" style="color: var(--emerald);"></i>`;
          initIcons();
          setTimeout(() => {
            btn.innerHTML = origHtml;
            initIcons();
          }, 2000);
        } catch {
          prompt("Copy link:", url);
        }
      } else if (type === "share") {
        if (navigator.share) {
          navigator.share({ title, url }).catch(() => {});
        } else {
          window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`, "_blank");
        }
      } else if (type === "whatsapp") {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(title + " - " + url)}`, "_blank");
      } else if (type === "send") {
        window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent("Check out this German exam guide: " + url)}`;
      }
    });
  });
}
