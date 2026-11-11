import { APP_NAME } from "./config.js";
import * as store from "./store.js";

/* ---------- Références ---------- */

const PLATFORMS = { tiktok: "TikTok", instagram: "Instagram", twitch: "Twitch" };
const STATUSES = [
  ["idee", "Idée"],
  ["tourne", "Tourné"],
  ["montage", "En montage"],
  ["pret", "Prêt"],
  ["programme", "Programmé"],
  ["publie", "Publié"],
];
const STATUS_LABEL = Object.fromEntries(STATUSES);
const ROUTES = [
  ["home", "Accueil", '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/>'],
  ["videos", "Vidéos", '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9.5 5 2.5-5 2.5z"/>'],
  ["calendar", "Calendrier", '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'],
  ["ideas", "Idées", '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'],
  ["todo", "Todo", '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8.5 12.5 2.5 2.5 4.5-5.5"/>'],
];
const HOME_BLOCKS = ["week", "figures", "today", "upcoming", "goals", "recent"];

const state = {
  db: { videos: [], ideas: [], tasks: [], goals: [], metrics: [] },
  user: null,
  route: "home",
  videoView: "list",
  platform: null,
  calMode: window.matchMedia("(max-width: 820px)").matches ? "week" : "month",
  calCursor: new Date(),
  tag: null,
  showDone: false,
  drag: null,
  loadedAt: 0,
};

const $ = (sel, root = document) => root.querySelector(sel);
const view = $("#view");
const modal = $("#modal");

/* ---------- Outils ---------- */

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const safeUrl = (value) => {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
};

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = (d) => addDays(d, -((d.getDay() + 6) % 7));
const todayKey = () => dayKey(new Date());
const toInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmt = {
  day: new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }),
  long: new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
  weekday: new Intl.DateTimeFormat("fr-FR", { weekday: "short" }),
  month: new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }),
  time: new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }),
  num: new Intl.NumberFormat("fr-FR"),
};
const when = (iso) => (iso ? `${fmt.day.format(new Date(iso))} à ${fmt.time.format(new Date(iso))}` : "Sans date");
const planKey = (v) => (v.planned_at ? dayKey(new Date(v.planned_at)) : null);

function toast(message, isError = false) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.toggle("error", isError);
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), isError ? 6000 : 2600);
}

async function run(work, successMessage) {
  try {
    const result = await work();
    if (successMessage) toast(successMessage);
    return result;
  } catch (err) {
    console.error(err);
    toast(`Enregistrement impossible : ${err.message}. Vérifie ta connexion puis réessaie.`, true);
    return null;
  }
}

/* ---------- Petits morceaux d'interface ---------- */

const icon = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const platformDots = (list = []) =>
  list.length
    ? `<span class="dots" aria-label="${esc(list.map((p) => PLATFORMS[p]).join(", "))}">${list
        .map((p) => `<i class="dot p-${esc(p)}"></i>`)
        .join("")}</span>`
    : "";

function steps(status) {
  const index = STATUSES.findIndex(([key]) => key === status);
  const cells = STATUSES.map((_, i) => `<i class="${i <= index ? "on" : ""}"></i>`).join("");
  return `<span class="steps ${status === "publie" ? "complete" : ""}" aria-hidden="true">${cells}</span>
    <span class="status-text">${esc(STATUS_LABEL[status] || status)}</span>`;
}

const firstPlatform = (v) => (v.platforms?.[0] ? `p-${v.platforms[0]}` : "");

function pill(v, draggable = false) {
  const time = v.planned_at ? `<time>${fmt.time.format(new Date(v.planned_at))}</time>` : "";
  // Un <div> quand l'élément se déplace : Firefox ne laisse pas glisser un <button>.
  const tag = draggable ? "div" : "button";
  const attrs = draggable ? 'role="button" tabindex="0" draggable="true" data-drag="video-date"' : 'type="button"';
  return `<${tag} ${attrs} class="pill ${firstPlatform(v)} ${v.status === "publie" ? "is-done" : ""}"
    data-action="edit-video" data-id="${esc(v.id)}" title="${esc(v.title)}">${time}${esc(v.title)}</${tag}>`;
}

const emptyState = (text, action, label) =>
  `<div class="empty"><p>${esc(text)}</p>${
    action ? `<button type="button" class="btn small" data-action="${action}">${esc(label)}</button>` : ""
  }</div>`;

const lateTasks = () => state.db.tasks.filter((t) => !t.done && t.due_on && t.due_on < todayKey());

/* ---------- Navigation ---------- */

function renderNav() {
  const late = lateTasks().length;
  const html = ROUTES.map(([key, label, paths]) => {
    const badge = key === "todo" && late ? `<span class="count" aria-label="${late} en retard">${late}</span>` : "";
    return `<button type="button" data-action="go" data-route="${key}" ${
      state.route === key ? 'aria-current="page"' : ""
    }>${icon(paths)}<span>${label}</span>${badge}</button>`;
  }).join("");
  $("#nav").innerHTML = html;
  $("#tabbar").innerHTML = html;
  $("#view-title").textContent = ROUTES.find(([key]) => key === state.route)[1];
  const addLabel = { ideas: "Nouvelle idée", todo: "Nouvelle tâche" }[state.route] || "Nouvelle vidéo";
  $("#quick-add").textContent = addLabel;
}

function render() {
  renderNav();
  const renderers = { home: renderHome, videos: renderVideos, calendar: renderCalendar, ideas: renderIdeas, todo: renderTodo };
  view.innerHTML = renderers[state.route]();
}

function go(route) {
  state.route = route;
  render();
  window.scrollTo({ top: 0 });
  try {
    history.replaceState(null, "", `#${route}`);
  } catch {
    /* navigation privée : sans importance */
  }
}

/* ---------- Accueil ---------- */

function homeOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem("home-order") || "[]");
    const valid = saved.filter((id) => HOME_BLOCKS.includes(id));
    return [...valid, ...HOME_BLOCKS.filter((id) => !valid.includes(id))];
  } catch {
    return [...HOME_BLOCKS];
  }
}

