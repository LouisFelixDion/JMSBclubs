// JMSB Clubs website. Plain JS, no build step.
// Data: clubs.json (club list) + events.json (written by updater/run.py).
// Add ?sample=1 to the URL to load sample-events.json (fake data) instead of events.json.

(function () {
  "use strict";

  const NS = "not shown";
  const params = new URLSearchParams(location.search);
  const EVENTS_FILE = params.has("sample") ? "sample-events.json" : "events.json";
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const state = {
    clubs: [],
    events: [],
    mode: "list",      // "list" | "month"
    showPast: false,
    search: "",
    club: "",
    month: null,       // Date (1st of the month shown in month view)
  };

  const $ = (sel) => document.querySelector(sel);

  // ---------- helpers ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  const has = (v) => v && v.trim() && v.trim().toLowerCase() !== NS;
  const safeUrl = (u) => (/^https:\/\//i.test(u || "") ? u : null);

  // "2026-11-20T18:00" or "2026-11-20" -> local Date (null if unknown). hasTime tells if a time was given.
  function parseDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s || "");
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
    d.hasTime = !!m[4];
    return d;
  }
  const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function startOfToday() { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }
  function fmtTime(d) {
    return d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
  }
  function fmtDay(d) {
    return `${DAYS[d.getDay()]}, ${MONTHS_LONG[d.getMonth()]} ${d.getDate()}`;
  }
  function initials(name) {
    const short = name.split("(")[0].trim();
    const words = short.split(/\s+/);
    return (words.length > 1 ? words.map((w) => w[0]).join("") : short).slice(0, 4).toUpperCase();
  }
  // Split "A, B (Title, Firm), C" on commas that are not inside parentheses.
  const splitList = (s) => (has(s) ? s.split(/,(?![^()]*\))/).map((x) => x.trim()).filter(Boolean) : []);

  // ---------- rendering: events ----------
  function eventCard(e) {
    const d = e._date;
    const past = d && d < startOfToday();
    const meta = [];
    if (d && d.hasTime) meta.push(fmtTime(d));
    if (has(e.location)) meta.push(esc(e.location));
    const firms = splitList(e.firms);
    const speakers = splitList(e.guest_speakers);
    const url = safeUrl(e.post_url);
    return `
      <article class="event${past ? " past" : ""}">
        <div class="datebox">${d ? `<div class="m">${MONTHS[d.getMonth()]}</div><div class="d">${d.getDate()}</div>` : `<div class="m">Date</div><div class="d">?</div>`}</div>
        <div class="event-body">
          <h3>${esc(has(e.event_name) ? e.event_name : "Untitled event")}</h3>
          <a class="club-link" href="#club/${encodeURIComponent(e.ig_handle)}">${esc(e.club)}</a>
          ${meta.length ? `<div class="meta">${meta.map((m) => `<span>${m}</span>`).join("")}</div>` : ""}
          ${has(e.description) ? `<p>${esc(e.description)}</p>` : ""}
          ${firms.length ? `<div class="chips"><span class="label">Firms:</span>${firms.map((f) => `<span class="chip">${esc(f)}</span>`).join("")}</div>` : ""}
          ${speakers.length ? `<div class="chips"><span class="label">Speakers:</span>${speakers.map((f) => `<span class="chip">${esc(f)}</span>`).join("")}</div>` : ""}
          ${url ? `<a class="post-link" href="${esc(url)}" target="_blank" rel="noopener">See event on Instagram ↗</a>` : ""}
        </div>
      </article>`;
  }

  function filtered() {
    const q = state.search.toLowerCase();
    return state.events.filter((e) => {
      if (state.club && e.ig_handle !== state.club) return false;
      if (!q) return true;
      return [e.event_name, e.club, e.description, e.firms, e.guest_speakers, e.location].join(" ").toLowerCase().includes(q);
    });
  }

  // Events grouped by day; past days hidden unless showPast; unknown dates at the end.
  function listHtml(events, showPast) {
    const today = startOfToday();
    const dated = events.filter((e) => e._date && (showPast || e._date >= today));
    const tba = events.filter((e) => !e._date);
    if (!dated.length && !tba.length) return "";
    let html = "", lastKey = "";
    for (const e of dated) {
      const k = dayKey(e._date);
      if (k !== lastKey) { html += `<h2 class="day-heading">${fmtDay(e._date)}</h2>`; lastKey = k; }
      html += eventCard(e);
    }
    if (tba.length) html += `<h2 class="day-heading">Date to be announced</h2>` + tba.map(eventCard).join("");
    return html;
  }

  function renderList() {
    const html = listHtml(filtered(), state.showPast);
    $("#events-list").innerHTML = html || `<div class="empty">${state.club || state.search ? "No upcoming events match your filters." : "No upcoming events right now. The list updates daily from club Instagram posts."}</div>`;
  }

  function renderMonth() {
    const first = state.month;
    const y = first.getFullYear(), mo = first.getMonth();
    const start = new Date(y, mo, 1 - first.getDay());
    const byDay = {};
    for (const e of filtered()) if (e._date) (byDay[dayKey(e._date)] ||= []).push(e);
    const todayKey = dayKey(new Date());

    let cells = DAYS.map((d) => `<div class="dow">${d}</div>`).join("");
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      if (i >= 35 && d.getMonth() !== mo) break; // drop an empty 6th row
      const k = dayKey(d);
      const evs = byDay[k] || [];
      cells += `<div class="cell${d.getMonth() !== mo ? " other" : ""}${k === todayKey ? " today" : ""}">
        <span class="num">${d.getDate()}</span>
        ${evs.map((e) => `<button type="button" class="pill" data-day="${k}" title="${esc(e.event_name)}">${esc(e.event_name)}</button>`).join("")}
      </div>`;
    }
    $("#events-month").innerHTML = `
      <div class="month-nav">
        <button type="button" data-step="-1" aria-label="Previous month">‹</button>
        <strong>${MONTHS_LONG[mo]} ${y}</strong>
        <button type="button" data-step="1" aria-label="Next month">›</button>
      </div>
      <div class="grid">${cells}</div>
      <div id="month-detail"></div>`;
  }

  function showDay(key) {
    const evs = filtered().filter((e) => e._date && dayKey(e._date) === key);
    const d = parseDate(key);
    $("#month-detail").innerHTML = `<h2 class="day-heading">${fmtDay(d)}</h2>` + evs.map(eventCard).join("");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    $("#month-detail").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  function renderEvents() {
    const month = state.mode === "month";
    $("#events-list").hidden = month;
    $("#events-month").hidden = !month;
    $(".past-toggle").hidden = month;
    document.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("active", b.dataset.mode === state.mode));
    $("#toggle-past").textContent = state.showPast ? "Hide past events" : "Show past events";
    month ? renderMonth() : renderList();
  }

  // ---------- rendering: home ----------
  // Club logo: tries assets/clubs/<ig_handle>.jpg, then .png, .svg (or clubs.json "logo" if set).
  // If none loads, the initials placeholder stays.
  const LOGO_EXTS = ["jpg", "png", "svg"];
  function logoHtml(c, cls) {
    return `<span class="${cls}" data-logo="${esc(c.ig_handle)}"><span class="initials">${esc(initials(c.name))}</span></span>`;
  }
  // Probe each club's logo once, then show it in every placeholder for that club.
  function loadLogos(root) {
    for (const c of state.clubs) {
      const srcs = c.logo ? [c.logo] : LOGO_EXTS.map((x) => `assets/clubs/${c.ig_handle}.${x}`);
      let k = 0;
      const probe = new Image();
      probe.onload = () => root.querySelectorAll(`[data-logo="${CSS.escape(c.ig_handle)}"]`).forEach((el) => {
        el.innerHTML = `<img src="${esc(probe.src)}" alt="">`;
        el.classList.add("has-img");
      });
      probe.onerror = () => { if (++k < srcs.length) probe.src = srcs[k]; };
      probe.src = srcs[0];
    }
  }

  // Home: logo carousel in the hero (list drawn twice so the loop is seamless), next 3 events below.
  function renderHome() {
    const items = (hidden) => state.clubs.map((c) =>
      `<a class="logo-item" href="#club/${encodeURIComponent(c.ig_handle)}"${hidden ? ' aria-hidden="true" tabindex="-1"' : ""}>${logoHtml(c, "logo")}<span class="logo-name">${esc(c.name.split("(")[0].trim())}</span></a>`).join("");
    const track = $("#logo-track");
    if (!track.dataset.done) {
      track.innerHTML = `<div class="logo-set">${items(false)}</div><div class="logo-set">${items(true)}</div>`;
      loadLogos(track);
      track.dataset.done = "1";
    }
    const today = startOfToday();
    const next = state.events.filter((e) => e._date && e._date >= today).slice(0, 3);
    $("#home-events").innerHTML = next.length
      ? next.map(eventCard).join("")
      : `<div class="empty">No upcoming events right now. The list updates daily from club Instagram posts.</div>`;
  }

  // ---------- rendering: clubs ----------
  function upcomingCount(handle) {
    const today = startOfToday();
    return state.events.filter((e) => e.ig_handle === handle && (!e._date || e._date >= today)).length;
  }

  function renderClubs() {
    $("#clubs-grid").innerHTML = clubCards();
    loadLogos($("#clubs-grid"));
  }

  function clubCards() {
    return state.clubs.map((c) => {
      const n = upcomingCount(c.ig_handle);
      return `<a class="club-card" href="#club/${encodeURIComponent(c.ig_handle)}">
        ${logoHtml(c, "avatar")}
        <h3>${esc(c.name)}</h3>
        <div class="count">${n ? `${n} upcoming event${n > 1 ? "s" : ""}` : "No upcoming events"}</div>
      </a>`;
    }).join("");
  }

  // Instagram glyph (simple outline, inherits text color)
  const IG_ICON = `<svg class="ig-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none"/></svg>`;

  function renderClub(handle) {
    const c = state.clubs.find((x) => x.ig_handle === handle);
    const el = $("#view-club");
    if (!c) { el.innerHTML = `<div class="empty">Club not found. <a href="#clubs">See all clubs</a></div>`; return; }
    const evs = state.events.filter((e) => e.ig_handle === handle);
    const list = listHtml(evs, false);
    el.innerHTML = `
      <p><a href="#clubs">← All clubs</a></p>
      <div class="club-card">
        <div class="club-head">
          ${logoHtml(c, "avatar")}
          <div>
            <h1>${esc(c.name)}</h1>
            <a class="ig-link" href="https://www.instagram.com/${encodeURIComponent(c.ig_handle)}/" target="_blank" rel="noopener" aria-label="Instagram: @${esc(c.ig_handle)}">${IG_ICON}<span>@${esc(c.ig_handle)}</span></a>
          </div>
        </div>
        ${has(c.description) ? `<p class="club-desc">${esc(c.description)}</p>` : ""}
      </div>
      <h2>Upcoming events</h2>
      ${list || `<div class="empty">No upcoming events.</div>`}`;
    loadLogos(el);
  }

  // ---------- routing ----------
  function route() {
    const h = decodeURIComponent(location.hash.slice(1)) || "home";
    const [view, arg] = h.split("/");
    const v = ["home", "events", "clubs", "club"].includes(view) ? view : "home";
    if (v === "events" && (arg === "month" || arg === "list")) state.mode = arg;
    document.querySelectorAll(".view").forEach((s) => (s.hidden = s.id !== `view-${v}`));
    $("#hero-home").hidden = v !== "home";
    document.body.classList.toggle("home", v === "home");
    $("#hero-events").hidden = v !== "events";
    $("#hero-clubs").hidden = v !== "clubs";
    document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("active", a.dataset.tab === (v === "club" ? "clubs" : v)));
    if (v === "home") renderHome();
    if (v === "events") renderEvents();
    if (v === "clubs") renderClubs();
    if (v === "club") renderClub(arg);
    window.scrollTo(0, 0);
  }

  // ---------- events wiring ----------
  function wire() {
    $("#search").addEventListener("input", (e) => { state.search = e.target.value.trim(); renderEvents(); });
    $("#club-filter").addEventListener("change", (e) => { state.club = e.target.value; renderEvents(); });
    document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => { state.mode = b.dataset.mode; renderEvents(); }));
    $("#toggle-past").addEventListener("click", () => { state.showPast = !state.showPast; renderEvents(); });
    $("#events-month").addEventListener("click", (e) => {
      const step = e.target.closest("[data-step]");
      if (step) { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + +step.dataset.step, 1); renderMonth(); return; }
      const pill = e.target.closest("[data-day]");
      if (pill) showDay(pill.dataset.day);
    });
    window.addEventListener("hashchange", route);
  }

  // ---------- load ----------
  async function getJson(file) {
    const r = await fetch(file, { cache: "no-cache" });
    if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
    return r.json();
  }

  // Past events stay visible for up to 4 months (the updater drops older ones too; this is a safety net).
  const PAST_MONTHS = 4;

  async function init() {
    const now = new Date();
    state.month = new Date(now.getFullYear(), now.getMonth(), 1);
    const cutoff = startOfToday();
    cutoff.setMonth(cutoff.getMonth() - PAST_MONTHS);
    wire();
    try {
      const [clubs, data] = await Promise.all([getJson("clubs.json"), getJson(EVENTS_FILE)]);
      state.clubs = clubs.map((c) => ({ ...c, ig_handle: c.ig_handle.toLowerCase() })).sort((a, b) => a.name.localeCompare(b.name));
      state.events = (data.events || [])
        .map((e) => ({ ...e, ig_handle: (e.ig_handle || "").toLowerCase(), _date: parseDate(e.date_time) }))
        .filter((e) => !e._date || e._date >= cutoff)
        .sort((a, b) => (a._date && b._date ? a._date - b._date : a._date ? -1 : b._date ? 1 : 0));
      if (data.updated_at) {
        const u = new Date(data.updated_at);
        if (!isNaN(u)) $("#updated").textContent = `Last updated ${u.toLocaleDateString("en-CA", { month: "short", day: "numeric" })}.`;
      }
      $("#club-filter").innerHTML += state.clubs.map((c) => `<option value="${esc(c.ig_handle)}">${esc(c.name)}</option>`).join("");
    } catch (err) {
      console.error(err);
      $("#events-list").innerHTML = `<div class="empty">Could not load events. Try again later.</div>`;
    }
    route();
  }

  init();
})();
