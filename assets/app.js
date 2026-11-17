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
  const EVENT_TYPES = [
    { value: "seminar", label: "Seminars", keywords: ["seminar", "webinar", "conference"] },
    { value: "workshop", label: "Workshops", keywords: ["workshop", "bootcamp", "training", "crash course"] },
    { value: "speaker-series", label: "Speaker series", keywords: ["speaker", "panel", "fireside", "keynote", "guest talk"] },
    { value: "career-event", label: "Career events", keywords: ["career fair", "internship", "recruiting", "recruitment", "info session", "firm visit"] },
    { value: "club-recruiting", label: "Club recruiting", keywords: ["club recruiting", "join our team", "committee recruitment", "applications open"] },
    { value: "networking", label: "Networking", keywords: ["networking", "networking night", "mixer"] },
    { value: "competition", label: "Competitions", keywords: ["competition", "case night", "pitch night", "challenge"] },
    { value: "social-community", label: "Social & community", keywords: ["social", "food drive", "fundraiser", "charity", "community service"] },
  ];
  const CLUB_QUESTIONS = [
    {
      prompt: "What do you want to explore?",
      options: [
        { label: "Finance, accounting or real estate", tags: ["finance", "accounting", "real-estate"] },
        { label: "Marketing or sports", tags: ["marketing", "sports"] },
        { label: "Technology, data or operations", tags: ["technology", "analytics", "supply-chain"] },
        { label: "People, management or consulting", tags: ["hr", "management", "consulting"] },
        { label: "Entrepreneurship or sustainability", tags: ["entrepreneurship", "sustainability", "impact"] },
        { label: "International experiences or community", tags: ["international", "culture", "community"] },
      ],
    },
    {
      prompt: "How do you want to get involved?",
      options: [
        { label: "Career events and networking", tags: ["career", "networking"] },
        { label: "Cases and competitions", tags: ["cases", "competition"] },
        { label: "Build projects", tags: ["projects", "entrepreneurship"] },
        { label: "Community and service", tags: ["community", "service", "impact"] },
        { label: "Leadership and mentorship", tags: ["leadership", "mentorship"] },
      ],
    },
    {
      prompt: "What matters most to you?",
      options: [
        { label: "Developing career direction", tags: ["career", "networking"] },
        { label: "Competing with a team", tags: ["cases", "competition"] },
        { label: "Creating something practical", tags: ["projects", "entrepreneurship"] },
        { label: "Making a positive impact", tags: ["impact", "sustainability", "service"] },
        { label: "Finding a student community", tags: ["community", "culture", "leadership"] },
      ],
    },
  ];

  const state = {
    clubs: [],
    events: [],
    mode: "list",      // "list" | "month"
    showPast: false,
    search: "",
    clubFilters: null,
    typeFilters: null,
    month: null,       // Date (1st of the month shown in month view)
    expandedDays: new Set(),
    clubQuiz: { started: false, step: 0, answers: [] },
  };
  let homeSnapActive = false;
  let homeTouchStart = null;
  let filterDrag = null;
  let suppressFilterClick = false;

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
  function eventTypeFor(event) {
    const explicit = String(event.event_type || "").trim().toLowerCase();
    const direct = EVENT_TYPES.find((type) => type.value === explicit || type.label.toLowerCase() === explicit);
    if (direct) return direct.value;
    const text = [event.event_name, event.description].join(" ").toLowerCase();
    return EVENT_TYPES.find((type) => type.keywords.some((keyword) => text.includes(keyword)))?.value || "other";
  }
  const HOME_EVENT_ICONS = {
    calendar: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>`,
    clock: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
    location: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>`,
  };

  // ---------- rendering: events ----------
  function eventCard(e) {
    const d = e._date;
    const past = d && d < startOfToday();
    const club = state.clubs.find((c) => c.ig_handle === e.ig_handle);
    const clubName = club?.full_name || club?.name || e.club;
    const firms = splitList(e.firms);
    const speakers = splitList(e.guest_speakers);
    const url = safeUrl(e.post_url);
    const image = safeUrl(e.image_url);
    return `
      <article class="event-list-card${past ? " past" : ""}">
        <div class="event-list-media">
          ${image ? `<img src="${esc(image)}" alt="Event post for ${esc(e.event_name)}">` : `<div class="event-list-placeholder"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.5" cy="6.5" r="1"></circle></svg><span>Event image</span></div>`}
        </div>
        <div class="event-list-body">
          <h3>${esc(has(e.event_name) ? e.event_name : "Untitled event")}</h3>
          <a class="club-link" href="#club/${encodeURIComponent(e.ig_handle)}">${esc(clubName)}</a>
          <div class="event-list-meta">
            ${d ? `<span>${HOME_EVENT_ICONS.calendar}${esc(fmtDay(d))}</span>` : ""}
            ${d?.hasTime ? `<span>${HOME_EVENT_ICONS.clock}${esc(fmtTime(d))}</span>` : ""}
            ${has(e.location) ? `<span>${HOME_EVENT_ICONS.location}${esc(e.location)}</span>` : ""}
          </div>
          ${has(e.description) ? `<p class="event-list-description">${esc(e.description)}</p>` : ""}
          <div class="event-list-details">
            ${firms.length ? `<p><strong>Firms:</strong> ${firms.map(esc).join(", ")}</p>` : ""}
            ${speakers.length ? `<p><strong>Speakers:</strong> ${speakers.map(esc).join(", ")}</p>` : ""}
          </div>
          ${url ? `<a class="event-list-link" href="${esc(url)}" target="_blank" rel="noopener">See event on Instagram <span aria-hidden="true">↗</span></a>` : ""}
        </div>
      </article>`;
  }

  function homeEventCard(e) {
    const d = e._date;
    const club = state.clubs.find((c) => c.ig_handle === e.ig_handle);
    const parentheticalName = club?.name?.match(/^[^(]+\(([^)]+)\)$/)?.[1];
    const clubName = club?.full_name || parentheticalName || club?.name || e.club;
    const firms = splitList(e.firms);
    const speakers = splitList(e.guest_speakers);
    const url = safeUrl(e.post_url);
    return `
      <article class="home-event-card">
        <div class="home-event-top">
          <a class="home-event-club-logo" href="#club/${encodeURIComponent(e.ig_handle)}" aria-label="${esc(clubName)}">
            ${club ? logoHtml(club, "home-event-logo") : `<span class="home-event-logo"><span class="initials">${esc(initials(clubName))}</span></span>`}
          </a>
          <div class="home-event-heading">
            <h3>${esc(has(e.event_name) ? e.event_name : "Untitled event")}</h3>
            <a class="club-link" href="#club/${encodeURIComponent(e.ig_handle)}">${esc(clubName)}</a>
          </div>
        </div>
        <div class="home-event-meta">
          ${d ? `<span>${HOME_EVENT_ICONS.calendar}${esc(fmtDay(d))}</span>` : ""}
          ${d?.hasTime ? `<span>${HOME_EVENT_ICONS.clock}${esc(fmtTime(d))}</span>` : ""}
          ${has(e.location) ? `<span>${HOME_EVENT_ICONS.location}${esc(e.location)}</span>` : ""}
        </div>
        ${has(e.description) ? `<p class="home-event-description">${esc(e.description)}</p>` : ""}
        <div class="home-event-details">
          ${firms.length ? `<p><strong>Firms:</strong> ${firms.map(esc).join(", ")}</p>` : ""}
          ${speakers.length ? `<p><strong>Speakers:</strong> ${speakers.map(esc).join(", ")}</p>` : ""}
        </div>
        ${url ? `<a class="home-event-link" href="${esc(url)}" target="_blank" rel="noopener">See event on Instagram <span aria-hidden="true">↗</span></a>` : ""}
      </article>`;
  }

  function filtered() {
    const q = state.search.toLowerCase();
    return state.events.filter((e) => {
      if (state.clubFilters !== null && !state.clubFilters.includes(e.ig_handle)) return false;
      if (state.typeFilters !== null && !state.typeFilters.includes(e._eventType)) return false;
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
    const groups = [];
    let current = null;
    for (const e of dated) {
      const k = dayKey(e._date);
      if (!current || current.key !== k) {
        current = { key: k, title: fmtDay(e._date), events: [] };
        groups.push(current);
      }
      current.events.push(e);
    }
    if (tba.length) groups.push({ key: "tba", title: "Date to be announced", events: tba });
    return groups.map((group) => `<section class="event-day-group"><h2 class="day-heading">${esc(group.title)}</h2><div class="event-list-grid">${group.events.map(eventCard).join("")}</div></section>`).join("");
  }

  function renderList() {
    const html = listHtml(filtered(), state.showPast);
    $("#events-list").innerHTML = html || `<div class="empty">${state.clubFilters !== null || state.typeFilters !== null || state.search ? "No upcoming events match your filters." : "No upcoming events right now. The list updates daily from club Instagram posts."}</div>`;
  }

  function monthRowHeights(grid) {
    return [...grid.children].filter((_, index) => index % 7 === 0).map((element) => element.getBoundingClientRect().height);
  }

  function animateMonthRows(grid, oldRows) {
    if (!oldRows || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const newRows = monthRowHeights(grid);
    if (oldRows.length !== newRows.length || oldRows.every((height, index) => Math.abs(height - newRows[index]) < 1)) return;
    grid.classList.add("is-row-animating");
    grid.style.gridTemplateRows = oldRows.map((height) => `${height}px`).join(" ");
    grid.getBoundingClientRect();
    requestAnimationFrame(() => {
      grid.style.gridTemplateRows = newRows.map((height) => `${height}px`).join(" ");
    });
    const cleanup = () => {
      grid.classList.remove("is-row-animating");
      grid.style.removeProperty("grid-template-rows");
    };
    grid.addEventListener("transitionend", cleanup, { once: true });
    window.setTimeout(cleanup, 500);
  }

  function renderMonth(animateRows = false) {
    const oldGrid = $("#events-month .grid");
    const oldRows = animateRows && oldGrid ? monthRowHeights(oldGrid) : null;
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
      const expanded = state.expandedDays.has(k);
      const visibleEvents = expanded ? evs : evs.slice(0, 2);
      const extraCount = Math.max(0, evs.length - visibleEvents.length);
      const hiddenEvents = expanded ? [] : evs.slice(visibleEvents.length);
      cells += `<div class="cell${d.getMonth() !== mo ? " other" : ""}${k === todayKey ? " today" : ""}${evs.length ? " has-events" : ""}${extraCount ? " many-events" : ""}${expanded ? " expanded-day" : ""}">
        <span class="num">${d.getDate()}</span>
        <div class="cell-events">${visibleEvents.map((e) => {
          const club = state.clubs.find((c) => c.ig_handle === e.ig_handle);
          const shortName = club?.short_name || club?.name || e.club;
          const time = e._date?.hasTime ? fmtTime(e._date) : "";
          return `<button type="button" class="calendar-event" data-day="${k}" data-event-preview="${e._previewId}" title="${esc(e.event_name)}">
            ${club ? logoHtml(club, "calendar-event-logo") : `<span class="calendar-event-logo"><span class="initials">${esc(initials(shortName))}</span></span>`}
            <span class="calendar-event-copy">
              <span class="calendar-event-title">${esc(e.event_name)}</span>
              <span class="calendar-event-meta">${esc(shortName)}${time ? ` · ${esc(time)}` : ""}</span>
            </span>
          </button>`;
        }).join("")}${extraCount ? `<div class="calendar-more-row"><span class="calendar-hidden-logos" aria-hidden="true">${hiddenEvents.map((event) => {
          const hiddenClub = state.clubs.find((club) => club.ig_handle === event.ig_handle);
          return hiddenClub ? logoHtml(hiddenClub, "calendar-hidden-logo") : "";
        }).join("")}</span><button type="button" class="calendar-more" data-expand-day="${k}">View ${extraCount} more <span aria-hidden="true">↓</span></button></div>` : expanded && evs.length > 2 ? `<button type="button" class="calendar-more calendar-less" data-collapse-day="${k}">Show less <span aria-hidden="true">↑</span></button>` : ""}</div>
      </div>`;
    }
    $("#events-month").innerHTML = `
      <section class="calendar-shell" aria-label="${MONTHS_LONG[mo]} ${y} calendar">
        <div class="month-nav">
          <div><strong>${MONTHS_LONG[mo]} <span>${y}</span></strong></div>
          <div class="month-buttons">
            <button type="button" data-step="-1" aria-label="Previous month"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg></button>
            <button type="button" data-step="1" aria-label="Next month"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg></button>
          </div>
        </div>
        <div class="grid">${cells}</div>
      </section>
      <div id="month-detail"></div>`;
    loadLogos($("#events-month"));
    animateMonthRows($("#events-month .grid"), oldRows);
  }

  function eventPreviewHtml(event) {
    const club = state.clubs.find((c) => c.ig_handle === event.ig_handle);
    const clubName = club?.full_name || club?.name || event.club;
    const image = safeUrl(event.image_url);
    const date = event._date;
    const firms = splitList(event.firms);
    const speakers = splitList(event.guest_speakers);
    return `
      <div class="event-preview-media">
        ${image ? `<img src="${esc(image)}" alt="Event post for ${esc(event.event_name)}">` : `<div class="event-preview-placeholder"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.5" cy="6.5" r="1"></circle></svg><span>Event image</span></div>`}
      </div>
      <div class="event-preview-body">
        <span class="event-preview-club">${esc(clubName)}</span>
        <h3>${esc(has(event.event_name) ? event.event_name : "Untitled event")}</h3>
        <div class="event-preview-facts">
          ${date ? `<span>${HOME_EVENT_ICONS.calendar}${esc(fmtDay(date))}</span>` : ""}
          ${date?.hasTime ? `<span>${HOME_EVENT_ICONS.clock}${esc(fmtTime(date))}</span>` : ""}
          ${has(event.location) ? `<span>${HOME_EVENT_ICONS.location}${esc(event.location)}</span>` : ""}
        </div>
        ${has(event.description) ? `<p>${esc(event.description)}</p>` : ""}
        ${firms.length ? `<p class="event-preview-detail"><strong>Firms:</strong> ${firms.map(esc).join(", ")}</p>` : ""}
        ${speakers.length ? `<p class="event-preview-detail"><strong>Speakers:</strong> ${speakers.map(esc).join(", ")}</p>` : ""}
      </div>`;
  }

  function showEventPreview(button) {
    const event = state.events.find((item) => item._previewId === Number(button.dataset.eventPreview));
    if (!event) return;
    const preview = $("#event-preview");
    preview.innerHTML = eventPreviewHtml(event);
    preview.hidden = false;
    const buttonRect = button.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    let left = buttonRect.right + 12;
    if (left + previewRect.width > window.innerWidth - 12) left = buttonRect.left - previewRect.width - 12;
    left = Math.max(12, Math.min(left, window.innerWidth - previewRect.width - 12));
    const top = Math.max(76, Math.min(buttonRect.top, window.innerHeight - previewRect.height - 12));
    preview.style.left = `${left}px`;
    preview.style.top = `${top}px`;
  }

  function hideEventPreview() {
    $("#event-preview").hidden = true;
  }

  function renderClubFilterPills() {
    const options = [{ ig_handle: "", short_name: "All clubs" }, ...state.clubs];
    $("#club-filter-pills").innerHTML = options.map((club) => {
      const active = club.ig_handle ? Array.isArray(state.clubFilters) && state.clubFilters.includes(club.ig_handle) : state.clubFilters === null;
      return `<button type="button" data-club-filter="${esc(club.ig_handle)}" class="${active ? "active" : ""}" aria-pressed="${active}">${esc(club.short_name || club.name)}</button>`;
    }).join("");
  }

  function renderTypeFilterPills() {
    const options = [{ value: "", label: "All types" }, ...EVENT_TYPES];
    $("#event-type-filter-pills").innerHTML = options.map((type) => {
      const active = type.value ? Array.isArray(state.typeFilters) && state.typeFilters.includes(type.value) : state.typeFilters === null;
      return `<button type="button" data-type-filter="${esc(type.value)}" class="${active ? "active" : ""}" aria-pressed="${active}">${esc(type.label)}</button>`;
    }).join("");
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
    document.querySelectorAll("[data-club-filter]").forEach((b) => {
      const active = b.dataset.clubFilter ? Array.isArray(state.clubFilters) && state.clubFilters.includes(b.dataset.clubFilter) : state.clubFilters === null;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", active);
    });
    document.querySelectorAll("[data-type-filter]").forEach((b) => {
      const active = b.dataset.typeFilter ? Array.isArray(state.typeFilters) && state.typeFilters.includes(b.dataset.typeFilter) : state.typeFilters === null;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", active);
    });
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
      `<a class="logo-item" href="#club/${encodeURIComponent(c.ig_handle)}"${hidden ? ' aria-hidden="true" tabindex="-1"' : ""}>${logoHtml(c, "logo")}<span class="logo-name">${esc(c.short_name || c.name)}</span></a>`).join("");
    const track = $("#logo-track");
    if (!track.dataset.done) {
      track.innerHTML = `<div class="logo-set">${items(false)}</div><div class="logo-set">${items(true)}</div>`;
      loadLogos(track);
      track.dataset.done = "1";
    }
    const today = startOfToday();
    const next = state.events.filter((e) => e._date && e._date >= today).slice(0, 3);
    const homeEvents = $("#home-events");
    homeEvents.innerHTML = next.length
      ? next.map(homeEventCard).join("")
      : `<div class="empty">No upcoming events right now. The list updates daily from club Instagram posts.</div>`;
    loadLogos(homeEvents);
  }

  // ---------- rendering: clubs ----------
  function upcomingCount(handle) {
    const today = startOfToday();
    return state.events.filter((e) => e.ig_handle === handle && (!e._date || e._date >= today)).length;
  }

  function renderClubs() {
    $("#clubs-grid").innerHTML = clubCards();
    loadLogos($("#clubs-grid"));
    applyClubQuizFilters();
  }

  function clubCards() {
    return state.clubs.map((c) => {
      const n = upcomingCount(c.ig_handle);
      return `<a class="club-card" data-club-handle="${esc(c.ig_handle)}" href="#club/${encodeURIComponent(c.ig_handle)}">
        ${logoHtml(c, "avatar")}
        <h3>${esc(c.short_name || c.name)}</h3>
        <div class="count">${n ? `${n} upcoming event${n > 1 ? "s" : ""}` : "No upcoming events"}</div>
      </a>`;
    }).join("");
  }

  function clubQuizScore(club) {
    const clubTags = new Set(Array.isArray(club.quiz_tags) ? club.quiz_tags : []);
    return state.clubQuiz.answers.reduce((score, answer) =>
      score + (answer.tags.some((tag) => clubTags.has(tag)) ? 1 : 0), 0);
  }

  function applyClubQuizFilters() {
    const cards = [...document.querySelectorAll("#clubs-grid .club-card")];
    const meta = $("#club-filter-meta");
    if (!state.clubQuiz.answers.length) {
      cards.forEach((card) => { card.hidden = false; });
      meta.hidden = true;
      return;
    }

    const scored = state.clubs.map((club) => ({ club, score: clubQuizScore(club) }));
    const required = state.clubQuiz.answers.length;
    let matches = scored.filter(({ score }) => score === required);
    let isFallback = false;
    if (!matches.length) {
      const best = Math.max(...scored.map(({ score }) => score));
      matches = scored.filter(({ score }) => score === best && score > 0);
      isFallback = true;
    }
    const handles = new Set(matches.map(({ club }) => club.ig_handle));
    cards.forEach((card) => { card.hidden = !handles.has(card.dataset.clubHandle); });
    meta.hidden = false;
    meta.innerHTML = `<strong>${matches.length} club${matches.length === 1 ? "" : "s"} ${state.clubQuiz.step === CLUB_QUESTIONS.length ? "matched" : "remaining"}</strong>${isFallback ? "<span>Closest available matches shown.</span>" : ""}<button type="button" data-club-quiz-reset><span aria-hidden="true">↻</span> Start over</button>`;
  }

  function renderClubFinder() {
    const finder = $("#club-finder");
    const content = $("#club-finder-content");
    const start = $("#club-finder-button");
    const previousHeight = finder.getBoundingClientRect().height;
    const finishResize = () => {
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const nextHeight = finder.getBoundingClientRect().height;
      if (Math.abs(nextHeight - previousHeight) < 2) return;
      finder.animate(
        [{ height: `${previousHeight}px` }, { height: `${nextHeight}px` }],
        { duration: 340, easing: "cubic-bezier(.22, 1, .36, 1)" }
      );
    };
    finder.classList.toggle("is-active", state.clubQuiz.started);
    finder.classList.toggle("is-complete", state.clubQuiz.step >= CLUB_QUESTIONS.length);
    start.hidden = state.clubQuiz.started;
    start.setAttribute("aria-expanded", String(state.clubQuiz.started));

    if (!state.clubQuiz.started) {
      content.innerHTML = `<h2 id="club-finder-title">Wondering which club to join?</h2>`;
      finishResize();
      return;
    }
    if (state.clubQuiz.step >= CLUB_QUESTIONS.length) {
      content.innerHTML = `<div class="club-finder-progress" style="--progress: 100%"><span aria-label="Complete">✓</span></div><h2 id="club-finder-title">Your closest matches</h2><p class="club-finder-answer-summary">Based on your ${state.clubQuiz.answers.length} answers. The matching clubs are shown below.</p>`;
      finishResize();
      return;
    }

    const question = CLUB_QUESTIONS[state.clubQuiz.step];
    const progress = Math.round(((state.clubQuiz.step + 1) / CLUB_QUESTIONS.length) * 100);
    content.innerHTML = `
      <div class="club-finder-progress" style="--progress: ${progress}%"><span>${state.clubQuiz.step + 1}/${CLUB_QUESTIONS.length}</span></div>
      <h2 id="club-finder-title">${esc(question.prompt)}</h2>
      <div class="club-finder-options">
        ${question.options.map((option, index) => `<button type="button" data-club-quiz-answer="${index}">${esc(option.label)}</button>`).join("")}
      </div>
      ${state.clubQuiz.step ? `<button class="club-finder-back" type="button" data-club-quiz-back><span aria-hidden="true">←</span> Back</button>` : ""}`;
    finishResize();
  }

  function resetClubQuiz() {
    state.clubQuiz = { started: false, step: 0, answers: [] };
    renderClubFinder();
    applyClubQuizFilters();
  }

  // Instagram glyph (simple outline, inherits text color)
  const IG_ICON = `<svg class="ig-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none"/></svg>`;

  function memberCards(c) {
    const members = Array.isArray(c.members) && c.members.length
      ? c.members
      : Array.from({ length: 10 }, () => ({ name: "Member name", role: "Role to be confirmed", placeholder: true }));
    return members.map((member) => {
      const name = has(member.name) ? member.name : "Member name";
      const role = has(member.role) ? member.role : "Role to be confirmed";
      return `<article class="member-card${member.placeholder ? " is-placeholder" : ""}">
        <span class="member-mark" aria-hidden="true">${member.placeholder ? "?" : esc(initials(name).slice(0, 2))}</span>
        <div>
          <h3>${esc(name)}</h3>
          <p>${esc(role)}</p>
        </div>
      </article>`;
    }).join("");
  }

  function updateTeamArrows() {
    const strip = $("#team-members");
    if (!strip) return;
    const left = $("[data-team-scroll='-1']");
    const right = $("[data-team-scroll='1']");
    const max = Math.max(0, strip.scrollWidth - strip.clientWidth);
    left.hidden = strip.scrollLeft <= 4;
    right.hidden = strip.scrollLeft >= max - 4 || max <= 4;
  }

  function renderClub(handle) {
    const c = state.clubs.find((x) => x.ig_handle === handle);
    const el = $("#view-club");
    if (!c) { el.innerHTML = `<div class="empty">Club not found. <a href="#clubs">See all clubs</a></div>`; return; }
    const evs = state.events.filter((e) => e.ig_handle === handle);
    const list = listHtml(evs, false);
    const description = has(c.description)
      ? esc(c.description)
      : `Club information is coming soon. Follow <strong>@${esc(c.ig_handle)}</strong> on Instagram for current updates and announcements.`;
    el.innerHTML = `
      <p class="club-back"><a href="#clubs"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg><span>All clubs</span></a></p>
      <div class="club-profile-grid">
        <section class="club-identity-card" aria-labelledby="club-title">
          <div class="club-head">
          ${logoHtml(c, "avatar")}
          <div>
              <p class="section-kicker">JMSB club</p>
              <h1 id="club-title">${esc(c.name)}</h1>
            <a class="ig-link" href="https://www.instagram.com/${encodeURIComponent(c.ig_handle)}/" target="_blank" rel="noopener" aria-label="Instagram: @${esc(c.ig_handle)}">${IG_ICON}<span>@${esc(c.ig_handle)}</span></a>
          </div>
        </div>
        </section>
        <section class="club-info-card" aria-labelledby="club-about-title">
          <p class="section-kicker">Information</p>
          <h2 id="club-about-title">About ${esc(c.name)}</h2>
          <p class="club-desc">${description}</p>
        </section>
      </div>
      <section class="club-team" aria-labelledby="club-team-title">
        <div class="club-section-head">
          <div>
            <p class="section-kicker">Leadership</p>
            <h2 id="club-team-title">Members &amp; roles</h2>
          </div>
        </div>
        <div class="team-carousel-shell">
          <button class="team-arrow team-arrow-left" type="button" data-team-scroll="-1" aria-label="Previous members" hidden>‹</button>
          <div class="member-strip" id="team-members" tabindex="0" aria-label="Club members">
            ${memberCards(c)}
          </div>
          <button class="team-arrow team-arrow-right" type="button" data-team-scroll="1" aria-label="Next members">›</button>
        </div>
      </section>
      <section class="club-events" aria-labelledby="club-events-title">
        <div class="club-section-head">
          <div>
            <p class="section-kicker">Calendar</p>
            <h2 id="club-events-title">Upcoming events</h2>
          </div>
          <a href="#events">See all events →</a>
        </div>
        ${list || `<div class="empty club-events-empty">No upcoming events.</div>`}
      </section>`;
    loadLogos(el);
    const strip = $("#team-members");
    strip.addEventListener("scroll", updateTeamArrows, { passive: true });
    requestAnimationFrame(updateTeamArrows);
  }

  // ---------- routing ----------
  function route() {
    const h = decodeURIComponent(location.hash.slice(1)) || "home";
    const [view, arg] = h.split("/");
    const v = ["home", "events", "clubs", "club", "join"].includes(view) ? view : "home";
    if (v === "events" && (arg === "month" || arg === "list")) state.mode = arg;
    document.querySelectorAll(".view").forEach((s) => (s.hidden = s.id !== `view-${v}`));
    $("#hero-home").hidden = v !== "home";
    document.body.classList.toggle("home", v === "home");
    $("#hero-events").hidden = v !== "events";
    $("#hero-clubs").hidden = v !== "clubs";
    $("#hero-join").hidden = v !== "join";
    document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("active", a.dataset.tab === (v === "club" ? "clubs" : v)));
    if (v === "home") renderHome();
    if (v === "events") renderEvents();
    if (v === "clubs") renderClubs();
    if (v === "club") renderClub(arg);
    window.scrollTo(0, 0);
  }

  // ---------- events wiring ----------
  function homeComingUpScrollTop() {
    const target = $("#view-home").getBoundingClientRect().top + window.scrollY - $(".site-header").offsetHeight - 8;
    return Math.max(0, Math.min(target, document.documentElement.scrollHeight - window.innerHeight));
  }

  function snapHomeToComingUp() {
    if ((location.hash.slice(1).split("/")[0] || "home") !== "home") return;
    const target = homeComingUpScrollTop();
    if (window.scrollY >= target - 6 || homeSnapActive) return;
    homeSnapActive = true;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: target, behavior: reduce ? "auto" : "smooth" });
    window.setTimeout(() => { homeSnapActive = false; }, reduce ? 0 : 800);
  }

  function snapHomeToHero() {
    if ((location.hash.slice(1).split("/")[0] || "home") !== "home" || homeSnapActive) return;
    const target = homeComingUpScrollTop();
    if (window.scrollY < target - 12 || window.scrollY > target + 100) return;
    homeSnapActive = true;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    window.setTimeout(() => { homeSnapActive = false; }, reduce ? 0 : 800);
  }

  function addDraggedFilter(button) {
    if (button.hasAttribute("data-club-filter")) {
      const club = button.dataset.clubFilter;
      if (!club) state.clubFilters = null;
      else {
        if (state.clubFilters === null) state.clubFilters = [];
        if (!state.clubFilters.includes(club)) state.clubFilters = [...state.clubFilters, club];
      }
    } else {
      const type = button.dataset.typeFilter;
      if (!type) state.typeFilters = null;
      else {
        if (state.typeFilters === null) state.typeFilters = [];
        if (!state.typeFilters.includes(type)) state.typeFilters = [...state.typeFilters, type];
      }
    }
    renderEvents();
  }

  function startFilterDrag(event) {
    if (event.pointerType === "touch" || event.button !== 0) return;
    const button = event.target.closest("[data-club-filter], [data-type-filter]");
    if (!button) return;
    filterDrag = {
      selector: button.hasAttribute("data-club-filter") ? "[data-club-filter]" : "[data-type-filter]",
      startButton: button,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      visited: new Set(),
    };
  }

  function moveFilterDrag(event) {
    if (!filterDrag) return;
    if (!filterDrag.moved && Math.hypot(event.clientX - filterDrag.startX, event.clientY - filterDrag.startY) > 6) {
      filterDrag.moved = true;
      document.body.classList.add("is-filter-dragging");
      filterDrag.visited.add(filterDrag.startButton);
      addDraggedFilter(filterDrag.startButton);
    }
    if (!filterDrag.moved) return;
    event.preventDefault();
    const button = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(filterDrag.selector);
    if (!button || filterDrag.visited.has(button)) return;
    filterDrag.visited.add(button);
    addDraggedFilter(button);
  }

  function endFilterDrag() {
    if (!filterDrag) return;
    if (filterDrag.moved) {
      suppressFilterClick = true;
      window.setTimeout(() => { suppressFilterClick = false; }, 0);
    }
    filterDrag = null;
    document.body.classList.remove("is-filter-dragging");
  }

  function wire() {
    $("#search").addEventListener("input", (e) => { state.search = e.target.value.trim(); renderEvents(); });
    $("#club-filter-pills").addEventListener("click", (e) => {
      if (suppressFilterClick) return;
      const button = e.target.closest("[data-club-filter]");
      if (!button) return;
      const club = button.dataset.clubFilter;
      if (!club) {
        state.clubFilters = state.clubFilters === null ? [] : null;
      } else if (state.clubFilters?.includes(club)) {
        state.clubFilters = state.clubFilters.filter((handle) => handle !== club);
      } else {
        state.clubFilters = [...(state.clubFilters || []), club];
      }
      renderEvents();
    });
    $("#event-type-filter-pills").addEventListener("click", (e) => {
      if (suppressFilterClick) return;
      const button = e.target.closest("[data-type-filter]");
      if (!button) return;
      const type = button.dataset.typeFilter;
      if (!type) {
        state.typeFilters = state.typeFilters === null ? [] : null;
      } else if (state.typeFilters?.includes(type)) {
        state.typeFilters = state.typeFilters.filter((value) => value !== type);
      } else {
        state.typeFilters = [...(state.typeFilters || []), type];
      }
      renderEvents();
    });
    $("#club-filter-pills").addEventListener("pointerdown", startFilterDrag);
    $("#event-type-filter-pills").addEventListener("pointerdown", startFilterDrag);
    document.addEventListener("pointermove", moveFilterDrag, { passive: false });
    document.addEventListener("pointerup", endFilterDrag);
    document.addEventListener("pointercancel", endFilterDrag);
    document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => { state.mode = b.dataset.mode; renderEvents(); }));
    $("#toggle-past").addEventListener("click", () => { state.showPast = !state.showPast; renderEvents(); });
    $("#events-month").addEventListener("click", (e) => {
      const step = e.target.closest("[data-step]");
      if (step) { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + +step.dataset.step, 1); renderMonth(); return; }
      const expand = e.target.closest("[data-expand-day]");
      if (expand) { state.expandedDays.add(expand.dataset.expandDay); renderMonth(true); return; }
      const collapse = e.target.closest("[data-collapse-day]");
      if (collapse) { state.expandedDays.delete(collapse.dataset.collapseDay); renderMonth(true); return; }
      const pill = e.target.closest("[data-day]");
      if (pill) showDay(pill.dataset.day);
    });
    $("#events-month").addEventListener("pointerover", (e) => {
      const eventButton = e.target.closest("[data-event-preview]");
      if (eventButton) showEventPreview(eventButton);
    });
    $("#events-month").addEventListener("pointerout", (e) => {
      if (e.target.closest("[data-event-preview]") && !e.relatedTarget?.closest?.("[data-event-preview]")) hideEventPreview();
    });
    $("#events-month").addEventListener("focusin", (e) => {
      const eventButton = e.target.closest("[data-event-preview]");
      if (eventButton) showEventPreview(eventButton);
    });
    $("#events-month").addEventListener("focusout", (e) => {
      if (e.target.closest("[data-event-preview]")) hideEventPreview();
    });
    $("#view-club").addEventListener("click", (e) => {
      const button = e.target.closest("[data-team-scroll]");
      if (!button) return;
      const strip = $("#team-members");
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      strip.scrollBy({ left: Number(button.dataset.teamScroll) * Math.max(260, strip.clientWidth * .8), behavior: reduce ? "auto" : "smooth" });
    });
    $("#club-finder-button").addEventListener("click", () => {
      state.clubQuiz.started = true;
      renderClubFinder();
    });
    $("#club-finder").addEventListener("click", (e) => {
      const answer = e.target.closest("[data-club-quiz-answer]");
      if (answer) {
        const question = CLUB_QUESTIONS[state.clubQuiz.step];
        state.clubQuiz.answers.push(question.options[Number(answer.dataset.clubQuizAnswer)]);
        state.clubQuiz.step += 1;
        renderClubFinder();
        applyClubQuizFilters();
        return;
      }
      if (e.target.closest("[data-club-quiz-back]")) {
        state.clubQuiz.answers.pop();
        state.clubQuiz.step = Math.max(0, state.clubQuiz.step - 1);
        renderClubFinder();
        applyClubQuizFilters();
      }
    });
    $("#club-filter-meta").addEventListener("click", (e) => {
      if (e.target.closest("[data-club-quiz-reset]")) resetClubQuiz();
    });
    window.addEventListener("wheel", (e) => {
      const target = homeComingUpScrollTop();
      const onHome = (location.hash.slice(1).split("/")[0] || "home") === "home";
      if (onHome && e.deltaY > 8 && window.scrollY < target - 6) {
        e.preventDefault();
        snapHomeToComingUp();
      } else if (onHome && e.deltaY < -8 && window.scrollY >= target - 12 && window.scrollY <= target + 100) {
        e.preventDefault();
        snapHomeToHero();
      }
    }, { passive: false });
    window.addEventListener("touchstart", (e) => { homeTouchStart = e.touches[0]?.clientY ?? null; }, { passive: true });
    window.addEventListener("touchend", (e) => {
      const end = e.changedTouches[0]?.clientY;
      if (homeTouchStart !== null && end !== undefined) {
        if (homeTouchStart - end > 28) snapHomeToComingUp();
        if (end - homeTouchStart > 28) snapHomeToHero();
      }
      homeTouchStart = null;
    }, { passive: true });
    window.addEventListener("resize", updateTeamArrows);
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
        .map((e, index) => ({ ...e, ig_handle: (e.ig_handle || "").toLowerCase(), _date: parseDate(e.date_time), _eventType: eventTypeFor(e), _previewId: index }))
        .filter((e) => !e._date || e._date >= cutoff)
        .sort((a, b) => (a._date && b._date ? a._date - b._date : a._date ? -1 : b._date ? 1 : 0));
      renderClubFilterPills();
      renderTypeFilterPills();
    } catch (err) {
      console.error(err);
      $("#events-list").innerHTML = `<div class="empty">Could not load events. Try again later.</div>`;
    }
    route();
  }

  init();
})();