function streak() {
  const days = new Set(state.db.videos.filter((v) => v.status === "publie" && v.planned_at).map(planKey));
  let cursor = new Date();
  if (!days.has(dayKey(cursor))) cursor = addDays(cursor, -1);
  let count = 0;
  while (days.has(dayKey(cursor))) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

function figureFor(platform) {
  const rows = state.db.metrics
    .filter((m) => m.platform === platform)
    .sort((a, b) => a.recorded_on.localeCompare(b.recorded_on));
  const latest = rows.at(-1);
  if (!latest) return null;
  const before = (days) => {
    const limit = dayKey(addDays(fromKey(latest.recorded_on), -days));
    return rows.filter((m) => m.recorded_on <= limit).at(-1);
  };
  const delta = (days) => {
    const ref = before(days);
    return ref ? latest.followers - ref.followers : null;
  };
  return { latest, d7: delta(7), d28: delta(28) };
}

const deltaText = (value, label) => {
  if (value === null) return "";
  const cls = value > 0 ? "up" : value < 0 ? "down" : "";
  const sign = value > 0 ? "+" : "";
  return `<span class="delta ${cls}">${sign}${fmt.num.format(value)}</span> sur ${label}`;
};

const homeBlocks = {
  week() {
    const start = startOfWeek(new Date());
    const today = todayKey();
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const cells = days
      .map((d) => {
        const key = dayKey(d);
        const items = state.db.videos
          .filter((v) => planKey(v) === key)
          .sort((a, b) => a.planned_at.localeCompare(b.planned_at));
        return `<div class="day ${key === today ? "today" : ""}">
          <div class="day-name"><span>${esc(fmt.weekday.format(d))}</span><b>${d.getDate()}</b></div>
          ${items.map((v) => pill(v)).join("")}
        </div>`;
      })
      .join("");
    const count = streak();
    const streakText = count
      ? `${count} jour${count > 1 ? "s" : ""} d'affilée avec un contenu publié`
      : "Aucune série en cours";
    return panel("week", "Cette semaine", `<div class="week">${cells}</div>`, {
      full: true,
      extra: `<span class="muted small">${streakText}</span>
        <button type="button" class="btn small" data-action="go" data-route="calendar">Ouvrir le calendrier</button>`,
    });
  },

  figures() {
    const tiles = Object.entries(PLATFORMS)
      .map(([key, label]) => {
        const f = figureFor(key);
        const sub = f
          ? [deltaText(f.d7, "7 jours"), deltaText(f.d28, "28 jours")].filter(Boolean).join(", ") ||
            `Relevé du ${fmt.day.format(fromKey(f.latest.recorded_on))}`
          : "Aucun relevé";
        return `<div class="figure p-${key}">
          <div class="figure-name"><i class="dot p-${key}"></i>${label}</div>
          <div class="figure-value">${f ? fmt.num.format(f.latest.followers) : "–"}</div>
          <div class="figure-sub">${f ? "abonnés. " : ""}${sub}</div>
        </div>`;
      })
      .join("");
    return panel("figures", "Mes chiffres", `<div class="figures">${tiles}</div>`, {
      extra: `<button type="button" class="btn small" data-action="edit-metrics">Mettre à jour</button>`,
    });
  },

  today() {
    const today = todayKey();
    const items = state.db.tasks
      .filter((t) => !t.done && t.due_on && t.due_on <= today)
      .sort((a, b) => a.due_on.localeCompare(b.due_on) || a.priority - b.priority);
    const body = items.length
      ? `<ul class="rows">${items.map(taskRow).join("")}</ul>`
      : emptyState("Rien à faire aujourd'hui.", "new-task", "Ajouter une tâche");
    return panel("today", "Tâches du jour", body, {
      extra: `<button type="button" class="btn small" data-action="go" data-route="todo">Tout voir</button>`,
    });
  },

  upcoming() {
    const now = new Date().toISOString();
    const items = state.db.videos
      .filter((v) => v.planned_at && v.planned_at >= now && v.status !== "publie")
      .sort((a, b) => a.planned_at.localeCompare(b.planned_at))
      .slice(0, 5);
    const body = items.length
      ? `<ul class="rows">${items.map(videoRow).join("")}</ul>`
      : emptyState("Aucun contenu planifié.", "new-video", "Planifier une vidéo");
    return panel("upcoming", "Prochains contenus", body);
  },

  goals() {
    const body = state.db.goals.length
      ? state.db.goals
          .map((g) => {
            const ratio = Math.max(0, Math.min(100, (Number(g.current_value) / Number(g.target_value)) * 100));
            return `<button type="button" class="row-main goal ${g.platform ? `p-${esc(g.platform)}` : ""}" data-action="edit-goal" data-id="${esc(g.id)}">
              <span class="goal-top"><span class="row-title">${esc(g.label)}</span>
              <span class="muted small">${fmt.num.format(g.current_value)} / ${fmt.num.format(g.target_value)}</span></span>
              <span class="bar"><i style="width:${ratio.toFixed(1)}%"></i></span>
            </button>`;
          })
          .join("")
      : emptyState("Fixe un objectif pour suivre ta progression, par exemple 1 000 followers Twitch.");
    return panel("goals", "Objectifs", body, {
      extra: `<button type="button" class="btn small" data-action="new-goal">Ajouter</button>`,
    });
  },

  recent() {
    const items = [...state.db.videos].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5);
    const body = items.length
      ? `<ul class="rows">${items.map(videoRow).join("")}</ul>`
      : emptyState("Tes vidéos en cours apparaîtront ici.", "new-video", "Créer une vidéo");
    return panel("recent", "Dernières vidéos travaillées", body);
  },
};

function panel(id, title, body, { full = false, extra = "" } = {}) {
  return `<section class="panel glass ${full ? "full" : ""}" data-block="${id}" draggable="true" data-drag="block">
    <div class="panel-head"><h2>${esc(title)}</h2>${extra}</div>${body}</section>`;
}

function videoRow(v) {
  const thumb = safeUrl(v.thumb_url);
  return `<li class="row">
    ${thumb ? `<img class="thumb" src="${esc(thumb)}" alt="" loading="lazy">` : ""}
    <button type="button" class="row-main" data-action="edit-video" data-id="${esc(v.id)}">
      <span class="row-title">${esc(v.title)}</span>
      <span class="row-sub">${platformDots(v.platforms)}<span>${esc(when(v.planned_at))}</span>${steps(v.status)}</span>
    </button></li>`;
}

