/* appdash — vanilla JS dashboard renderer */
(() => {
  "use strict";

  const CONFIG_URL = "./apps.json";
  const HEALTH_TIMEOUT_MS = 4000;
  const HEALTH_REFRESH_MS = 60_000;

  const state = {
    config: null,
    activeCategory: "all",
    query: "",
  };

  const $ = (sel) => document.querySelector(sel);

  // ---------- Boot ----------
  loadConfig().catch((err) => {
    console.error(err);
    $("#main").innerHTML = `<div class="empty">Failed to load <code>apps.json</code>.<br><small>${escapeHtml(
      err.message,
    )}</small></div>`;
    $("#footer-status").textContent = "config error";
  });

  async function loadConfig() {
    const res = await fetch(CONFIG_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} loading ${CONFIG_URL}`);
    const cfg = await res.json();
    state.config = normalize(cfg);
    applyBranding();
    renderCategoryFilter();
    render();
    bindEvents();
    runHealthChecks();
    setInterval(runHealthChecks, HEALTH_REFRESH_MS);
  }

  function normalize(cfg) {
    cfg.title ||= "Dashboard";
    cfg.subtitle ||= "";
    cfg.categories ||= [];
    cfg.apps ||= [];
    cfg.apps.forEach((a, i) => {
      a.id ||= `app-${i}`;
      a.urls ||= [];
      a.statusEl = null;
    });
    return cfg;
  }

  // ---------- Branding ----------
  function applyBranding() {
    const { title, subtitle, brand, repoUrl } = state.config;
    $("#brand-title").textContent = title;
    $("#brand-subtitle").textContent = subtitle || `${state.config.apps.length} apps`;
    document.title = title;
    const logoEl = $("#brand-logo");
    if (brand?.logoUrl) {
      logoEl.innerHTML = `<img src="${escapeAttr(brand.logoUrl)}" alt="">`;
    } else if (brand?.initial) {
      logoEl.textContent = brand.initial.slice(0, 2);
    }
    // else: keep the default inline SVG mark from index.html
    if (brand?.gradient) {
      logoEl.style.background = brand.gradient;
    }
    if (repoUrl) {
      $("#repo-link").href = repoUrl;
    }
  }

  // ---------- Filter pills ----------
  function renderCategoryFilter() {
    const wrap = $("#category-filter");
    const cats = [{ id: "all", name: "All" }, ...state.config.categories];
    wrap.innerHTML = cats
      .map(
        (c) =>
          `<button data-cat="${c.id}" class="${c.id === state.activeCategory ? "active" : ""}">${escapeHtml(
            c.name,
          )}</button>`,
      )
      .join("");
    wrap.querySelectorAll("button").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.activeCategory = btn.dataset.cat;
        wrap.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
        render();
      }),
    );
  }

  function bindEvents() {
    $("#search-input").addEventListener("input", (e) => {
      state.query = e.target.value.trim().toLowerCase();
      render();
    });
  }

  // ---------- Render ----------
  function render() {
    const main = $("#main");
    const cats = state.config.categories;
    const filtered = state.config.apps.filter(matchesFilters);

    if (filtered.length === 0) {
      main.innerHTML = `<div class="empty">No apps match your filters.</div>`;
      return;
    }

    const sections = cats
      .filter((c) => state.activeCategory === "all" || c.id === state.activeCategory)
      .map((cat) => {
        const apps = filtered.filter((a) => a.category === cat.id);
        if (apps.length === 0) return "";
        return `
          <section class="category" data-category="${cat.id}">
            <div class="category-header">
              <h2>${escapeHtml(cat.name)}</h2>
              <span class="count">${apps.length}</span>
              ${cat.description ? `<span class="desc">${escapeHtml(cat.description)}</span>` : ""}
            </div>
            <div class="grid">${apps.map(renderCard).join("")}</div>
          </section>`;
      })
      .join("");

    // Apps without a matching category
    const orphan = filtered.filter((a) => !cats.find((c) => c.id === a.category));
    const orphanSection =
      orphan.length === 0
        ? ""
        : `<section class="category">
            <div class="category-header"><h2>Other</h2><span class="count">${orphan.length}</span></div>
            <div class="grid">${orphan.map(renderCard).join("")}</div>
          </section>`;

    main.innerHTML = sections + orphanSection;

    // Re-bind status DOM refs
    state.config.apps.forEach((app) => {
      app.statusEl = document.querySelector(`[data-status-for="${cssEscape(app.id)}"]`);
    });

    updateFooter();
  }

  function matchesFilters(app) {
    if (state.activeCategory !== "all" && app.category !== state.activeCategory) return false;
    if (!state.query) return true;
    const hay = `${app.name} ${app.description || ""} ${(app.tags || []).join(" ")} ${app.urls
      .map((u) => u.url)
      .join(" ")}`.toLowerCase();
    return hay.includes(state.query);
  }

  function renderCard(app) {
    const primary = app.urls[0]?.url || "#";
    const icon = renderIcon(app);
    const status =
      app.health
        ? `<span class="status-dot" data-status="checking" data-status-for="${escapeHtml(app.id)}" title="checking…"></span>`
        : "";
    const urls = app.urls
      .map(
        (u) => `
          <a class="url-pill" href="${escapeHtml(u.url)}" target="_blank" rel="noopener" title="${escapeHtml(u.url)}">
            ${escapeHtml(u.label || "Open")}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 17L17 7M9 7h8v8"/>
            </svg>
          </a>`,
      )
      .join("");

    return `
      <div class="card" data-app="${escapeHtml(app.id)}">
        <div class="card-top">
          <div class="card-icon" style="${iconStyle(app)}">${icon}</div>
          <div class="card-meta">
            <h3 class="card-name">
              <a href="${escapeHtml(primary)}" target="_blank" rel="noopener">${escapeHtml(app.name)}</a>
              ${status}
            </h3>
            ${app.description ? `<p class="card-desc">${escapeHtml(app.description)}</p>` : ""}
          </div>
        </div>
        <div class="card-urls">${urls}</div>
      </div>`;
  }

  function renderIcon(app) {
    if (!app.icon) return escapeHtml((app.name[0] || "?").toUpperCase());
    if (app.icon.startsWith("img:"))
      return `<img src="${escapeHtml(app.icon.slice(4))}" alt="" style="width:24px;height:24px;border-radius:6px;object-fit:cover">`;
    // Plain text/emoji
    return escapeHtml(app.icon);
  }

  function iconStyle(app) {
    if (!app.color) return "";
    return `background:${app.color}26;border-color:${app.color}55;color:${app.color}`;
  }

  function updateFooter() {
    const apps = state.config.apps;
    const checked = apps.filter((a) => a.health);
    const online = checked.filter((a) => a._status === "online").length;
    const offline = checked.filter((a) => a._status === "offline").length;
    const total = apps.length;
    $("#footer-status").textContent = checked.length
      ? `${total} apps · ${online} online · ${offline} offline · ${
          checked.length - online - offline
        } unknown`
      : `${total} apps`;
  }

  // ---------- Health checks ----------
  async function runHealthChecks() {
    const apps = state.config.apps.filter((a) => a.health);
    await Promise.all(apps.map(checkOne));
    updateFooter();
  }

  async function checkOne(app) {
    const h = app.health;
    if (!h?.url) return;
    setStatus(app, "checking", "checking…");

    const url = h.url;
    const expect = Array.isArray(h.expect) ? h.expect : null;
    const useNoCors = !!h.noCors || (!isSameOrigin(url) && !expect);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: h.method || "GET",
        mode: useNoCors ? "no-cors" : "cors",
        cache: "no-store",
        redirect: "follow",
        signal: ctrl.signal,
        credentials: "omit",
      });
      clearTimeout(timer);

      // no-cors → opaque; we can't read status, but reaching here means TCP+TLS worked
      if (useNoCors) {
        setStatus(app, "online", "reachable (opaque)");
        return;
      }

      const ok = expect ? expect.includes(res.status) : res.ok;
      setStatus(app, ok ? "online" : "offline", `HTTP ${res.status}`);
    } catch (err) {
      clearTimeout(timer);
      setStatus(app, "offline", err.name === "AbortError" ? "timeout" : err.message);
    }
  }

  function setStatus(app, status, title) {
    app._status = status;
    if (app.statusEl) {
      app.statusEl.dataset.status = status;
      app.statusEl.title = title;
    }
  }

  function isSameOrigin(url) {
    try {
      const u = new URL(url, location.href);
      return u.origin === location.origin;
    } catch {
      return false;
    }
  }

  // ---------- Utils ----------
  function escapeAttr(s) {
    return String(s ?? "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function cssEscape(s) {
    return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }
})();