function taskRow(t) {
  const video = t.video_id ? state.db.videos.find((v) => v.id === t.video_id) : null;
  const isLate = !t.done && t.due_on && t.due_on < todayKey();
  const due = t.due_on
    ? `<span class="${isLate ? "late" : ""}">${isLate ? "En retard, " : ""}${esc(fmt.day.format(fromKey(t.due_on)))}</span>`
    : "";
  return `<li class="row task ${t.done ? "is-done" : ""}">
    <span class="prio p${t.priority}"></span>
    <input type="checkbox" class="check" data-action="toggle-task" data-id="${esc(t.id)}" ${t.done ? "checked" : ""}
      aria-label="Terminer : ${esc(t.title)}">
    <button type="button" class="row-main" data-action="edit-task" data-id="${esc(t.id)}">
      <span class="row-title">${esc(t.title)}</span>
      <span class="row-sub">${due}${video ? `<span class="tag">${esc(video.title)}</span>` : ""}</span>
    </button></li>`;
}

function renderHome() {
  const hour = new Date().getHours();
  const hello = hour < 18 ? "Bonjour" : "Bonsoir";
  const date = fmt.long.format(new Date());
  return `<div class="home">
    <div class="hello"><h2>${hello}</h2><p class="muted">${esc(date.charAt(0).toUpperCase() + date.slice(1))}</p></div>
    ${homeOrder().map((id) => homeBlocks[id]()).join("")}
  </div>`;
}

/* ---------- Vidéos ---------- */

const filteredVideos = () =>
  state.db.videos.filter((v) => !state.platform || (v.platforms || []).includes(state.platform));

function platformFilter() {
  return `<button type="button" class="chip" data-action="filter-platform" data-platform="" aria-pressed="${!state.platform}">Toutes</button>
    ${Object.entries(PLATFORMS)
      .map(
        ([key, label]) =>
          `<button type="button" class="chip" data-action="filter-platform" data-platform="${key}" aria-pressed="${
            state.platform === key
          }"><i class="dot p-${key}"></i>${label}</button>`
      )
      .join("")}`;
}

function renderVideos() {
  const items = filteredVideos();
  const toolbar = `<div class="toolbar">
    <div class="segmented" role="group" aria-label="Affichage">
      <button type="button" data-action="video-view" data-view="list" aria-pressed="${state.videoView === "list"}">Liste</button>
      <button type="button" data-action="video-view" data-view="board" aria-pressed="${state.videoView === "board"}">Colonnes</button>
      <button type="button" data-action="go" data-route="calendar" aria-pressed="false">Calendrier</button>
    </div>
    ${platformFilter()}
  </div>`;

  if (!state.db.videos.length) {
    return `${toolbar}<div class="panel glass">${emptyState(
      "Aucune vidéo pour l'instant. Crée ta première fiche pour suivre un contenu de l'idée à la publication.",
      "new-video",
      "Créer une vidéo"
    )}</div>`;
  }

  if (state.videoView === "board") {
    const columns = STATUSES.map(([key, label]) => {
      const cards = items
        .filter((v) => v.status === key)
        .sort((a, b) => (a.planned_at || "9").localeCompare(b.planned_at || "9"))
        .map(
          (v) => `<div role="button" tabindex="0" class="card ${firstPlatform(v)}" data-action="edit-video" data-id="${esc(v.id)}"
            draggable="true" data-drag="video-status">
            <span class="card-title">${esc(v.title)}</span>
            <span class="card-meta">${platformDots(v.platforms)}<span>${esc(when(v.planned_at))}</span>
            ${v.kind === "stream" ? '<span class="tag stream">Stream</span>' : ""}
            ${v.sponsor ? `<span class="tag sponsor">${esc(v.sponsor)}</span>` : ""}</span>
          </div>`
        );
      return `<div class="column" data-drop="status" data-status="${key}">
        <div class="column-head">${label}<span>${cards.length}</span></div>${cards.join("")}</div>`;
    }).join("");
    return `${toolbar}<div class="board">${columns}</div>`;
  }

  const rows = [...items]
    .sort((a, b) => (a.planned_at || "9").localeCompare(b.planned_at || "9"))
    .map((v) => {
      const thumb = safeUrl(v.thumb_url);
      return `<tr class="clickable" data-action="edit-video" data-id="${esc(v.id)}">
        <td class="thumb-cell">${thumb ? `<img class="thumb" src="${esc(thumb)}" alt="" loading="lazy">` : '<span class="thumb"></span>'}</td>
        <td class="title-cell"><button type="button" class="row-main">${esc(v.title)}</button>
          ${v.kind === "stream" ? '<span class="tag stream">Stream</span>' : ""}
          ${v.sponsor ? `<span class="tag sponsor">${esc(v.sponsor)}</span>` : ""}</td>
        <td>${platformDots(v.platforms)} <span class="muted small">${esc((v.platforms || []).map((p) => PLATFORMS[p]).join(", "))}</span></td>
        <td>${steps(v.status)}</td>
        <td class="muted">${esc(when(v.planned_at))}</td>
      </tr>`;
    })
    .join("");
  const table = items.length
    ? `<table class="table"><thead><tr><th></th><th>Titre</th><th>Plateformes</th><th>Avancement</th><th>Date prévue</th></tr></thead><tbody>${rows}</tbody></table>`
    : emptyState("Aucune vidéo pour cette plateforme.");
  return `${toolbar}<div class="panel glass">${table}</div>`;
}

/* ---------- Calendrier ---------- */

function renderCalendar() {
  const cursor = state.calCursor;
  const isWeek = state.calMode === "week";
  const first = isWeek ? startOfWeek(cursor) : startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const monthDays = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const lead = (new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay() + 6) % 7;
  const total = isWeek ? 7 : Math.ceil((lead + monthDays) / 7) * 7;
  const today = todayKey();
  const items = filteredVideos();
  const title = isWeek
    ? `Semaine du ${fmt.day.format(first)}`
    : fmt.month.format(cursor);

  const cells = Array.from({ length: total }, (_, i) => {
    const d = addDays(first, i);
    const key = dayKey(d);
    const out = !isWeek && d.getMonth() !== cursor.getMonth();
    const dayItems = items.filter((v) => planKey(v) === key).sort((a, b) => a.planned_at.localeCompare(b.planned_at));
    return `<div class="cell ${out ? "out" : ""} ${key === today ? "today" : ""}" data-drop="date" data-date="${key}">
      <div class="cell-top"><span><span class="cell-num">${d.getDate()}</span> <span class="muted small">${
        isWeek || window.matchMedia("(max-width: 820px)").matches ? esc(fmt.weekday.format(d)) : ""
      }</span></span>
      <button type="button" class="icon-btn cell-add" data-action="new-video" data-date="${key}" aria-label="Ajouter le ${esc(
        fmt.day.format(d)
      )}">+</button></div>
      ${dayItems.map((v) => pill(v, true)).join("")}
    </div>`;
  }).join("");

  const heads = Array.from({ length: 7 }, (_, i) => `<span>${esc(fmt.weekday.format(addDays(first, i)))}</span>`).join("");

  return `<div class="toolbar">
    <button type="button" class="btn small" data-action="cal-move" data-step="-1" aria-label="Période précédente">‹</button>
    <span class="cal-title">${esc(title)}</span>
    <button type="button" class="btn small" data-action="cal-move" data-step="1" aria-label="Période suivante">›</button>
    <button type="button" class="btn small" data-action="cal-today">Aujourd'hui</button>
    <div class="segmented" role="group" aria-label="Période">
      <button type="button" data-action="cal-mode" data-mode="week" aria-pressed="${isWeek}">Semaine</button>
      <button type="button" data-action="cal-mode" data-mode="month" aria-pressed="${!isWeek}">Mois</button>
    </div>
    <span class="spacer"></span>
    ${platformFilter()}
  </div>
  <div class="cal-head">${heads}</div>
  <div class="cal ${isWeek ? "week" : ""}">${cells}</div>`;
}

/* ---------- Idées ---------- */

function renderIdeas() {
  const tags = [...new Set(state.db.ideas.flatMap((i) => i.tags || []))].sort((a, b) => a.localeCompare(b, "fr"));
  if (state.tag && !tags.includes(state.tag)) state.tag = null;
  const items = state.db.ideas
    .filter((i) => !state.tag || (i.tags || []).includes(state.tag))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const quick = `<form class="quick" data-form="quick-idea">
    <input type="text" name="title" placeholder="Note une idée de vidéo ou de stream" aria-label="Nouvelle idée" maxlength="200" required>
    <button class="btn primary" type="submit">Noter</button>
  </form>`;
  const filter = tags.length
    ? `<div class="toolbar"><button type="button" class="chip" data-action="filter-tag" data-tag="" aria-pressed="${!state.tag}">Toutes</button>
        ${tags
          .map(
            (t) =>
              `<button type="button" class="chip" data-action="filter-tag" data-tag="${esc(t)}" aria-pressed="${
                state.tag === t
              }">${esc(t)}</button>`
          )
          .join("")}</div>`
    : "";
  const cards = items
    .map(
      (i) => `<article class="idea glass">
        <button type="button" class="idea-title" data-action="edit-idea" data-id="${esc(i.id)}">${esc(i.title)}</button>
        ${i.hook ? `<p class="idea-hook">${esc(i.hook)}</p>` : ""}
        <div class="idea-foot">${platformDots(i.platforms)}${(i.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
        <div><button type="button" class="btn small" data-action="idea-to-video" data-id="${esc(i.id)}">Transformer en vidéo</button></div>
      </article>`
    )
    .join("");
  const body = items.length
    ? `<div class="ideas">${cards}</div>`
    : `<div class="panel glass">${emptyState("Ta boîte à idées est vide. Note la première dans le champ ci-dessus.")}</div>`;
  return quick + filter + body;
}

/* ---------- Todo ---------- */

function renderTodo() {
  const today = todayKey();
  const open = state.db.tasks.filter((t) => !t.done);
  const byDue = (a, b) => (a.due_on || "9").localeCompare(b.due_on || "9") || a.priority - b.priority;
  const groups = [
    ["En retard", open.filter((t) => t.due_on && t.due_on < today)],
    ["Aujourd'hui", open.filter((t) => t.due_on === today)],
    ["À venir", open.filter((t) => t.due_on && t.due_on > today)],
    ["Sans date", open.filter((t) => !t.due_on)],
  ];
  const done = state.db.tasks.filter((t) => t.done).sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const quick = `<form class="quick" data-form="quick-task">
    <input type="text" name="title" placeholder="Ajoute une tâche, par exemple : monter le clip du dernier stream" aria-label="Nouvelle tâche" maxlength="200" required>
    <input type="date" name="due_on" aria-label="Date limite" style="flex:0 0 170px">
    <button class="btn primary" type="submit">Ajouter</button>
  </form>`;

  const sections = groups
    .filter(([, items]) => items.length)
    .map(([label, items]) => `<h2 class="group-title">${label}</h2><ul class="rows">${items.sort(byDue).map(taskRow).join("")}</ul>`)
    .join("");

  const doneSection = done.length
    ? `<h2 class="group-title"><button type="button" class="btn small ghost" data-action="toggle-done" aria-expanded="${state.showDone}">
        ${state.showDone ? "Masquer" : "Afficher"} les ${done.length} tâche${done.length > 1 ? "s" : ""} terminée${done.length > 1 ? "s" : ""}</button></h2>
       ${state.showDone ? `<ul class="rows">${done.map(taskRow).join("")}</ul>` : ""}`
    : "";

  const body = sections || emptyState(done.length ? "Tout est fait." : "Aucune tâche. Ajoute la première dans le champ ci-dessus.");
  return `${quick}<div class="panel glass">${body}${doneSection}</div>`;
}

/* ---------- Fenêtres de saisie ---------- */

const field = (label, control) => `<label class="field"><span>${label}</span>${control}</label>`;

function platformChoices(selected = []) {
  return `<fieldset class="choices"><legend>Plateformes</legend>${Object.entries(PLATFORMS)
    .map(
      ([key, label]) => `<label class="choice p-${key}"><input type="checkbox" name="platforms" value="${key}" ${
        selected.includes(key) ? "checked" : ""
      }><span><i class="dot p-${key}"></i>${label}</span></label>`
    )
    .join("")}</fieldset>`;
}

function openForm({ title, body, submitLabel = "Enregistrer", onSubmit, onDelete, deleteLabel = "Supprimer" }) {
  modal.innerHTML = `<form method="dialog" novalidate>
    <div class="modal-head"><h2>${esc(title)}</h2>
      <button type="button" class="icon-btn" data-close aria-label="Fermer">✕</button></div>
    ${body}
    <p class="form-error" role="alert" hidden></p>
    <div class="modal-actions">
      ${onDelete ? `<button type="button" class="btn danger ghost" data-delete>${esc(deleteLabel)}</button>` : ""}
      <span class="spacer"></span>
      <button type="button" class="btn ghost" data-close>Annuler</button>
      <button type="submit" class="btn primary">${esc(submitLabel)}</button>
    </div></form>`;
  const form = $("form", modal);
  const error = $(".form-error", modal);
  const close = () => modal.close();
  modal.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const data = new FormData(form);
    const problem = await onSubmit(data);
    if (typeof problem === "string") {
      error.textContent = problem;
      error.hidden = false;
      return;
    }
    close();
    render();
  });

  const del = $("[data-delete]", modal);
  if (del) {
    del.addEventListener("click", async () => {
      if (del.dataset.armed !== "1") {
        del.dataset.armed = "1";
        del.textContent = "Confirmer la suppression";
        return;
      }
      await onDelete();
      close();
      render();
    });
  }
  modal.showModal();
  const firstInput = $("input:not([type=hidden]), textarea, select", form);
  if (firstInput && !window.matchMedia("(max-width: 820px)").matches) firstInput.focus();
}

const text = (data, name) => String(data.get(name) || "").trim() || null;

function videoForm(video, defaults = {}) {
  const v = video || { kind: "video", platforms: [], status: "idee", ...defaults };
  openForm({
    title: video ? "Modifier la vidéo" : "Nouvelle vidéo",
    body: `
      ${field("Titre", `<input type="text" name="title" value="${esc(v.title)}" maxlength="200" required>`)}
      <fieldset class="choices"><legend>Type</legend>
        <label class="choice"><input type="radio" name="kind" value="video" ${v.kind !== "stream" ? "checked" : ""}><span>Vidéo</span></label>
        <label class="choice p-twitch"><input type="radio" name="kind" value="stream" ${v.kind === "stream" ? "checked" : ""}><span>Stream</span></label>
      </fieldset>
      ${platformChoices(v.platforms)}
      <div class="grid-2">
        ${field(
          "Avancement",
          `<select name="status">${STATUSES.map(
            ([key, label]) => `<option value="${key}" ${v.status === key ? "selected" : ""}>${label}</option>`
          ).join("")}</select>`
        )}
        ${field("Date prévue", `<input type="datetime-local" name="planned_at" value="${esc(toInput(v.planned_at))}">`)}
      </div>
      ${field("Sponsor ou collab", `<input type="text" name="sponsor" value="${esc(v.sponsor)}" maxlength="80" placeholder="Laisse vide s'il n'y en a pas">`)}
      ${field("Lien vers le fichier", `<input type="url" name="file_url" value="${esc(v.file_url)}" placeholder="https://drive.google.com/…">`)}
      ${field("Lien de la miniature", `<input type="url" name="thumb_url" value="${esc(v.thumb_url)}" placeholder="https://…">`)}
      ${field("Notes", `<textarea name="notes" maxlength="4000">${esc(v.notes)}</textarea>`)}
      ${safeUrl(v.file_url) ? `<p><a href="${esc(safeUrl(v.file_url))}" target="_blank" rel="noopener noreferrer">Ouvrir le fichier</a></p>` : ""}`,
    async onSubmit(data) {
      for (const name of ["file_url", "thumb_url"]) {
        const raw = text(data, name);
        if (raw && !safeUrl(raw)) return "Les liens doivent commencer par https://";
      }
      const planned = text(data, "planned_at");
      const row = {
        title: text(data, "title"),
        kind: data.get("kind") === "stream" ? "stream" : "video",
        platforms: data.getAll("platforms").filter((p) => p in PLATFORMS),
        status: data.get("status") in STATUS_LABEL ? data.get("status") : "idee",
        planned_at: planned ? new Date(planned).toISOString() : null,
        sponsor: text(data, "sponsor"),
        file_url: text(data, "file_url"),
        thumb_url: text(data, "thumb_url"),
        notes: text(data, "notes"),
      };
      if (!row.title) return "Donne un titre à la vidéo.";
      if (video) {
        const saved = await run(() => store.update("videos", video.id, row), "Vidéo enregistrée");
        if (!saved) return "L'enregistrement a échoué.";
        Object.assign(video, saved);
      } else {
        const saved = await run(() => store.insert("videos", row), "Vidéo créée");
        if (!saved) return "L'enregistrement a échoué.";
        state.db.videos.push(saved);
      }
    },
    onDelete: video
      ? async () => {
          const ok = await run(async () => {
            await store.remove("videos", video.id);
            return true;
          }, "Vidéo supprimée");
          if (!ok) return;
          state.db.videos = state.db.videos.filter((x) => x.id !== video.id);
          state.db.tasks.forEach((t) => {
            if (t.video_id === video.id) t.video_id = null;
          });
        }
      : null,
  });
}

function ideaForm(idea) {
  const i = idea || { platforms: [], tags: [] };
  openForm({
    title: idea ? "Modifier l'idée" : "Nouvelle idée",
    body: `
      ${field("Idée", `<input type="text" name="title" value="${esc(i.title)}" maxlength="200" required>`)}
      ${field("Accroche", `<input type="text" name="hook" value="${esc(i.hook)}" maxlength="300" placeholder="La première phrase ou les 3 premières secondes">`)}
      ${platformChoices(i.platforms)}
      ${field("Étiquettes", `<input type="text" name="tags" value="${esc((i.tags || []).join(", "))}" placeholder="valorant, tuto, tendance">`)}
      ${field("Notes", `<textarea name="notes" maxlength="4000" placeholder="Son, tendance, déroulé…">${esc(i.notes)}</textarea>`)}`,
    async onSubmit(data) {
      const row = {
        title: text(data, "title"),
        hook: text(data, "hook"),
        notes: text(data, "notes"),
        platforms: data.getAll("platforms").filter((p) => p in PLATFORMS),
        tags: [...new Set(String(data.get("tags") || "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12),
      };
      if (!row.title) return "Écris ton idée.";
      if (idea) {
        const saved = await run(() => store.update("ideas", idea.id, row), "Idée enregistrée");
        if (!saved) return "L'enregistrement a échoué.";
        Object.assign(idea, saved);
      } else {
        const saved = await run(() => store.insert("ideas", row), "Idée notée");
        if (!saved) return "L'enregistrement a échoué.";
        state.db.ideas.push(saved);
      }
    },
    onDelete: idea
      ? async () => {
          const ok = await run(async () => {
            await store.remove("ideas", idea.id);
            return true;
          }, "Idée supprimée");
          if (ok) state.db.ideas = state.db.ideas.filter((x) => x.id !== idea.id);
        }
      : null,
  });
}

function taskForm(task) {
  const t = task || { priority: 2 };
  const videos = [...state.db.videos].sort((a, b) => a.title.localeCompare(b.title, "fr"));
  openForm({
    title: task ? "Modifier la tâche" : "Nouvelle tâche",
    body: `
      ${field("Tâche", `<input type="text" name="title" value="${esc(t.title)}" maxlength="200" required>`)}
      <div class="grid-2">
        ${field("Date limite", `<input type="date" name="due_on" value="${esc(t.due_on)}">`)}
        ${field(
          "Priorité",
          `<select name="priority">${[[1, "Haute"], [2, "Normale"], [3, "Basse"]]
            .map(([value, label]) => `<option value="${value}" ${Number(t.priority) === value ? "selected" : ""}>${label}</option>`)
            .join("")}</select>`
        )}
      </div>
      ${field(
        "Vidéo concernée",
        `<select name="video_id"><option value="">Aucune</option>${videos
          .map((v) => `<option value="${esc(v.id)}" ${t.video_id === v.id ? "selected" : ""}>${esc(v.title)}</option>`)
          .join("")}</select>`
      )}`,
    async onSubmit(data) {
      const priority = Number(data.get("priority"));
      const row = {
        title: text(data, "title"),
        due_on: text(data, "due_on"),
        priority: [1, 2, 3].includes(priority) ? priority : 2,
        video_id: text(data, "video_id"),
      };
      if (!row.title) return "Écris la tâche.";
      if (task) {
        const saved = await run(() => store.update("tasks", task.id, row), "Tâche enregistrée");
        if (!saved) return "L'enregistrement a échoué.";
        Object.assign(task, saved);
      } else {
        const saved = await run(() => store.insert("tasks", { ...row, done: false }), "Tâche ajoutée");
        if (!saved) return "L'enregistrement a échoué.";
        state.db.tasks.push(saved);
      }
    },
    onDelete: task
      ? async () => {
          const ok = await run(async () => {
            await store.remove("tasks", task.id);
            return true;
          }, "Tâche supprimée");
          if (ok) state.db.tasks = state.db.tasks.filter((x) => x.id !== task.id);
        }
      : null,
  });
}

function goalForm(goal) {
  const g = goal || { current_value: 0 };
  openForm({
    title: goal ? "Modifier l'objectif" : "Nouvel objectif",
    body: `
      ${field("Objectif", `<input type="text" name="label" value="${esc(g.label)}" maxlength="120" placeholder="1 000 followers Twitch" required>`)}
      ${field(
        "Plateforme",
        `<select name="platform"><option value="">Aucune</option>${Object.entries(PLATFORMS)
          .map(([key, label]) => `<option value="${key}" ${g.platform === key ? "selected" : ""}>${label}</option>`)
          .join("")}</select>`
      )}
      <div class="grid-2">
        ${field("Où tu en es", `<input type="number" name="current_value" value="${esc(g.current_value)}" min="0" step="any" required>`)}
        ${field("Cible", `<input type="number" name="target_value" value="${esc(g.target_value)}" min="1" step="any" required>`)}
      </div>`,
    async onSubmit(data) {
      const row = {
        label: text(data, "label"),
        platform: data.get("platform") in PLATFORMS ? data.get("platform") : null,
        current_value: Number(data.get("current_value")),
        target_value: Number(data.get("target_value")),
      };
      if (!row.label) return "Décris ton objectif.";
      if (!(row.target_value > 0) || !(row.current_value >= 0)) return "La cible doit être supérieure à zéro.";
      if (goal) {
        const saved = await run(() => store.update("goals", goal.id, row), "Objectif enregistré");
        if (!saved) return "L'enregistrement a échoué.";
        Object.assign(goal, saved);
      } else {
        const saved = await run(() => store.insert("goals", row), "Objectif ajouté");
        if (!saved) return "L'enregistrement a échoué.";
        state.db.goals.push(saved);
      }
    },
    onDelete: goal
      ? async () => {
          const ok = await run(async () => {
            await store.remove("goals", goal.id);
            return true;
          }, "Objectif supprimé");
          if (ok) state.db.goals = state.db.goals.filter((x) => x.id !== goal.id);
        }
      : null,
  });
}

function metricsForm() {
  const rows = Object.entries(PLATFORMS)
    .map(([key, label]) => {
      const latest = figureFor(key)?.latest;
      return `<fieldset class="choices p-${key}" style="display:grid;gap:10px">
        <legend><i class="dot p-${key}"></i> ${label}</legend>
        <div class="grid-2">
          ${field("Abonnés", `<input type="number" name="followers-${key}" min="0" step="1" inputmode="numeric" placeholder="${latest ? latest.followers : "0"}">`)}
          ${field("Vues sur 28 jours", `<input type="number" name="views-${key}" min="0" step="1" inputmode="numeric" placeholder="${latest ? latest.views : "0"}">`)}
        </div></fieldset>`;
    })
    .join("");
  openForm({
    title: "Mettre à jour mes chiffres",
    body: `<p class="muted small">Relevé du jour. Laisse vide une plateforme que tu ne veux pas mettre à jour. La récupération automatique arrive avec le module Stats.</p>${rows}`,
    async onSubmit(data) {
      const today = todayKey();
      let saved = 0;
      for (const key of Object.keys(PLATFORMS)) {
        const followersRaw = String(data.get(`followers-${key}`) || "").trim();
        const viewsRaw = String(data.get(`views-${key}`) || "").trim();
        if (!followersRaw && !viewsRaw) continue;
        const latest = figureFor(key)?.latest;
        const followers = followersRaw ? Math.floor(Number(followersRaw)) : latest?.followers ?? 0;
        const views = viewsRaw ? Math.floor(Number(viewsRaw)) : latest?.views ?? 0;
        if (!(followers >= 0) || !(views >= 0)) return "Les chiffres doivent être des nombres positifs.";
        const row = await run(() => store.saveMetric({ platform: key, recorded_on: today, followers, views }));
        if (!row) return "L'enregistrement a échoué.";
        state.db.metrics = state.db.metrics.filter((m) => !(m.platform === key && m.recorded_on === today));
        state.db.metrics.push(row);
        saved += 1;
      }
      if (!saved) return "Renseigne au moins un chiffre.";
      toast("Chiffres mis à jour");
    },
  });
}

/* ---------- Actions ---------- */

const find = (table, id) => state.db[table].find((row) => row.id === id);

const actions = {
  go: (el) => go(el.dataset.route),
  "quick-add": () => ({ ideas: ideaForm, todo: taskForm }[state.route] || videoForm)(),
  "new-video": (el) => {
    const date = el.dataset.date;
    videoForm(null, date ? { planned_at: new Date(`${date}T18:00`).toISOString(), status: "programme" } : {});
  },
  "edit-video": (el) => {
    const v = find("videos", el.dataset.id);
    if (v) videoForm(v);
  },
  "new-task": () => taskForm(),
  "edit-task": (el) => {
    const t = find("tasks", el.dataset.id);
    if (t) taskForm(t);
  },
  "edit-idea": (el) => {
    const i = find("ideas", el.dataset.id);
    if (i) ideaForm(i);
  },
  "new-goal": () => goalForm(),
  "edit-goal": (el) => {
    const g = find("goals", el.dataset.id);
    if (g) goalForm(g);
  },
  "edit-metrics": () => metricsForm(),
  "video-view": (el) => {
    state.videoView = el.dataset.view;
    render();
  },
  "filter-platform": (el) => {
    state.platform = el.dataset.platform || null;
    render();
  },
  "filter-tag": (el) => {
    state.tag = el.dataset.tag || null;
    render();
  },
  "cal-mode": (el) => {
    state.calMode = el.dataset.mode;
    render();
  },
  "cal-today": () => {
    state.calCursor = new Date();
    render();
  },
  "cal-move": (el) => {
    const step = Number(el.dataset.step);
    const c = state.calCursor;
    state.calCursor = state.calMode === "week" ? addDays(c, step * 7) : new Date(c.getFullYear(), c.getMonth() + step, 1);
    render();
  },
  "toggle-done": () => {
    state.showDone = !state.showDone;
    render();
  },
  "toggle-task": async (el) => {
    const task = find("tasks", el.dataset.id);
    if (!task) return;
    const saved = await run(() => store.update("tasks", task.id, { done: el.checked }));
    if (saved) Object.assign(task, saved);
    render();
  },
  "idea-to-video": async (el) => {
    const idea = find("ideas", el.dataset.id);
    if (!idea) return;
    const notes = [idea.hook, idea.notes].filter(Boolean).join("\n\n") || null;
    const video = await run(() =>
      store.insert("videos", { title: idea.title, kind: "video", platforms: idea.platforms || [], status: "idee", notes })
    );
    if (!video) return;
    state.db.videos.push(video);
    const removed = await run(async () => {
      await store.remove("ideas", idea.id);
      return true;
    }, "Idée transformée en vidéo");
    if (removed) state.db.ideas = state.db.ideas.filter((x) => x.id !== idea.id);
    state.route = "videos";
    render();
    videoForm(video);
  },
  "sign-out": async () => {
    await store.auth.signOut();
    location.reload();
  },
};

document.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]");
  if (!el || el.matches("input[type=checkbox]")) return;
  const handler = actions[el.dataset.action];
  if (handler) handler(el, event);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const el = event.target.closest('[role="button"][data-action]');
  if (!el || el !== event.target) return;
  event.preventDefault();
  el.click();
});

document.addEventListener("change", (event) => {
  const el = event.target.closest("input[type=checkbox][data-action]");
  if (el) actions[el.dataset.action]?.(el, event);
});

view.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  const title = text(data, "title");
  if (!title) return;
  if (form.dataset.form === "quick-idea") {
    const saved = await run(() => store.insert("ideas", { title, tags: [], platforms: [] }), "Idée notée");
    if (saved) state.db.ideas.push(saved);
  } else {
    const saved = await run(
      () => store.insert("tasks", { title, due_on: text(data, "due_on"), priority: 2, done: false }),
      "Tâche ajoutée"
    );
    if (saved) state.db.tasks.push(saved);
  }
  render();
  $(`[data-form="${form.dataset.form}"] input[name=title]`)?.focus();
});

/* ---------- Glisser-déposer (ordinateur) ---------- */

view.addEventListener("dragstart", (event) => {
  const el = event.target.closest("[data-drag]");
  if (!el) return;
  state.drag = { type: el.dataset.drag, id: el.dataset.id || el.dataset.block };
  el.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", state.drag.id || "");
  event.stopPropagation();
});

view.addEventListener("dragend", () => {
  state.drag = null;
  view.querySelectorAll(".dragging, .drop-target").forEach((el) => el.classList.remove("dragging", "drop-target"));
});

function dropZone(event) {
  if (!state.drag) return null;
  const selector = { "video-status": '[data-drop="status"]', "video-date": '[data-drop="date"]', block: "[data-block]" }[state.drag.type];
  return event.target.closest(selector);
}

view.addEventListener("dragover", (event) => {
  const zone = dropZone(event);
  if (!zone) return;
  event.preventDefault();
  view.querySelectorAll(".drop-target").forEach((el) => el !== zone && el.classList.remove("drop-target"));
  zone.classList.add("drop-target");
});

view.addEventListener("drop", async (event) => {
  const zone = dropZone(event);
  const drag = state.drag;
  if (!zone || !drag) return;
  event.preventDefault();

  if (drag.type === "block") {
    const order = homeOrder().filter((id) => id !== drag.id);
    const target = zone.dataset.block;
    if (target === drag.id) return;
    order.splice(order.indexOf(target), 0, drag.id);
    try {
      localStorage.setItem("home-order", JSON.stringify(order));
    } catch {
      /* l'ordre ne sera simplement pas mémorisé */
    }
    render();
    return;
  }

  const video = find("videos", drag.id);
  if (!video) return;
  let patch = null;
  if (drag.type === "video-status" && zone.dataset.status !== video.status) {
    patch = { status: zone.dataset.status };
  } else if (drag.type === "video-date") {
    const current = video.planned_at ? new Date(video.planned_at) : new Date(`${zone.dataset.date}T18:00`);
    const target = fromKey(zone.dataset.date);
    target.setHours(current.getHours(), current.getMinutes(), 0, 0);
    if (dayKey(target) !== planKey(video)) patch = { planned_at: target.toISOString() };
  }
  if (!patch) return;
  const saved = await run(() => store.update("videos", video.id, patch));
  if (saved) Object.assign(video, saved);
  render();
});

/* ---------- Recherche ---------- */

const searchInput = $("#search");
const searchResults = $("#search-results");

function runSearch() {
  const query = searchInput.value.trim().toLowerCase();
  if (query.length < 2) {
    searchResults.hidden = true;
    return;
  }
  const match = (...values) => values.some((v) => String(v || "").toLowerCase().includes(query));
  const hits = [
    ...state.db.videos.filter((v) => match(v.title, v.notes, v.sponsor)).map((v) => ["Vidéo", "edit-video", v.id, v.title]),
    ...state.db.ideas.filter((i) => match(i.title, i.hook, i.notes, (i.tags || []).join(" "))).map((i) => ["Idée", "edit-idea", i.id, i.title]),
    ...state.db.tasks.filter((t) => match(t.title)).map((t) => ["Tâche", "edit-task", t.id, t.title]),
  ].slice(0, 12);
  searchResults.innerHTML = hits.length
    ? hits
        .map(
          ([kind, action, id, title]) =>
            `<button type="button" data-action="${action}" data-id="${esc(id)}"><span class="kind">${kind}</span><span>${esc(title)}</span></button>`
        )
        .join("")
    : `<p class="search-empty">Aucun résultat pour « ${esc(searchInput.value.trim())} ».</p>`;
  searchResults.hidden = false;
}

searchInput.addEventListener("input", runSearch);
searchInput.addEventListener("focus", runSearch);
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    searchInput.value = "";
    searchResults.hidden = true;
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".search")) searchResults.hidden = true;
  else if (event.target.closest(".search-results button")) {
    searchResults.hidden = true;
    searchInput.value = "";
  }
});

/* ---------- Connexion et démarrage ---------- */

function showAuth() {
  $("#boot").hidden = true;
  $("#app").hidden = true;
  $("#auth").hidden = false;
  const form = $("#auth-form");
  const error = $("#auth-error");
  let mode = "signin";

  const paint = () => {
    const signin = mode === "signin";
    $("#auth-title").textContent = signin ? "Connexion" : "Créer un compte";
    $("#auth-submit").textContent = signin ? "Se connecter" : "Créer mon compte";
    $("#auth-toggle").textContent = signin ? "Créer un compte" : "J'ai déjà un compte";
    form.elements.password.autocomplete = signin ? "current-password" : "new-password";
    error.hidden = true;
  };
  $("#auth-toggle").onclick = () => {
    mode = mode === "signin" ? "signup" : "signin";
    paint();
  };
  paint();

  form.onsubmit = async (event) => {
    event.preventDefault();
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    error.hidden = true;
    if (!email || password.length < 8) {
      error.textContent = "Saisis ton e-mail et un mot de passe d'au moins 8 caractères.";
      error.hidden = false;
      return;
    }
    const button = $("#auth-submit");
    button.disabled = true;
    try {
      if (mode === "signin") {
        await store.auth.signIn(email, password);
        await start();
      } else {
        const { needsConfirmation } = await store.auth.signUp(email, password);
        if (needsConfirmation) {
          mode = "signin";
          paint();
          error.textContent = "Compte créé. Ouvre le mail de confirmation, puis connecte-toi ici.";
          error.hidden = false;
        } else {
          await start();
        }
      }
    } catch (err) {
      const known = {
        "Invalid login credentials": "E-mail ou mot de passe incorrect.",
        "Email not confirmed": "Confirme d'abord ton adresse avec le mail reçu.",
        "User already registered": "Un compte existe déjà avec cet e-mail. Connecte-toi.",
      };
      error.textContent = known[err.message] || `Connexion impossible : ${err.message}`;
      error.hidden = false;
    } finally {
      button.disabled = false;
    }
  };
}

async function reload() {
  state.db = await store.loadAll();
  state.loadedAt = Date.now();
}

async function start() {
  state.user = await store.auth.user();
  if (!state.user) {
    showAuth();
    return;
  }
  try {
    await reload();
  } catch (err) {
    console.error(err);
    $("#boot").hidden = false;
    $("#boot").textContent = `Chargement impossible : ${err.message}. Recharge la page.`;
    return;
  }
  $("#auth").hidden = true;
  $("#boot").hidden = true;
  $("#app").hidden = false;
  $("#brand-name").textContent = APP_NAME;
  document.title = APP_NAME;
  $("#account-mail").textContent = state.user.email || "";
  $("#demo-banner").hidden = store.isCloud;
  $("#sign-out").hidden = !store.isCloud;
  const hash = location.hash.slice(1);
  if (ROUTES.some(([key]) => key === hash)) state.route = hash;
  render();
}

document.addEventListener("visibilitychange", async () => {
  if (document.hidden || !store.isCloud || !state.user || modal.open) return;
  if (Date.now() - state.loadedAt < 60_000) return;
  try {
    await reload();
    render();
  } catch (err) {
    console.warn("Actualisation impossible", err);
  }
});

(async () => {
  try {
    await store.init();
  } catch (err) {
    console.error(err);
    $("#boot").textContent = "Connexion au serveur impossible. Vérifie ta connexion internet puis recharge la page.";
    return;
  }
  store.auth.onChange((event) => {
    if (event === "SIGNED_OUT") location.reload();
  });
  await start();
})();
