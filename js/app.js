import { APP_NAME } from "./config.js";
import * as store from "./store.js";
import * as twitch from "./twitch.js";
import * as youtube from "./youtube.js";
import * as instagram from "./instagram.js";
import * as tiktok from "./tiktok.js";

/* ---------- Références ---------- */

const PLATFORMS = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", twitch: "Twitch" };
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
  ["home", "Tableau de bord", '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/>'],
  ["videos", "Vidéos", '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9.5 5 2.5-5 2.5z"/>'],
  ["montage", "Montage", '<path d="M4 4v16M20 4v16M4 8h16M4 16h16M9 4v4M15 4v4M9 16v4M15 16v4"/>'],
  ["todo", "Todo", '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8.5 12.5 2.5 2.5 4.5-5.5"/>'],
  ["calendar", "Calendrier", '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'],
  ["thumbs", "Miniatures", '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="8.5" cy="10" r="1.5"/><path d="m4 17 5-4 4 3 3-2 4 3"/>'],
  ["time", "TimeTrackr", '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2M9.5 3h5"/>'],
  ["time-stats", "Statistiques", "", "time"],
  ["notes", "Notes", '<path d="M6 3.5h9l4 4V20a.5.5 0 0 1-.5.5h-12A.5.5 0 0 1 6 20z"/><path d="M9 12h6M9 16h4"/>'],
  ["ideas", "Idées", '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'],
  ["publish", "Publication", '<path d="M12 15V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M5 14v5.5h14V14"/>'],
  ["stats", "Stats", '<path d="M4 20V4"/><path d="M4 20h16"/><path d="m7.5 15 4-4.5 3 3L20 7"/>'],
  ["accounts", "Comptes", '<circle cx="9" cy="8.5" r="3.5"/><path d="M3 20c.8-3.5 3.2-5.5 6-5.5s5.2 2 6 5.5"/><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18.5 20c-.3-1.9-1-3.4-2.1-4.5"/>'],
];
const SUBS = { time: [["time", "Journée"], ["time-stats", "Statistiques"]] };
const TAB_ROUTES = ["home", "videos", "calendar", "todo"];
const MORE_ICON = '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>';
const PROJECT_COLORS = ["#12d6c5", "#ff3d7f", "#8257ff", "#f5a524", "#3ecf6e", "#4d8dff", "#ff7a30", "#c084fc"];
const HOME_BLOCKS = ["week", "figures", "today", "upcoming", "goals", "recent", "thumbs"];

const state = {
  db: { accounts: [], videos: [], ideas: [], tasks: [], goals: [], metrics: [], notes: [], time_entries: [], review_comments: [], publications: [] },
  user: null,
  route: "home",
  videoView: "list",
  platform: null,
  account: null,
  live: {},
  reconnect: {},
  notFound: {},
  syncing: false,
  calMode: window.matchMedia("(max-width: 820px)").matches ? "week" : "month",
  calCursor: new Date(),
  tag: null,
  showDone: false,
  calShow: { video: true, stream: true, task: true },
  navOpen: {},
  timeDay: new Date(),
  reviewVideo: null,
  reviewSrc: null,
  reviewName: "",
  reviewLoading: null,
  drag: null,
  loadedAt: 0,
  statsRange: 30,
  statsPlatform: null,
  pubFile: null,
  pubPreview: null,
  pubCaption: "",
  pubVideo: null,
  pubRunning: false,
  pubSteps: {},
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
  short: new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }),
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

const PLATFORM_ORDER = Object.keys(PLATFORMS);
const accountOf = (id) => state.db.accounts.find((a) => a.id === id);
const sortedAccounts = () =>
  [...state.db.accounts].sort(
    (a, b) =>
      PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform) ||
      a.position - b.position ||
      a.created_at.localeCompare(b.created_at)
  );
const initials = (name) =>
  String(name || "?")
    .replace(/^@/, "")
    .split(/[\s_.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "?";
const CONTENT_WORD = { youtube: "vidéo", tiktok: "vidéo", instagram: "publication" };
const contentCount = (a) => {
  const word = CONTENT_WORD[a.platform];
  if (!word || a.content_count == null) return "";
  return `<span>${fmt.num.format(a.content_count)} ${word}${a.content_count > 1 ? "s" : ""}</span>`;
};
const accountBadge = (a) => {
  const avatar = safeUrl(a.avatar_url);
  const title = `${esc(a.name)}, ${esc(PLATFORMS[a.platform])}`;
  return avatar
    ? `<img class="acc p-${esc(a.platform)}" src="${esc(avatar)}" alt="" title="${title}" loading="lazy">`
    : `<span class="acc p-${esc(a.platform)}" title="${title}">${esc(initials(a.name))}</span>`;
};
const videoAccounts = (v) => (v.account_ids || []).map(accountOf).filter(Boolean);
const videoBadges = (v) => {
  const list = videoAccounts(v);
  return list.length ? `<span class="accs">${list.map(accountBadge).join("")}</span>` : platformDots(v.platforms);
};
const videoChannels = (v) => {
  const list = videoAccounts(v);
  return list.length ? list.map((a) => a.name).join(", ") : (v.platforms || []).map((p) => PLATFORMS[p]).join(", ");
};
const firstPlatform = (v) => {
  const platform = videoAccounts(v)[0]?.platform || v.platforms?.[0];
  return platform ? `p-${platform}` : "";
};

function pill(v, draggable = false) {
  const time = v.planned_at ? `<time>${fmt.time.format(new Date(v.planned_at))}</time>` : "";
  // Un <div> quand l'élément se déplace : Firefox ne laisse pas glisser un <button>.
  const tag = draggable ? "div" : "button";
  const attrs = draggable ? 'role="button" tabindex="0" draggable="true" data-drag="video-date"' : 'type="button"';
  const sponsor = v.sponsor ? `<span class="pill-sub"><span class="tag sponsor">${esc(v.sponsor)}</span></span>` : "";
  return `<${tag} ${attrs} class="pill ${firstPlatform(v)} ${v.status === "publie" ? "is-done" : ""}"
    data-action="edit-video" data-id="${esc(v.id)}" title="${esc(v.title)}"><span class="pill-line">${time}${esc(v.title)}</span>${sponsor}</${tag}>`;
}

function taskPill(t) {
  return `<div role="button" tabindex="0" draggable="true" data-drag="task-date" class="pill task-pill ${t.done ? "is-done" : ""}"
    data-action="edit-task" data-id="${esc(t.id)}" title="${esc(t.title)}"><span class="pill-line">${esc(t.title)}</span></div>`;
}

const projectColor = (id) => {
  if (!id) return "#6f6f6f";
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PROJECT_COLORS[h % PROJECT_COLORS.length];
};
const duration = (ms) => {
  const min = Math.max(0, Math.round(ms / 60000));
  return min >= 60 ? `${Math.floor(min / 60)} h ${pad(min % 60)}` : `${min} min`;
};
const clock = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  return `${h ? h + ":" : ""}${h ? pad(Math.floor((s % 3600) / 60)) : Math.floor(s / 60)}:${pad(s % 60)}`;
};

const emptyState = (text, action, label) =>
  `<div class="empty"><p>${esc(text)}</p>${
    action ? `<button type="button" class="btn small" data-action="${action}">${esc(label)}</button>` : ""
  }</div>`;

const lateTasks = () => state.db.tasks.filter((t) => !t.done && t.due_on && t.due_on < todayKey());

/* ---------- Navigation ---------- */

function crumb() {
  const route = ROUTES.find(([key]) => key === state.route);
  const parent = route[3] ? ROUTES.find(([key]) => key === route[3]) : null;
  const parts = parent ? [parent[1], route[1]] : [route[1]];
  if (state.route === "time") parts.push("Journée");
  if (state.route === "videos") parts.push(state.videoView === "board" ? "Kanban" : "Liste");
  if (state.route === "calendar") parts.push({ day: "Jour", week: "Semaine", month: "Mois" }[state.calMode]);
  return parts.map((p, i) => `<span class="${i === parts.length - 1 ? "here" : ""}">${esc(p)}</span>`).join('<span class="sep">›</span>');
}

function renderNav() {
  const late = lateTasks().length;
  const badge = (key) => (key === "todo" && late ? `<span class="count" aria-label="${late} en retard">${late}</span>` : "");
  const current = (key) => (state.route === key ? 'aria-current="page"' : "");
  const side = ROUTES.filter((r) => !r[3])
    .map(([key, label, paths]) => {
      const subs = SUBS[key];
      if (!subs) {
        return `<button type="button" data-action="go" data-route="${key}" ${current(key)}>${icon(paths)}<span>${label}</span>${badge(key)}</button>`;
      }
      const open = state.navOpen[key] || subs.some(([k]) => k === state.route);
      return `<button type="button" data-action="toggle-nav" data-key="${key}" aria-expanded="${open}">${icon(paths)}<span>${label}</span><span class="chev">${open ? "⌄" : "›"}</span></button>
        ${open ? `<div class="subnav">${subs.map(([k, l]) => `<button type="button" data-action="go" data-route="${k}" ${current(k)}><span>${l}</span></button>`).join("")}</div>` : ""}`;
    })
    .join("");
  $("#nav").innerHTML = side;
  const inTabs = TAB_ROUTES.includes(state.route);
  $("#tabbar").innerHTML =
    ROUTES.filter(([key]) => TAB_ROUTES.includes(key))
      .map(([key, label, paths]) => `<button type="button" data-action="go" data-route="${key}" ${current(key)}>${icon(paths)}<span>${key === "home" ? "Accueil" : label}</span>${badge(key)}</button>`)
      .join("") +
    `<button type="button" data-action="more" ${inTabs ? "" : 'aria-current="page"'}>${icon(MORE_ICON)}<span>Plus</span></button>`;
  $("#view-title").innerHTML = crumb();
  const addLabel = { ideas: "Nouvelle idée", todo: "Nouvelle tâche", notes: "Nouvelle note" }[state.route] || "Nouvelle vidéo";
  $("#quick-add").textContent = addLabel;
}

function render() {
  renderNav();
  const renderers = {
    home: renderHome, videos: renderVideos, calendar: renderCalendar, ideas: renderIdeas, todo: renderTodo,
    montage: renderMontage, accounts: renderAccounts, thumbs: renderThumbs, time: renderTime, "time-stats": renderTimeStats, notes: renderNotes, stats: renderStats, publish: renderPublish,
  };
  if (state.route !== "montage") releaseReview();
  view.innerHTML = renderers[state.route]();
  afterRender();
}

function go(route) {
  if (!ROUTES.some(([key]) => key === route)) return;
  if (modal.open) modal.close();
  state.route = route;
  render();
  window.scrollTo({ top: 0 });
  // Chaque module a sa propre adresse : le bouton Retour et les favoris fonctionnent.
  if (location.hash.slice(1) !== route) location.hash = route;
}

window.addEventListener("hashchange", () => {
  const route = location.hash.slice(1) || "home";
  if (!state.user || route === state.route || !ROUTES.some(([key]) => key === route)) return;
  go(route);
});

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

function figureFor(accountId) {
  const rows = state.db.metrics
    .filter((m) => m.account_id === accountId)
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
    const list = sortedAccounts();
    if (!list.length) {
      return panel("figures", "Mes chiffres", emptyState("Ajoute tes comptes YouTube, TikTok, Instagram et Twitch pour suivre leurs chiffres.", "go-accounts", "Ajouter mes comptes"));
    }
    const tiles = list
      .map((a) => {
        const f = figureFor(a.id);
        const sub = f
          ? [deltaText(f.d7, "7 jours"), deltaText(f.d28, "28 jours")].filter(Boolean).join(", ") ||
            `Relevé du ${fmt.day.format(fromKey(f.latest.recorded_on))}`
          : "Aucun relevé";
        return `<div class="figure p-${esc(a.platform)}">
          <div class="figure-name">${accountBadge(a)}<span class="figure-label">${esc(a.name)}</span></div>
          <div class="figure-platform">${esc(PLATFORMS[a.platform])}${a.handle ? ` <span>${esc(a.handle)}</span>` : ""}</div>
          <div class="figure-value">${f ? fmt.num.format(f.latest.followers) : "–"}</div>
          <div class="figure-sub">${f ? "abonnés. " : ""}${sub}</div>
          ${state.live[a.id] ? `<div class="live-badge"><i></i>En live, ${fmt.num.format(state.live[a.id].viewers)} viewers</div>` : ""}
          ${
            state.reconnect[a.id]
              ? a.platform === "twitch" || a.platform === "tiktok"
                ? `<button type="button" class="btn small" data-action="${a.platform}-connect">Reconnecter ${esc(PLATFORMS[a.platform])}</button>`
                : `<button type="button" class="btn small" data-action="edit-account" data-id="${esc(a.id)}">Recoller la clé ${esc(PLATFORMS[a.platform])}</button>`
              : ""
          }
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
            const acc = accountOf(g.account_id);
            const platform = acc?.platform || g.platform;
            return `<button type="button" class="row-main goal ${platform ? `p-${esc(platform)}` : ""}" data-action="edit-goal" data-id="${esc(g.id)}">
              <span class="goal-top"><span class="row-title">${acc ? accountBadge(acc) + " " : ""}${esc(g.label)}</span>
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

  thumbs() {
    const items = state.db.videos
      .filter((v) => safeUrl(v.thumb_url))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 4);
    const body = items.length
      ? `<div class="thumb-grid small-grid">${items.map(thumbCard).join("")}</div>`
      : emptyState("Ajoute le lien d'une miniature dans une fiche vidéo pour la voir ici.");
    return panel("thumbs", "Dernières miniatures travaillées", body, {
      extra: `<button type="button" class="btn small" data-action="go" data-route="thumbs">Tout voir</button>`,
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
      <span class="row-sub">${videoBadges(v)}<span>${esc(when(v.planned_at))}</span>${steps(v.status)}</span>
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
  state.db.videos.filter(
    (v) =>
      (!state.platform || (v.platforms || []).includes(state.platform)) &&
      (!state.account || (v.account_ids || []).includes(state.account))
  );

// Filtre par compte quand des comptes existent, sinon par plateforme.
function platformFilter() {
  const list = sortedAccounts();
  if (list.length) {
    if (state.account && !accountOf(state.account)) state.account = null;
    return `<button type="button" class="chip" data-action="filter-account" data-account="" aria-pressed="${!state.account}">Tous</button>
      ${list
        .map(
          (a) => `<button type="button" class="chip" data-action="filter-account" data-account="${esc(a.id)}" aria-pressed="${state.account === a.id}"
            title="${esc(a.name)}, ${esc(PLATFORMS[a.platform])}">${accountBadge(a)}<span class="chip-label">${esc(a.name)}</span></button>`
        )
        .join("")}`;
  }
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
      <button type="button" data-action="video-view" data-view="board" aria-pressed="${state.videoView === "board"}">Kanban</button>
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
            <span class="card-meta">${videoBadges(v)}<span>${esc(when(v.planned_at))}</span>
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
        <td>${videoBadges(v)} <span class="muted small">${esc(videoChannels(v))}</span></td>
        <td>${steps(v.status)}</td>
        <td class="muted">${esc(when(v.planned_at))}</td>
      </tr>`;
    })
    .join("");
  const table = items.length
    ? `<table class="table"><thead><tr><th></th><th>Titre</th><th>Comptes</th><th>Avancement</th><th>Date prévue</th></tr></thead><tbody>${rows}</tbody></table>`
    : emptyState("Aucune vidéo pour cette plateforme.");
  return `${toolbar}<div class="panel glass">${table}</div>`;
}

/* ---------- Calendrier ---------- */

function renderCalendar() {
  const cursor = state.calCursor;
  const mode = state.calMode;
  const monthDays = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const lead = (new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay() + 6) % 7;
  const first =
    mode === "day" ? new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())
    : mode === "week" ? startOfWeek(cursor)
    : startOfWeek(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const total = mode === "day" ? 1 : mode === "week" ? 7 : Math.ceil((lead + monthDays) / 7) * 7;
  const today = todayKey();
  const show = state.calShow;
  const videos = filteredVideos().filter((v) => (v.kind === "stream" ? show.stream : show.video));
  const tasks = show.task ? state.db.tasks.filter((t) => t.due_on) : [];
  const title = mode === "day" ? fmt.long.format(first) : mode === "week" ? `Semaine du ${fmt.day.format(first)}` : fmt.month.format(cursor);
  const narrow = window.matchMedia("(max-width: 820px)").matches;

  const cells = Array.from({ length: total }, (_, i) => {
    const d = addDays(first, i);
    const key = dayKey(d);
    const out = mode === "month" && d.getMonth() !== cursor.getMonth();
    const dayVideos = videos.filter((v) => planKey(v) === key).sort((a, b) => a.planned_at.localeCompare(b.planned_at));
    const dayTasks = tasks.filter((t) => t.due_on === key);
    return `<div class="cell ${out ? "out" : ""} ${key === today ? "today" : ""}" data-drop="date" data-date="${key}">
      <div class="cell-top"><span><span class="cell-num">${d.getDate()}</span> <span class="muted small">${
        mode !== "month" || narrow ? esc(fmt.weekday.format(d)) : ""
      }</span></span></div>
      ${dayVideos.map((v) => pill(v, true)).join("")}${dayTasks.map(taskPill).join("")}
      <button type="button" class="cell-add" data-action="new-video" data-date="${key}" aria-label="Ajouter le ${esc(fmt.day.format(d))}">+</button>
    </div>`;
  }).join("");

  const heads = mode === "day" ? "" : Array.from({ length: 7 }, (_, i) => `<span>${esc(fmt.weekday.format(addDays(first, i)))}</span>`).join("");
  const box = (key, label, color) => `<label class="source"><input type="checkbox" class="check small-check" data-action="cal-show" data-key="${key}" ${show[key] ? "checked" : ""}>
    <i class="dot" style="background:${color}"></i><span>${label}</span></label>`;

  return `<div class="toolbar">
    <div class="segmented" role="group" aria-label="Période">
      ${[["day", "Jour"], ["week", "Semaine"], ["month", "Mois"]]
        .map(([m, l]) => `<button type="button" data-action="cal-mode" data-mode="${m}" aria-pressed="${mode === m}">${l}</button>`)
        .join("")}
    </div>
    <span class="spacer"></span>
    <button type="button" class="btn small" data-action="cal-move" data-step="-1" aria-label="Période précédente">‹</button>
    <button type="button" class="btn small" data-action="cal-today">Aujourd'hui</button>
    <button type="button" class="btn small" data-action="cal-move" data-step="1" aria-label="Période suivante">›</button>
    <span class="cal-title">${esc(title)}</span>
  </div>
  <div class="cal-layout">
    <aside class="cal-side">
      <p class="side-title">Afficher</p>
      ${box("video", "Vidéos", "#ededed")}${box("stream", "Streams", "var(--twitch)")}${box("task", "Tâches", "var(--sponsor)")}
      <p class="side-title">${state.db.accounts.length ? "Comptes" : "Plateformes"}</p>
      <div class="side-chips">${platformFilter()}</div>
    </aside>
    <div class="cal-main">
      ${heads ? `<div class="cal-head">${heads}</div>` : ""}
      <div class="cal ${mode}">${cells}</div>
    </div>
  </div>`;
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

/* ---------- Miniatures ---------- */

function thumbCard(v) {
  const thumb = safeUrl(v.thumb_url);
  return `<button type="button" class="thumb-card" data-action="edit-video" data-id="${esc(v.id)}">
    ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy">` : '<span class="thumb-empty">Sans miniature</span>'}
    <span class="thumb-title">${esc(v.title)}</span>
    <span class="row-sub">${videoBadges(v)}<span>${esc(STATUS_LABEL[v.status])}</span></span>
  </button>`;
}

function renderThumbs() {
  const all = filteredVideos().filter((v) => v.kind !== "stream");
  const withThumb = all.filter((v) => safeUrl(v.thumb_url)).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const without = all.filter((v) => !safeUrl(v.thumb_url) && v.status !== "publie");
  if (!all.length) {
    return `<div class="panel glass">${emptyState("Aucune vidéo pour l'instant. Les miniatures se rattachent aux fiches vidéo.", "new-video", "Créer une vidéo")}</div>`;
  }
  return `<div class="toolbar">${platformFilter()}</div>
    ${withThumb.length ? `<div class="thumb-grid">${withThumb.map(thumbCard).join("")}</div>` : `<div class="panel glass">${emptyState("Aucune miniature. Ouvre une fiche vidéo et colle le lien de l'image.")}</div>`}
    ${without.length ? `<h2 class="group-title">Miniature à faire</h2><div class="thumb-grid">${without.map(thumbCard).join("")}</div>` : ""}`;
}

/* ---------- Notes ---------- */

function renderNotes() {
  const items = [...state.db.notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));
  if (!items.length) {
    return `<div class="panel glass">${emptyState("Aucune note. Garde ici tes scripts, tes listes et tes infos utiles.", "new-note", "Écrire une note")}</div>`;
  }
  return `<div class="ideas">${items
    .map(
      (n) => `<button type="button" class="idea glass note" data-action="edit-note" data-id="${esc(n.id)}">
        <span class="idea-title">${n.pinned ? "★ " : ""}${esc(n.title)}</span>
        <span class="note-body">${esc((n.body || "").slice(0, 280))}</span>
        <span class="muted small">Modifiée le ${esc(fmt.day.format(new Date(n.updated_at)))}</span>
      </button>`
    )
    .join("")}</div>`;
}

function noteForm(note) {
  const n = note || {};
  openForm({
    title: note ? "Modifier la note" : "Nouvelle note",
    body: `
      ${field("Titre", `<input type="text" name="title" value="${esc(n.title)}" maxlength="200" required>`)}
      ${field("Contenu", `<textarea name="body" maxlength="20000" style="min-height:260px">${esc(n.body)}</textarea>`)}
      <label class="source"><input type="checkbox" class="check small-check" name="pinned" ${n.pinned ? "checked" : ""}><span>Épingler en haut</span></label>`,
    async onSubmit(data) {
      const row = { title: text(data, "title"), body: text(data, "body"), pinned: data.get("pinned") === "on" };
      if (!row.title) return "Donne un titre à la note.";
      const saved = await run(() => (note ? store.update("notes", note.id, row) : store.insert("notes", row)), "Note enregistrée");
      if (!saved) return "L'enregistrement a échoué.";
      if (note) Object.assign(note, saved);
      else state.db.notes.push(saved);
    },
    onDelete: note
      ? async () => {
          const ok = await run(async () => {
            await store.remove("notes", note.id);
            return true;
          }, "Note supprimée");
          if (ok) state.db.notes = state.db.notes.filter((x) => x.id !== note.id);
        }
      : null,
  });
}

/* ---------- TimeTrackr ---------- */

const running = () => state.db.time_entries.find((e) => !e.ended_at);
const entryEnd = (e) => (e.ended_at ? new Date(e.ended_at) : new Date());
const projectName = (id) => (id ? find("videos", id)?.title || "Vidéo supprimée" : "Sans projet");

// Durée d'une entrée comprise dans un jour donné (une entrée peut passer minuit).
function overlap(entry, day) {
  const start = Math.max(new Date(entry.started_at).getTime(), day.getTime());
  const end = Math.min(entryEnd(entry).getTime(), addDays(day, 1).getTime());
  return Math.max(0, end - start);
}

function projectSelect(selected) {
  const videos = [...state.db.videos].sort((a, b) => a.title.localeCompare(b.title, "fr"));
  return `<select name="video_id" aria-label="Projet"><option value="">Sans projet</option>${videos
    .map((v) => `<option value="${esc(v.id)}" ${selected === v.id ? "selected" : ""}>${esc(v.title)}</option>`)
    .join("")}</select>`;
}

function totalsByProject(entries, ms) {
  const totals = new Map();
  entries.forEach((e) => {
    const value = ms(e);
    if (value > 0) totals.set(e.video_id || "", (totals.get(e.video_id || "") || 0) + value);
  });
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

function renderTime() {
  const day = new Date(state.timeDay.getFullYear(), state.timeDay.getMonth(), state.timeDay.getDate());
  const isToday = dayKey(day) === todayKey();
  const active = running();
  const entries = state.db.time_entries
    .filter((e) => overlap(e, day) > 0 || (e === active && isToday))
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  const total = entries.reduce((sum, e) => sum + overlap(e, day), 0);

  const starter = active
    ? `<div class="panel glass timer on">
        <div><p class="muted small">En cours depuis ${esc(fmt.time.format(new Date(active.started_at)))}</p>
        <p class="timer-label"><i class="dot" style="background:${projectColor(active.video_id)}"></i> ${esc(active.label || projectName(active.video_id))}</p></div>
        <span class="timer-clock" id="timer-clock">${clock((Date.now() - new Date(active.started_at)) / 1000)}</span>
        <button type="button" class="btn primary" data-action="time-stop">Arrêter</button>
      </div>`
    : `<form class="panel glass timer" data-form="time-start">
        <input type="text" name="label" placeholder="Sur quoi tu travailles ?" aria-label="Activité" maxlength="200">
        ${projectSelect("")}
        <button type="submit" class="btn primary">Démarrer</button>
      </form>`;

  let timeline = "";
  if (entries.length) {
    const starts = entries.map((e) => Math.max(new Date(e.started_at).getTime(), day.getTime()));
    const ends = entries.map((e) => Math.min(entryEnd(e).getTime(), addDays(day, 1).getTime()));
    const from = Math.floor(Math.min(...starts) / 3600000) * 3600000;
    const to = Math.max(from + 3600000, Math.ceil(Math.max(...ends) / 3600000) * 3600000);
    const span = to - from;
    const hours = [];
    const stepHours = Math.max(1, Math.ceil(span / 3600000 / 8));
    for (let t = from; t <= to; t += stepHours * 3600000) hours.push(t);
    timeline = `<div class="timeline">
      <div class="timeline-hours">${hours.map((t) => `<span style="left:${(((t - from) / span) * 100).toFixed(2)}%">${pad(new Date(t).getHours())}:00</span>`).join("")}</div>
      <div class="timeline-track">${entries
        .map((e, i) => `<i title="${esc(e.label || projectName(e.video_id))}" style="left:${(((starts[i] - from) / span) * 100).toFixed(2)}%;width:${Math.max(0.6, ((ends[i] - starts[i]) / span) * 100).toFixed(2)}%;background:${projectColor(e.video_id)}"></i>`)
        .join("")}</div>
      <div class="legend">${totalsByProject(entries, (e) => overlap(e, day))
        .map(([id, ms]) => `<span><i class="dot" style="background:${projectColor(id)}"></i>${esc(projectName(id))} <b>${duration(ms)}</b></span>`)
        .join("")}</div>
    </div>`;
  }

  const rows = entries
    .map(
      (e) => `<li class="row"><i class="dot" style="background:${projectColor(e.video_id)}"></i>
        <span class="time-range">${esc(fmt.time.format(new Date(e.started_at)))} – ${e.ended_at ? esc(fmt.time.format(new Date(e.ended_at))) : "en cours"}</span>
        <span class="muted small time-dur">${duration(overlap(e, day))}</span>
        <button type="button" class="row-main" data-action="edit-time" data-id="${esc(e.id)}">
          <span class="row-title">${esc(e.label || projectName(e.video_id))}</span>
          ${e.label && e.video_id ? `<span class="row-sub">${esc(projectName(e.video_id))}</span>` : ""}
        </button></li>`
    )
    .join("");

  return `${starter}
    <div class="toolbar">
      <button type="button" class="btn small" data-action="time-move" data-step="-1" aria-label="Jour précédent">‹</button>
      <button type="button" class="btn small" data-action="time-today">Aujourd'hui</button>
      <button type="button" class="btn small" data-action="time-move" data-step="1" aria-label="Jour suivant">›</button>
      <span class="cal-title" style="text-align:left;min-width:0">${esc(fmt.long.format(day))}</span>
      <span class="spacer"></span>
      <button type="button" class="btn small" data-action="new-time">Ajouter une entrée</button>
    </div>
    <div class="panel glass">
      <div class="panel-head"><h2>${duration(total)} suivies</h2><span class="muted small">${entries.length} entrée${entries.length > 1 ? "s" : ""}</span></div>
      ${entries.length ? `${timeline}<ul class="rows">${rows}</ul>` : emptyState(isToday ? "Rien de suivi aujourd'hui. Lance le chrono au début d'une session de travail." : "Rien de suivi ce jour-là.")}
    </div>`;
}

function renderTimeStats() {
  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const perDay = days.map((d) => state.db.time_entries.reduce((sum, e) => sum + overlap(e, d), 0));
  const max = Math.max(...perDay, 1);
  const within = (n) => (e) => {
    let ms = 0;
    for (let i = 0; i < n; i++) ms += overlap(e, addDays(today, -i));
    return ms;
  };
  const block = (title, n) => {
    const totals = totalsByProject(state.db.time_entries, within(n));
    const sum = totals.reduce((a, [, ms]) => a + ms, 0);
    const top = totals[0]?.[1] || 1;
    return `<section class="panel glass"><div class="panel-head"><h2>${title}</h2><span class="muted small">${duration(sum)}</span></div>
      ${totals.length ? totals.map(([id, ms]) => `<div class="goal"><span class="goal-top"><span class="row-title">${esc(projectName(id))}</span><span class="muted small">${duration(ms)}</span></span>
        <span class="bar"><i style="width:${((ms / top) * 100).toFixed(1)}%;background:${projectColor(id)}"></i></span></div>`).join("") : emptyState("Aucune donnée sur cette période.")}
    </section>`;
  };
  return `<div class="home">
    <section class="panel glass full"><div class="panel-head"><h2>7 derniers jours</h2><span class="muted small">${duration(perDay.reduce((a, b) => a + b, 0))}</span></div>
      <div class="daybars">${days.map((d, i) => `<div class="daybar"><span class="muted small">${perDay[i] ? duration(perDay[i]) : ""}</span>
        <i style="height:${Math.max(2, (perDay[i] / max) * 120).toFixed(0)}px"></i><span class="small">${esc(fmt.weekday.format(d))}</span></div>`).join("")}</div>
    </section>
    ${block("Par projet, 7 jours", 7)}${block("Par projet, 30 jours", 30)}
  </div>`;
}

function timeForm(entry) {
  const now = new Date();
  const e = entry || { started_at: new Date(now.getTime() - 3600000).toISOString(), ended_at: now.toISOString() };
  openForm({
    title: entry ? "Modifier l'entrée" : "Ajouter une entrée",
    body: `
      ${field("Activité", `<input type="text" name="label" value="${esc(e.label)}" maxlength="200">`)}
      ${field("Projet", projectSelect(e.video_id))}
      <div class="grid-2">
        ${field("Début", `<input type="datetime-local" name="started_at" value="${esc(toInput(e.started_at))}" required>`)}
        ${field("Fin", `<input type="datetime-local" name="ended_at" value="${esc(toInput(e.ended_at))}" ${entry && !entry.ended_at ? "" : "required"}>`)}
      </div>`,
    async onSubmit(data) {
      const start = text(data, "started_at");
      const end = text(data, "ended_at");
      if (!start) return "Indique l'heure de début.";
      const row = {
        label: text(data, "label"),
        video_id: text(data, "video_id"),
        started_at: new Date(start).toISOString(),
        ended_at: end ? new Date(end).toISOString() : null,
      };
      if (row.ended_at && row.ended_at <= row.started_at) return "La fin doit être après le début.";
      if (!row.ended_at && state.db.time_entries.some((x) => !x.ended_at && x !== entry)) return "Un chrono tourne déjà : indique une heure de fin.";
      const saved = await run(() => (entry ? store.update("time_entries", entry.id, row) : store.insert("time_entries", row)), "Entrée enregistrée");
      if (!saved) return "L'enregistrement a échoué.";
      if (entry) Object.assign(entry, saved);
      else state.db.time_entries.push(saved);
    },
    onDelete: entry
      ? async () => {
          const ok = await run(async () => {
            await store.remove("time_entries", entry.id);
            return true;
          }, "Entrée supprimée");
          if (ok) state.db.time_entries = state.db.time_entries.filter((x) => x.id !== entry.id);
        }
      : null,
  });
}

/* ---------- Montage : retours sur une vidéo ---------- */

const isDirectVideo = (url) => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url || "");

function releaseReview() {
  if (state.reviewSrc?.startsWith("blob:")) URL.revokeObjectURL(state.reviewSrc);
  state.reviewSrc = null;
  state.reviewName = "";
}

function reviewComments() {
  return state.db.review_comments
    .filter((c) => c.video_id === state.reviewVideo)
    .sort((a, b) => Number(a.at_seconds) - Number(b.at_seconds));
}

function commentsHtml() {
  const items = reviewComments();
  const open = items.filter((c) => !c.resolved).length;
  return `<div class="panel-head"><h2>${items.length} commentaire${items.length > 1 ? "s" : ""}</h2><span class="muted small">${open} à corriger</span></div>
    ${items.length ? `<ul class="rows comments">${items
      .map(
        (c) => `<li class="comment ${c.resolved ? "is-resolved" : ""}">
          <div class="comment-top"><button type="button" class="timecode" data-action="review-seek" data-at="${Number(c.at_seconds)}">${clock(c.at_seconds)}</button>
            <span class="muted small">${esc(fmt.day.format(new Date(c.created_at)))}</span><span class="spacer"></span>
            <button type="button" class="icon-btn" data-action="review-delete" data-id="${esc(c.id)}" aria-label="Supprimer le commentaire">✕</button></div>
          <p>${esc(c.body)}</p>
          <label class="source"><input type="checkbox" class="check small-check" data-action="review-resolve" data-id="${esc(c.id)}" ${c.resolved ? "checked" : ""}><span>Corrigé</span></label>
        </li>`
      )
      .join("")}</ul>` : emptyState("Aucun retour. Mets la vidéo en pause au bon moment et écris ton commentaire.")}`;
}

function markersHtml(total) {
  if (!(total > 0)) return "";
  return reviewComments()
    .map((c) => `<i class="${c.resolved ? "ok" : ""}" style="left:${Math.min(100, (Number(c.at_seconds) / total) * 100).toFixed(2)}%"></i>`)
    .join("");
}

function refreshReview() {
  const player = $("#review-player");
  const list = $("#review-comments");
  if (list) list.innerHTML = commentsHtml();
  const marks = $("#review-marks");
  if (marks) marks.innerHTML = markersHtml(player?.duration);
}

function renderMontage() {
  const videos = state.db.videos.filter((v) => v.kind !== "stream").sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  if (!videos.length) {
    return `<div class="panel glass">${emptyState("Crée d'abord une fiche vidéo : les retours de montage s'y rattachent.", "new-video", "Créer une vidéo")}</div>`;
  }
  if (!videos.some((v) => v.id === state.reviewVideo)) {
    state.reviewVideo = videos[0].id;
    releaseReview();
  }
  const video = find("videos", state.reviewVideo);
  if (!state.reviewSrc && isDirectVideo(safeUrl(video.file_url))) state.reviewSrc = safeUrl(video.file_url);
  if (!state.reviewSrc && video.media_path && store.isCloud && state.reviewLoading !== video.id) {
    state.reviewLoading = video.id;
    store
      .mediaUrl(video.media_path)
      .then((url) => {
        if (state.route !== "montage" || state.reviewVideo !== video.id || state.reviewSrc) return;
        state.reviewSrc = url;
        state.reviewName = "Montage en ligne";
        view.innerHTML = renderMontage();
        afterRender();
      })
      .catch((err) => console.warn("Montage en ligne illisible", err))
      .finally(() => (state.reviewLoading = null));
  }
  const fileLink = safeUrl(video.file_url);

  const stage = state.reviewSrc
    ? `<video id="review-player" src="${esc(state.reviewSrc)}" controls playsinline preload="metadata"></video>
       <div class="marks" id="review-marks"></div>`
    : `<div class="stage-empty"><p>${video.media_path && store.isCloud ? "Chargement du montage en ligne…" : "Choisis le fichier du montage sur cet appareil pour le commenter."}</p>
        <p class="muted small">Le fichier reste sur ton appareil : seuls les commentaires sont enregistrés.</p>
        ${fileLink ? `<p class="small"><a href="${esc(fileLink)}" target="_blank" rel="noopener noreferrer">Ouvrir le lien de la fiche</a></p>` : ""}</div>`;

  return `<div class="toolbar">
      <select data-action="review-pick" aria-label="Vidéo à commenter" style="max-width:320px">${videos
        .map((v) => `<option value="${esc(v.id)}" ${v.id === state.reviewVideo ? "selected" : ""}>${esc(v.title)}</option>`)
        .join("")}</select>
      <label class="btn small">Choisir un fichier vidéo<input type="file" accept="video/*" data-action="review-file" hidden></label>
      ${state.reviewName ? `<span class="muted small">${esc(state.reviewName)}</span>` : ""}
      <span class="spacer"></span>
      <button type="button" class="btn small" data-action="edit-video" data-id="${esc(video.id)}">Fiche</button>
    </div>
    <div class="review">
      <div class="review-stage">
        <div class="stage">${stage}</div>
        <form class="quick review-input" data-form="review-comment">
          <span class="timecode" id="review-now">${clock(0)}</span>
          <input type="text" name="body" placeholder="Commente ce moment" aria-label="Commentaire" maxlength="1000" required>
          <button type="submit" class="btn primary">Publier</button>
        </form>
      </div>
      <aside class="panel glass review-side" id="review-comments">${commentsHtml()}</aside>
    </div>`;
}

let timerHandle = null;
function afterRender() {
  if (state.route === "stats") bindCharts();
  clearInterval(timerHandle);
  timerHandle = null;
  if (state.route === "time" && running()) {
    timerHandle = setInterval(() => {
      const el = $("#timer-clock");
      const active = running();
      if (el && active) el.textContent = clock((Date.now() - new Date(active.started_at)) / 1000);
    }, 1000);
  }
  if (state.route === "montage") {
    const player = $("#review-player");
    if (player) {
      const now = () => {
        const el = $("#review-now");
        if (el) el.textContent = clock(player.currentTime);
      };
      player.addEventListener("timeupdate", now);
      player.addEventListener("seeked", now);
      player.addEventListener("loadedmetadata", refreshReview);
      player.addEventListener("error", () => toast("Lecture impossible : ce format ou ce lien n'est pas lisible dans le navigateur.", true));
    }
  }
}

/* ---------- Stats ---------- */

const STATS_RANGES = [
  [7, "7 jours"],
  [30, "30 jours"],
  [90, "90 jours"],
  [0, "Tout"],
];

function metricRows(accountId) {
  return state.db.metrics.filter((m) => m.account_id === accountId).sort((a, b) => a.recorded_on.localeCompare(b.recorded_on));
}

// Dernière valeur connue à une date (on garde le dernier relevé tant qu'il n'y en a pas de nouveau).
function valueOn(rows, key) {
  let found = null;
  for (const m of rows) {
    if (m.recorded_on > key) break;
    found = m;
  }
  return found ? Number(found.followers) || 0 : null;
}

function statsDays() {
  const today = dayKey(new Date());
  const all = state.db.metrics.map((m) => m.recorded_on).filter(Boolean).sort();
  if (!all.length) return [];
  let start = all[0];
  if (state.statsRange) {
    const limit = dayKey(addDays(new Date(), -(state.statsRange - 1)));
    if (limit > start) start = limit;
  }
  const days = [];
  for (let d = fromKey(start); dayKey(d) <= today; d = addDays(d, 1)) days.push(dayKey(d));
  return days;
}

function seriesFor(accounts, days) {
  const rows = accounts.map((a) => metricRows(a.id));
  return days.map((key) => {
    const values = rows.map((r) => valueOn(r, key)).filter((v) => v !== null);
    return { key, value: values.length ? values.reduce((a, b) => a + b, 0) : null };
  });
}

function niceMax(value) {
  if (value <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * pow).find((s) => s * 4 >= value) || pow * 10;
  return Math.ceil(value / step) * step;
}

// Courbe SVG simple : une seule série, axe à zéro, survol avec réticule et bulle.
function lineChart(points, { label, height = 180, compact = false } = {}) {
  const known = points.filter((p) => p.value !== null);
  if (known.length < 2) {
    return `<p class="muted small chart-empty">${known.length ? "Un seul relevé pour l'instant : la courbe apparaît dès le deuxième jour où Régie est ouvert." : "Pas encore de relevé sur cette période."}</p>`;
  }
  const w = 600;
  const h = height;
  const pad = compact ? { l: 4, r: 4, t: 8, b: 4 } : { l: 44, r: 12, t: 12, b: 24 };
  const min = Math.min(...known.map((p) => p.value));
  const maxRaw = Math.max(...known.map((p) => p.value));
  // Axe à zéro pour le total ; les petites courbes zooment sur leur plage pour montrer la tendance.
  const lo = compact ? Math.max(0, min - Math.max(1, (maxRaw - min) * 0.2)) : 0;
  const hi = compact ? maxRaw + Math.max(1, (maxRaw - min) * 0.2) : niceMax(maxRaw);
  const x = (i) => pad.l + (i / Math.max(1, points.length - 1)) * (w - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (h - pad.t - pad.b);
  let d = "";
  points.forEach((p, i) => {
    if (p.value === null) return;
    d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
  });
  const grid = compact
    ? ""
    : [0, 0.5, 1]
        .map((f) => {
          const v = lo + (hi - lo) * f;
          return `<line class="grid" x1="${pad.l}" x2="${w - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`;
        })
        .join("");
  const xTicks = compact
    ? ""
    : [0, Math.floor((points.length - 1) / 2), points.length - 1]
        .filter((v, i, a) => a.indexOf(v) === i)
        .map((i) => `<span class="tick x" style="left:${((x(i) / w) * 100).toFixed(2)}%;transform:translateX(${i === 0 ? "0" : i === points.length - 1 ? "-100%" : "-50%"})">${esc(fmt.short.format(fromKey(points[i].key)))}</span>`)
        .join("");
  const yTicks = compact
    ? ""
    : [0, 0.5, 1]
        .map((f) => `<span class="tick y" style="top:${((y(lo + (hi - lo) * f) / h) * 100).toFixed(2)}%">${fmt.num.format(Math.round(lo + (hi - lo) * f))}</span>`)
        .join("");
  const last = known.at(-1);
  const lastIndex = points.lastIndexOf(last);
  const data = esc(JSON.stringify(points.map((p) => [p.key, p.value])));
  return `<div class="chart" data-points="${data}" data-label="${esc(label || "")}" data-pad="${pad.l},${pad.r}">
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(label || "Évolution")}">
      ${grid}
      <path class="line" d="${d}" vector-effect="non-scaling-stroke"/>
      <line class="cross" x1="0" x2="0" y1="${pad.t}" y2="${h - pad.b}" vector-effect="non-scaling-stroke" hidden/>
    </svg>
    ${yTicks}${xTicks}
    <span class="chart-end" style="left:${((x(lastIndex) / w) * 100).toFixed(2)}%;top:${((y(last.value) / h) * 100).toFixed(2)}%"></span>
    <div class="chart-tip" hidden></div>
  </div>`;
}

function gainOver(accounts, days) {
  const rows = accounts.map((a) => metricRows(a.id));
  const end = dayKey(new Date());
  const start = dayKey(addDays(new Date(), -days));
  let total = 0;
  let known = false;
  rows.forEach((r) => {
    const now = valueOn(r, end);
    const before = valueOn(r, start) ?? (r[0] && r[0].recorded_on > start ? Number(r[0].followers) : null);
    if (now !== null && before !== null) {
      total += now - before;
      known = true;
    }
  });
  return known ? total : null;
}

const signed = (v) => (v === null ? "–" : `${v > 0 ? "+" : ""}${fmt.num.format(v)}`);
const deltaClass = (v) => (v > 0 ? "up" : v < 0 ? "down" : "");

function renderStats() {
  const accounts = sortedAccounts();
  if (!accounts.length || !state.db.metrics.length) {
    return `<section class="panel glass">${emptyState("Branche tes comptes dans Comptes : Régie relève tes abonnés chaque jour et les courbes apparaissent ici.", "go-accounts", "Ouvrir Comptes")}</section>`;
  }
  const scope = state.statsPlatform ? accounts.filter((a) => a.platform === state.statsPlatform) : accounts;
  const days = statsDays();
  const today = dayKey(new Date());
  const totalNow = scope.reduce((sum, a) => sum + (valueOn(metricRows(a.id), today) ?? 0), 0);
  const periodDays = state.statsRange || Math.max(1, days.length - 1);
  const gainPeriod = gainOver(scope, periodDays);
  const gain7 = gainOver(scope, 7);
  const best = scope
    .map((a) => ({ a, g: gainOver([a], periodDays) }))
    .filter((x) => x.g !== null)
    .sort((p, q) => q.g - p.g)[0];
  const rangeLabel = STATS_RANGES.find(([n]) => n === state.statsRange)?.[1] || "Tout";

  const filters = `<div class="stats-filters">
    <div class="segmented" role="group" aria-label="Période">${STATS_RANGES.map(
      ([n, l]) => `<button type="button" data-action="stats-range" data-range="${n}" aria-pressed="${state.statsRange === n}">${l}</button>`
    ).join("")}</div>
    <div class="chips">
      <button type="button" class="chip" data-action="stats-platform" data-platform="" aria-pressed="${!state.statsPlatform}">Tous les réseaux</button>
      ${Object.entries(PLATFORMS)
        .filter(([k]) => accounts.some((a) => a.platform === k))
        .map(([k, l]) => `<button type="button" class="chip" data-action="stats-platform" data-platform="${k}" aria-pressed="${state.statsPlatform === k}"><i class="dot p-${k}"></i>${l}</button>`)
        .join("")}
    </div>
  </div>`;

  const kpis = `<div class="kpis">
    <div class="kpi"><span class="kpi-label">Abonnés au total</span><span class="kpi-value">${fmt.num.format(totalNow)}</span><span class="muted small">${scope.length} compte${scope.length > 1 ? "s" : ""}</span></div>
    <div class="kpi"><span class="kpi-label">Gagnés sur ${esc(rangeLabel.toLowerCase())}</span><span class="kpi-value delta ${deltaClass(gainPeriod)}">${signed(gainPeriod)}</span><span class="muted small">${gain7 !== null && state.statsRange !== 7 ? `${signed(gain7)} ces 7 derniers jours` : "&nbsp;"}</span></div>
    <div class="kpi"><span class="kpi-label">Meilleure progression</span><span class="kpi-value small-value">${best && best.g > 0 ? esc(best.a.name) : "–"}</span><span class="muted small">${best && best.g > 0 ? `${esc(PLATFORMS[best.a.platform])}, ${signed(best.g)}` : "Pas encore de progression mesurée"}</span></div>
  </div>`;

  const total = `<section class="panel glass full"><div class="panel-head"><h2>Abonnés ${state.statsPlatform ? `sur ${esc(PLATFORMS[state.statsPlatform])}` : "sur tous tes réseaux"}</h2><span class="muted small">${esc(rangeLabel)}</span></div>
    ${lineChart(seriesFor(scope, days), { label: "Abonnés au total" })}
  </section>`;

  const byPlatform = Object.entries(PLATFORMS)
    .map(([k, l]) => ({ k, l, v: accounts.filter((a) => a.platform === k).reduce((s, a) => s + (valueOn(metricRows(a.id), today) ?? 0), 0), n: accounts.filter((a) => a.platform === k).length }))
    .filter((p) => p.n)
    .sort((a, b) => b.v - a.v);
  const top = Math.max(1, ...byPlatform.map((p) => p.v));
  const platformsPanel = state.statsPlatform
    ? ""
    : `<section class="panel glass align-start"><div class="panel-head"><h2>Par réseau</h2><span class="muted small">aujourd'hui</span></div>
      ${byPlatform
        .map(
          (p) => `<div class="goal p-${p.k}"><span class="goal-top"><span class="row-title">${esc(p.l)}</span><span class="small">${fmt.num.format(p.v)}</span></span>
          <span class="bar"><i style="width:${((p.v / top) * 100).toFixed(1)}%"></i></span></div>`
        )
        .join("")}
    </section>`;

  const multiples = scope
    .map((a) => {
      const rows = metricRows(a.id);
      const now = valueOn(rows, today);
      const g = gainOver([a], periodDays);
      return `<div class="mini p-${esc(a.platform)}">
        <div class="mini-head">${accountBadge(a)}<span class="figure-label">${esc(a.name)}</span></div>
        <div class="figure-platform">${esc(PLATFORMS[a.platform])}${a.handle ? ` <span>${esc(a.handle)}</span>` : ""}</div>
        <div class="mini-value"><span>${now === null ? "–" : fmt.num.format(now)}</span><span class="delta ${deltaClass(g)}">${g === null ? "" : signed(g)}</span></div>
        ${lineChart(seriesFor([a], days), { label: `${a.name}, ${PLATFORMS[a.platform]}`, height: 70, compact: true })}
      </div>`;
    })
    .join("");

  const table = `<section class="panel glass full"><div class="panel-head"><h2>Détail par compte</h2></div>
    <div class="table-wrap"><table class="table stats-table"><thead><tr><th>Compte</th><th>Réseau</th><th class="num">Abonnés</th><th class="num">7 jours</th><th class="num">30 jours</th><th class="num">Contenus</th></tr></thead>
    <tbody>${scope
      .map((a) => {
        const now = valueOn(metricRows(a.id), today);
        const g7 = gainOver([a], 7);
        const g30 = gainOver([a], 30);
        return `<tr><td>${esc(a.name)}${a.handle ? ` <span class="muted small">${esc(a.handle)}</span>` : ""}</td><td>${esc(PLATFORMS[a.platform])}</td>
          <td class="num">${now === null ? "–" : fmt.num.format(now)}</td><td class="num delta ${deltaClass(g7)}">${signed(g7)}</td><td class="num delta ${deltaClass(g30)}">${signed(g30)}</td>
          <td class="num">${a.content_count == null ? "–" : fmt.num.format(a.content_count)}</td></tr>`;
      })
      .join("")}</tbody></table></div>
    <p class="muted small">Régie relève tes abonnés une fois par jour, quand tu l'ouvres. Un jour sans ouverture reprend la dernière valeur connue.</p>
  </section>`;

  return `${filters}${kpis}<div class="home">${total}
    <section class="panel glass ${state.statsPlatform ? "full" : ""}"><div class="panel-head"><h2>Par compte</h2><span class="muted small">${esc(rangeLabel)}</span></div><div class="minis">${multiples}</div></section>
    ${platformsPanel}${table}</div>`;
}

// Survol des courbes : réticule vertical + bulle avec la date et la valeur.
function bindCharts() {
  view.querySelectorAll(".chart[data-points]").forEach((chart) => {
    const points = JSON.parse(chart.dataset.points);
    const [padL, padR] = chart.dataset.pad.split(",").map(Number);
    const svg = chart.querySelector("svg");
    const cross = chart.querySelector(".cross");
    const tip = chart.querySelector(".chart-tip");
    const move = (event) => {
      const box = svg.getBoundingClientRect();
      const vx = ((event.clientX - box.left) / box.width) * 600;
      const span = 600 - padL - padR;
      const i = Math.max(0, Math.min(points.length - 1, Math.round(((vx - padL) / span) * (points.length - 1))));
      const [key, value] = points[i];
      const px = padL + (i / Math.max(1, points.length - 1)) * span;
      cross.setAttribute("x1", px);
      cross.setAttribute("x2", px);
      cross.hidden = false;
      tip.hidden = false;
      tip.innerHTML = `<span class="muted">${esc(fmt.day.format(fromKey(key)))}</span><strong>${value === null ? "–" : fmt.num.format(value)}</strong>`;
      const left = (px / 600) * box.width;
      tip.style.left = `${Math.min(Math.max(left, 50), box.width - 50)}px`;
    };
    const leave = () => {
      cross.hidden = true;
      tip.hidden = true;
    };
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerdown", move);
    svg.addEventListener("pointerleave", leave);
  });
}

/* ---------- Publication ---------- */

const MAX_UPLOAD = 50 * 1024 * 1024;
const TARGET_LABEL = {
  pending: "En attente",
  running: "En cours",
  published: "Publié",
  draft_sent: "Dans ta boîte TikTok",
  error: "Échec",
};

const canPublish = (a) => (a.platform === "instagram" && a.access_token) || (a.platform === "tiktok" && a.refresh_token);
const sizeText = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(bytes / 1024))} ko`);

function targetLine(t) {
  const a = accountOf(t.account_id);
  const live = state.pubSteps[`${t.account_id}`];
  const status = t.status === "running" && live ? live : TARGET_LABEL[t.status] || t.status;
  const cls = t.status === "published" || t.status === "draft_sent" ? "ok" : t.status === "error" ? "sponsor" : "";
  return `<li class="pub-target p-${esc(t.platform)}">
    ${a ? accountBadge(a) : `<i class="dot p-${esc(t.platform)}"></i>`}
    <span class="pub-name">${esc(a?.name || PLATFORMS[t.platform])} <span class="muted small">${esc(PLATFORMS[t.platform])}</span></span>
    <span class="tag ${cls}">${t.status === "running" ? '<i class="spin"></i>' : ""}${esc(status)}</span>
    ${t.error ? `<span class="pub-error small">${esc(t.error)}</span>` : ""}
  </li>`;
}

function renderPublish() {
  const accounts = sortedAccounts().filter((a) => a.platform === "instagram" || a.platform === "tiktok");
  const ready = accounts.filter(canPublish);
  const history = [...state.db.publications].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const videos = state.db.videos.filter((v) => v.status !== "publie").sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  if (!store.isCloud) {
    return `<section class="panel glass">${emptyState("La publication fonctionne avec ton compte en ligne : connecte-toi à Régie pour l'utiliser.")}</section>`;
  }
  const form = ready.length
    ? `<form class="panel glass publish-form" data-form="publish">
      <div class="panel-head"><h2>Nouvelle publication</h2></div>
      <label class="dropzone">
        <input type="file" name="file" accept="video/mp4,video/quicktime,video/webm" data-action="publish-file">
        <span class="dropzone-text"><strong>${state.pubFile ? esc(state.pubFile.name) : "Choisir la vidéo"}</strong>
          <span class="muted small">${state.pubFile ? sizeText(state.pubFile.size) : "MP4 ou MOV, format vertical conseillé, 50 Mo maximum"}</span></span>
      </label>
      ${state.pubPreview ? `<video class="pub-preview" src="${esc(state.pubPreview)}" controls playsinline muted></video>` : ""}
      ${videos.length ? field("Vidéo de Régie (facultatif)", `<select name="video_id" data-action="publish-link"><option value="">Aucune</option>${videos.map((v) => `<option value="${esc(v.id)}" ${state.pubVideo === v.id ? "selected" : ""}>${esc(v.title)}</option>`).join("")}</select>`) : ""}
      <label class="field"><span>Légende</span><textarea name="caption" rows="5" maxlength="2200" data-caption placeholder="Texte, hashtags, mentions…">${esc(state.pubCaption)}</textarea></label>
      <fieldset class="choices"><legend>Publier sur</legend>${accounts
        .map((a) => {
          const ok = canPublish(a);
          return `<label class="choice p-${esc(a.platform)} ${ok ? "" : "is-off"}"><input type="checkbox" name="targets" value="${esc(a.id)}" ${ok ? "" : "disabled"} ${ok && (state.pubChecked || []).includes(a.id) ? "checked" : ""}><span>${accountBadge(a)}${esc(a.name)} <em class="choice-plat">${esc(PLATFORMS[a.platform])}</em></span></label>`;
        })
        .join("")}</fieldset>
      <ul class="pub-notes muted small">
        <li><strong>Instagram</strong> : publié directement en Reel, avec la légende.</li>
        <li><strong>TikTok</strong> : la vidéo arrive dans tes notifications TikTok. Ouvre-la, colle la légende (Régie la copie pour toi) et publie. TikTok n'autorise pas encore Régie à publier directement.</li>
      </ul>
      <p class="form-error" role="alert" hidden></p>
      <div class="modal-actions"><span class="spacer"></span><button type="submit" class="btn primary" ${state.pubRunning ? "disabled" : ""}>${state.pubRunning ? "Publication en cours…" : "Publier"}</button></div>
    </form>`
    : `<section class="panel glass">${emptyState("Connecte d'abord un compte Instagram ou TikTok dans Comptes pour publier depuis Régie.", "go-accounts", "Ouvrir Comptes")}</section>`;
  const list = history.length
    ? `<ul class="rows pub-history">${history
        .map((p) => {
          const v = p.video_id ? find("videos", p.video_id) : null;
          const hasDraft = p.targets.some((t) => t.status === "draft_sent");
          return `<li class="pub-item">
            <div class="pub-top"><span class="row-title">${esc(v?.title || p.file_name || "Vidéo")}</span><span class="muted small">${esc(when(p.created_at))}</span></div>
            ${p.caption ? `<p class="pub-caption small">${esc(p.caption)}</p>` : ""}
            <ul class="pub-targets">${p.targets.map(targetLine).join("")}</ul>
            <div class="pub-actions">
              ${hasDraft && p.caption ? `<button type="button" class="btn small" data-action="publish-copy" data-id="${esc(p.id)}">Copier la légende</button>` : ""}
              ${p.targets.some((t) => t.status === "error") && p.media_path ? `<button type="button" class="btn small" data-action="publish-retry" data-id="${esc(p.id)}" ${state.pubRunning ? "disabled" : ""}>Réessayer</button>` : ""}
              <button type="button" class="btn small ghost" data-action="publish-delete" data-id="${esc(p.id)}">Retirer de l'historique</button>
            </div>
          </li>`;
        })
        .join("")}</ul>`
    : `<p class="muted small">Tes publications apparaîtront ici, avec leur état sur chaque compte.</p>`;
  return `<div class="home publish">${form}<section class="panel glass align-start"><div class="panel-head"><h2>Historique</h2></div>${list}</section></div>`;
}

// Garde la légende et la vidéo liée quand la page se redessine (choix du fichier).
function keepPublishDraft() {
  const box = view.querySelector("[data-caption]");
  if (box) state.pubCaption = box.value;
  const link = view.querySelector('select[name="video_id"]');
  if (link) state.pubVideo = link.value || null;
  state.pubChecked = [...view.querySelectorAll('input[name="targets"]:checked')].map((i) => i.value);
}

async function savePublication(pub) {
  const saved = await store.update("publications", pub.id, { targets: pub.targets, media_path: pub.media_path });
  Object.assign(pub, saved);
}

async function runTargets(pub) {
  state.pubRunning = true;
  if (state.route === "publish") render();
  let videoUrl = null;
  const jobs = pub.targets.map(async (t, index) => {
    if (t.status === "published" || t.status === "draft_sent") return;
    const account = accountOf(t.account_id);
    const step = (text) => {
      state.pubSteps[t.account_id] = text;
      if (state.route === "publish") render();
    };
    pub.targets[index] = { ...t, status: "running", error: null };
    step("Envoi");
    try {
      if (!account || !canPublish(account)) throw new Error("ce compte n'est plus connecté");
      if (account.platform === "instagram") {
        videoUrl ||= await store.mediaUrl(pub.media_path);
        const id = await instagram.publishReel({ token: account.access_token, id: account.external_id, videoUrl, caption: pub.caption, onStep: step });
        pub.targets[index] = { ...pub.targets[index], status: "published", remote_id: id, done_at: new Date().toISOString() };
      } else {
        step("Envoi vers TikTok");
        const res = await tiktok.sendDraft(account.refresh_token, pub.media_path);
        Object.assign(account, await store.update("accounts", account.id, { access_token: res.access_token, refresh_token: res.refresh_token, token_expires_at: res.refresh_expires_at }));
        pub.targets[index] = { ...pub.targets[index], status: "draft_sent", remote_id: res.publish_id, done_at: new Date().toISOString() };
      }
    } catch (err) {
      console.error(err);
      if (err instanceof instagram.InstagramExpired || err instanceof tiktok.TikTokExpired) state.reconnect[t.account_id] = true;
      if (err.tokens?.refresh_token && account) {
        await store.update("accounts", account.id, { access_token: err.tokens.access_token, refresh_token: err.tokens.refresh_token }).then((row) => Object.assign(account, row)).catch(() => {});
      }
      pub.targets[index] = { ...pub.targets[index], status: "error", error: err.message };
    }
    delete state.pubSteps[t.account_id];
    await savePublication(pub).catch((e) => console.warn(e));
    if (state.route === "publish") render();
  });
  await Promise.all(jobs);
  // La vidéo n'est plus utile une fois envoyée partout : on libère la place.
  if (pub.targets.every((t) => t.status === "published" || t.status === "draft_sent") && pub.media_path) {
    await store.removeMedia(pub.media_path).catch((e) => console.warn(e));
    pub.media_path = null;
    await savePublication(pub).catch((e) => console.warn(e));
  }
  state.pubRunning = false;
  const okCount = pub.targets.filter((t) => t.status !== "error").length;
  toast(okCount === pub.targets.length ? "Publication terminée" : `${pub.targets.length - okCount} envoi${pub.targets.length - okCount > 1 ? "s" : ""} en échec : regarde l'historique.`, okCount !== pub.targets.length);
  if (pub.caption && pub.targets.some((t) => t.status === "draft_sent")) navigator.clipboard?.writeText(pub.caption).catch(() => {});
  if (state.route === "publish") render();
}

async function submitPublish(form) {
  const data = new FormData(form);
  const error = form.querySelector(".form-error");
  const fail = (message) => {
    error.textContent = message;
    error.hidden = false;
  };
  const file = state.pubFile;
  const ids = data.getAll("targets");
  if (!file) return fail("Choisis la vidéo à publier.");
  if (file.size > MAX_UPLOAD) return fail(`Cette vidéo fait ${sizeText(file.size)} : la limite est de 50 Mo. Exporte-la un peu plus légère.`);
  if (!ids.length) return fail("Coche au moins un compte.");
  const caption = String(data.get("caption") || "").trim();
  state.pubCaption = caption;
  state.pubRunning = true;
  render();
  let pub;
  try {
    toast("Envoi de la vidéo…");
    const path = await store.uploadMedia(file);
    pub = await store.insert("publications", {
      video_id: text(data, "video_id"),
      caption,
      media_path: path,
      file_name: file.name,
      targets: ids.map((id) => ({ account_id: id, platform: accountOf(id)?.platform, status: "pending" })),
    });
    state.db.publications.push(pub);
  } catch (err) {
    console.error(err);
    state.pubRunning = false;
    toast(`Envoi impossible : ${err.message}.`, true);
    render();
    return;
  }
  if (state.pubPreview) URL.revokeObjectURL(state.pubPreview);
  state.pubFile = null;
  state.pubPreview = null;
  state.pubCaption = "";
  state.pubVideo = null;
  await runTargets(pub);
}

/* ---------- Comptes ---------- */

function connectionTag(a) {
  if (state.reconnect[a.id]) return '<span class="tag sponsor">À reconnecter</span>';
  if (state.notFound[a.id]) return '<span class="tag sponsor">Chaîne introuvable : vérifie le @</span>';
  const since = a.synced_at ? `, à jour à ${esc(fmt.time.format(new Date(a.synced_at)))}` : "";
  if (a.access_token) return `<span class="tag ok">Connecté${since}</span>`;
  if (a.platform === "youtube" && a.external_id && youtube.enabled) return `<span class="tag ok">Automatique${since}</span>`;
  return "";
}

// Récupère les chiffres des comptes connectés et les enregistre comme relevé du jour.
async function saveFollowers(account, followers) {
  const latest = figureFor(account.id)?.latest;
  const row = await store.saveMetric({
    account_id: account.id,
    platform: account.platform,
    recorded_on: todayKey(),
    followers,
    views: latest?.views ?? 0,
  });
  state.db.metrics = state.db.metrics.filter((m) => !(m.account_id === account.id && m.recorded_on === row.recorded_on));
  state.db.metrics.push(row);
}

async function syncConnected({ quiet = true } = {}) {
  if (state.syncing) return;
  const twitchList = twitch.enabled ? state.db.accounts.filter((a) => a.platform === "twitch" && a.access_token && a.external_id) : [];
  const youtubeList = youtube.enabled ? state.db.accounts.filter((a) => a.platform === "youtube" && (a.external_id || a.handle)) : [];
  const instagramList = state.db.accounts.filter((a) => a.platform === "instagram" && a.access_token);
  const tiktokList = tiktok.enabled ? state.db.accounts.filter((a) => a.platform === "tiktok" && a.refresh_token) : [];
  if (!twitchList.length && !youtubeList.length && !instagramList.length && !tiktokList.length) return;
  state.syncing = true;
  let changed = false;
  const report = (label, err) => {
    console.warn(`Actualisation ${label} impossible`, err);
    if (!quiet) toast(`Actualisation ${label} impossible : ${err.message}.`, true);
  };
  try {
    for (const account of twitchList) {
      try {
        const check = await twitch.validate(account.access_token);
        const stats = await twitch.fetchStats(account.access_token, account.external_id);
        state.live[account.id] = stats.live;
        delete state.reconnect[account.id];
        await saveFollowers(account, stats.followers);
        Object.assign(account, await store.update("accounts", account.id, { synced_at: new Date().toISOString(), token_expires_at: check.expiresAt }));
        changed = true;
      } catch (err) {
        if (err instanceof twitch.TwitchExpired) {
          state.reconnect[account.id] = true;
          changed = true;
        } else report("Twitch", err);
      }
    }
    for (const account of youtubeList) {
      try {
        const channel = await youtube.fetchChannel({ id: account.external_id, handle: account.handle });
        delete state.notFound[account.id];
        if (channel.subscribers !== null) await saveFollowers(account, channel.subscribers);
        const patch = { synced_at: new Date().toISOString() };
        if (account.external_id !== channel.id) patch.external_id = channel.id;
        if (channel.avatar && account.avatar_url !== channel.avatar) patch.avatar_url = channel.avatar;
        if (channel.videos != null) patch.content_count = Number(channel.videos);
        Object.assign(account, await store.update("accounts", account.id, patch));
        changed = true;
      } catch (err) {
        if (err instanceof youtube.ChannelNotFound) {
          state.notFound[account.id] = true;
          changed = true;
        } else report("YouTube", err);
      }
    }
    for (const account of instagramList) {
      try {
        const patch = {};
        if (instagram.shouldRefresh(account.access_token, account.token_expires_at)) {
          try {
            const fresh = await instagram.refresh(account.access_token);
            patch.access_token = fresh.token;
            patch.token_expires_at = fresh.expiresAt;
          } catch (err) {
            if (err instanceof instagram.InstagramExpired) throw err;
            console.warn("Prolongation de la clé Instagram reportée", err);
          }
        }
        const profile = await instagram.fetchProfile(patch.access_token || account.access_token, account.external_id);
        delete state.reconnect[account.id];
        if (profile.followers !== null) await saveFollowers(account, profile.followers);
        patch.synced_at = new Date().toISOString();
        if (account.external_id !== profile.id) patch.external_id = profile.id;
        if (profile.avatar && account.avatar_url !== profile.avatar) patch.avatar_url = profile.avatar;
        if (profile.posts != null) patch.content_count = Number(profile.posts);
        Object.assign(account, await store.update("accounts", account.id, patch));
        changed = true;
      } catch (err) {
        if (err instanceof instagram.InstagramExpired) {
          state.reconnect[account.id] = true;
          changed = true;
        } else report("Instagram", err);
      }
    }
    for (const account of tiktokList) {
      try {
        const res = await tiktok.sync(account.refresh_token);
        delete state.reconnect[account.id];
        if (res.profile.followers !== null) await saveFollowers(account, res.profile.followers);
        const patch = {
          access_token: res.access_token,
          refresh_token: res.refresh_token,
          token_expires_at: res.refresh_expires_at,
          synced_at: new Date().toISOString(),
        };
        if (res.profile.id && account.external_id !== res.profile.id) patch.external_id = res.profile.id;
        if (res.profile.avatar) patch.avatar_url = res.profile.avatar;
        if (res.profile.videos != null) patch.content_count = Number(res.profile.videos);
        Object.assign(account, await store.update("accounts", account.id, patch));
        changed = true;
      } catch (err) {
        if (err.tokens?.refresh_token) {
          await store.update("accounts", account.id, { access_token: err.tokens.access_token, refresh_token: err.tokens.refresh_token }).then((row) => Object.assign(account, row)).catch(() => {});
        }
        if (err instanceof tiktok.TikTokExpired) {
          state.reconnect[account.id] = true;
          changed = true;
        } else report("TikTok", err);
      }
    }
  } finally {
    state.syncing = false;
  }
  if (changed && !modal.open) render();
}

async function finishTwitchConnect(token) {
  try {
    const profile = await twitch.fetchProfile(token);
    const check = await twitch.validate(token);
    const twitchAccounts = state.db.accounts.filter((a) => a.platform === "twitch");
    const unlinked = twitchAccounts.filter((a) => !a.external_id);
    const existing =
      twitchAccounts.find((a) => a.external_id === profile.id) ||
      unlinked.find((a) => [a.name, a.handle].some((v) => String(v || "").replace(/^@/, "").toLowerCase() === profile.login)) ||
      (unlinked.length === 1 ? unlinked[0] : null);
    const row = {
      platform: "twitch",
      name: profile.name,
      handle: `@${profile.login}`,
      external_id: profile.id,
      avatar_url: profile.avatar,
      access_token: token,
      token_expires_at: check.expiresAt,
    };
    if (existing) Object.assign(existing, await store.update("accounts", existing.id, row));
    else state.db.accounts.push(await store.insert("accounts", { ...row, position: twitchAccounts.length }));
    toast(`Twitch connecté : ${profile.name}`);
    state.route = "accounts";
    render();
    await syncConnected({ quiet: false });
  } catch (err) {
    console.error(err);
    toast(`Connexion Twitch impossible : ${err.message}.`, true);
  }
}



async function finishTikTokConnect(code) {
  try {
    const res = await tiktok.exchange(code);
    const p = res.profile;
    const norm = (v) => String(v || "").replace(/^@/, "").toLowerCase();
    const tiktokAccounts = state.db.accounts.filter((a) => a.platform === "tiktok");
    const unlinked = tiktokAccounts.filter((a) => !a.external_id);
    const existing =
      tiktokAccounts.find((a) => a.external_id === p.id) ||
      (p.username && unlinked.find((a) => norm(a.handle) === norm(p.username))) ||
      (unlinked.length === 1 ? unlinked[0] : null);
    const row = {
      platform: "tiktok",
      external_id: p.id,
      avatar_url: p.avatar,
      content_count: p.videos ?? null,
      access_token: res.access_token,
      refresh_token: res.refresh_token,
      token_expires_at: res.refresh_expires_at,
      synced_at: new Date().toISOString(),
    };
    if (p.username) row.handle = `@${p.username}`;
    let account;
    if (existing) account = Object.assign(existing, await store.update("accounts", existing.id, row));
    else {
      account = await store.insert("accounts", { ...row, name: p.name || p.username || "TikTok", position: tiktokAccounts.length });
      state.db.accounts.push(account);
    }
    delete state.reconnect[account.id];
    if (p.followers !== null) await saveFollowers(account, p.followers);
    toast(`TikTok connecté : ${account.name}`);
    state.route = "accounts";
    render();
  } catch (err) {
    console.error(err);
    toast(`Connexion TikTok impossible : ${err.message}.`, true);
  }
}

function renderAccounts() {
  const list = sortedAccounts();
  const counts = new Map();
  state.db.videos.forEach((v) => (v.account_ids || []).forEach((id) => counts.set(id, (counts.get(id) || 0) + 1)));
  const intro = list.length
    ? ""
    : `<div class="panel glass" style="margin-bottom:12px">${emptyState(
        "Ajoute chacun de tes comptes : tu pourras rattacher tes vidéos au bon compte, filtrer par compte et suivre leurs chiffres séparément."
      )}</div>`;
  const groups = Object.entries(PLATFORMS)
    .map(([key, label]) => {
      const items = list.filter((a) => a.platform === key);
      return `<section class="panel glass">
        <div class="panel-head"><h2><i class="dot p-${key}"></i> ${label}</h2>
          ${key === "twitch" && twitch.enabled ? '<button type="button" class="btn small primary" data-action="twitch-connect">Se connecter avec Twitch</button>' : ""}
          ${key === "tiktok" && tiktok.enabled ? '<button type="button" class="btn small primary" data-action="tiktok-connect">Se connecter avec TikTok</button>' : ""}
          <button type="button" class="btn small" data-action="new-account" data-platform="${key}">Ajouter${(key === "twitch" && twitch.enabled) || (key === "tiktok" && tiktok.enabled) ? " à la main" : " un compte"}</button></div>
        ${
          items.length
            ? `<ul class="rows">${items
                .map((a) => {
                  const n = counts.get(a.id) || 0;
                  return `<li class="row">${accountBadge(a)}
                  <button type="button" class="row-main" data-action="edit-account" data-id="${esc(a.id)}">
                    <span class="row-title">${esc(a.name)}</span>
                    <span class="row-sub">${a.handle ? `<span>${esc(a.handle)}</span>` : ""}${contentCount(a)}${n ? `<span>${n} dans Régie</span>` : ""}${connectionTag(a)}</span>
                  </button></li>`;
                })
                .join("")}</ul>`
            : `<p class="muted small">Aucun compte ${esc(label)}.</p>`
        }
        ${key === "youtube" && youtube.enabled ? '<p class="muted small">Le @ de chaque chaîne suffit : abonnés et photo se mettent à jour tout seuls.</p>' : ""}
        ${key === "tiktok" && tiktok.enabled ? '<p class="muted small">Pour chaque compte : « Se connecter avec TikTok », puis connecte-toi avec ce compte. Déconnecte-toi de TikTok entre les deux.</p>' : ""}
        ${key === "instagram" ? '<p class="muted small">Ouvre un compte et colle sa clé d\'accès Meta : abonnés et photo se mettent à jour tout seuls.</p>' : ""}
      </section>`;
    })
    .join("");
  return `${intro}<div class="home accounts-grid">${groups}</div>`;
}

function accountForm(account, defaults = {}) {
  const a = account || { platform: defaults.platform || "youtube" };
  openForm({
    title: account ? "Modifier le compte" : "Nouveau compte",
    body: `
      ${field(
        "Plateforme",
        `<select name="platform" data-action="account-platform">${Object.entries(PLATFORMS)
          .map(([key, label]) => `<option value="${key}" ${a.platform === key ? "selected" : ""}>${label}</option>`)
          .join("")}</select>`
      )}
      ${field("Nom affiché", `<input type="text" name="name" value="${esc(a.name)}" maxlength="60" placeholder="Ma chaîne principale" required>`)}
      ${field("Identifiant", `<input type="text" name="handle" value="${esc(a.handle)}" maxlength="80" placeholder="@moncompte">`)}
      ${youtube.enabled ? '<p class="muted small">Pour YouTube, mets le @ exact de la chaîne : les abonnés se mettent alors à jour tout seuls.</p>' : ""}
      <div data-ig ${a.platform === "instagram" ? "" : "hidden"}>${field(
        "Clé d'accès Instagram",
        `<input type="password" name="ig_token" autocomplete="off" spellcheck="false" placeholder="${account?.platform === "instagram" && account.access_token ? "Déjà connecté : colle une nouvelle clé pour la remplacer" : "Colle ici la clé générée chez Meta"}">`
      )}
      ${field("Numéro du compte Instagram", `<input type="text" name="ig_id" inputmode="numeric" value="${esc(a.platform === "instagram" ? a.external_id || "" : "")}" placeholder="Le numéro affiché sous le nom du compte chez Meta">`)}
      <p class="muted small">Avec la clé, les abonnés et la photo se mettent à jour tout seuls. Si un jour la clé expire, le compte affiche « À reconnecter » : il suffit d'en coller une nouvelle.</p></div>
      ${account?.access_token ? `<p class="small">Connecté à ${esc(PLATFORMS[account.platform])} : les abonnés se mettent à jour tout seuls. <button type="button" class="btn small" data-action="twitch-disconnect" data-id="${esc(account.id)}">Déconnecter</button></p>` : ""}
      ${account ? '<p class="muted small">Supprimer le compte efface aussi ses relevés de chiffres. Les vidéos sont gardées.</p>' : ""}`,
    async onSubmit(data) {
      const platform = data.get("platform");
      const row = { platform: platform in PLATFORMS ? platform : "youtube", name: text(data, "name"), handle: text(data, "handle") };
      const igToken = instagram.cleanToken(data.get("ig_token"));
      if (igToken && row.platform === "instagram") {
        let profile;
        const igId = instagram.cleanId(data.get("ig_id")) || account?.external_id;
        try {
          profile = await instagram.fetchProfile(igToken, igId);
        } catch (err) {
          if (err instanceof instagram.MissingId) return "Ajoute aussi le numéro du compte : chez Meta, c'est le numéro écrit sous le nom du compte, à côté de « Générer un token ».";
          return err instanceof instagram.InstagramExpired
            ? "Cette clé n'est pas acceptée par Instagram : regénère-la chez Meta et recolle-la en entier."
            : `Instagram ne répond pas : ${err.message}.`;
        }
        Object.assign(row, { access_token: igToken, token_expires_at: instagram.isUnified(igToken) ? null : instagram.freshExpiry(), external_id: profile.id, avatar_url: profile.avatar });
        if (!row.handle) row.handle = `@${profile.username}`;
        if (!row.name) row.name = profile.username;
        if (account) delete state.reconnect[account.id];
        setTimeout(() => syncConnected({ quiet: false }), 0);
      }
      if (!row.name) return "Donne un nom au compte.";
      if (!account) row.position = state.db.accounts.filter((x) => x.platform === row.platform).length;
      if (account && account.platform === "youtube" && (row.platform !== "youtube" || row.handle !== account.handle)) {
        row.external_id = null;
        row.avatar_url = null;
        delete state.notFound[account.id];
      }
      if (row.platform === "youtube" && youtube.enabled) setTimeout(() => syncConnected({ quiet: false }), 0);
      const saved = await run(() => (account ? store.update("accounts", account.id, row) : store.insert("accounts", row)), "Compte enregistré");
      if (!saved) return "L'enregistrement a échoué.";
      if (!account) {
        state.db.accounts.push(saved);
        return;
      }
      Object.assign(account, saved);
      // Les vidéos rattachées suivent la plateforme du compte.
      for (const v of state.db.videos.filter((x) => (x.account_ids || []).includes(account.id))) {
        const platforms = [...new Set(videoAccounts(v).map((x) => x.platform))];
        if (platforms.join() !== (v.platforms || []).join()) {
          const updated = await run(() => store.update("videos", v.id, { platforms }));
          if (updated) Object.assign(v, updated);
        }
      }
    },
    onDelete: account
      ? async () => {
          const ok = await run(async () => {
            for (const v of state.db.videos.filter((x) => (x.account_ids || []).includes(account.id))) {
              const account_ids = v.account_ids.filter((id) => id !== account.id);
              const platforms = account_ids.length
                ? [...new Set(account_ids.map(accountOf).filter(Boolean).map((x) => x.platform))]
                : v.platforms;
              Object.assign(v, await store.update("videos", v.id, { account_ids, platforms }));
            }
            await store.remove("accounts", account.id);
            return true;
          }, "Compte supprimé");
          if (!ok) return;
          state.db.accounts = state.db.accounts.filter((x) => x.id !== account.id);
          state.db.metrics = state.db.metrics.filter((m) => m.account_id !== account.id);
          state.db.goals.forEach((g) => {
            if (g.account_id === account.id) g.account_id = null;
          });
          if (state.account === account.id) state.account = null;
        }
      : null,
  });
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

function accountChoices(selectedIds = [], selectedPlatforms = []) {
  const list = sortedAccounts();
  if (!list.length) {
    return `${platformChoices(selectedPlatforms)}<p class="muted small">Ajoute tes comptes dans le module Comptes pour choisir le compte exact.</p>`;
  }
  return `<fieldset class="choices"><legend>Comptes</legend>${list
    .map(
      (a) => `<label class="choice p-${esc(a.platform)}"><input type="checkbox" name="account_ids" value="${esc(a.id)}" ${
        selectedIds.includes(a.id) ? "checked" : ""
      }><span>${accountBadge(a)}${esc(a.name)}</span></label>`
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
      ${accountChoices(v.account_ids || [], v.platforms || [])}
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
        status: data.get("status") in STATUS_LABEL ? data.get("status") : "idee",
        planned_at: planned ? new Date(planned).toISOString() : null,
        sponsor: text(data, "sponsor"),
        file_url: text(data, "file_url"),
        thumb_url: text(data, "thumb_url"),
        notes: text(data, "notes"),
      };
      if (!row.title) return "Donne un titre à la vidéo.";
      if (state.db.accounts.length) {
        row.account_ids = data.getAll("account_ids").filter((id) => accountOf(id));
        row.platforms = [...new Set(row.account_ids.map((id) => accountOf(id).platform))];
      } else {
        row.platforms = data.getAll("platforms").filter((p) => p in PLATFORMS);
      }
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
            if (video.media_path) await store.removeMedia(video.media_path).catch(() => {});
            await store.remove("videos", video.id);
            return true;
          }, "Vidéo supprimée");
          if (!ok) return;
          state.db.videos = state.db.videos.filter((x) => x.id !== video.id);
          state.db.tasks.forEach((t) => {
            if (t.video_id === video.id) t.video_id = null;
          });
          state.db.time_entries.forEach((t) => {
            if (t.video_id === video.id) t.video_id = null;
          });
          state.db.review_comments = state.db.review_comments.filter((c) => c.video_id !== video.id);
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
      ${
        state.db.accounts.length
          ? field(
              "Compte",
              `<select name="account_id"><option value="">Aucun</option>${sortedAccounts()
                .map((a) => `<option value="${esc(a.id)}" ${g.account_id === a.id ? "selected" : ""}>${esc(a.name)}, ${esc(PLATFORMS[a.platform])}</option>`)
                .join("")}</select>`
            )
          : field(
              "Plateforme",
              `<select name="platform"><option value="">Aucune</option>${Object.entries(PLATFORMS)
                .map(([key, label]) => `<option value="${key}" ${g.platform === key ? "selected" : ""}>${label}</option>`)
                .join("")}</select>`
            )
      }
      <div class="grid-2">
        ${field("Où tu en es", `<input type="number" name="current_value" value="${esc(g.current_value)}" min="0" step="any" required>`)}
        ${field("Cible", `<input type="number" name="target_value" value="${esc(g.target_value)}" min="1" step="any" required>`)}
      </div>`,
    async onSubmit(data) {
      const row = {
        label: text(data, "label"),
        platform: data.get("platform") in PLATFORMS ? data.get("platform") : null,
        account_id: null,
        current_value: Number(data.get("current_value")),
        target_value: Number(data.get("target_value")),
      };
      if (!row.label) return "Décris ton objectif.";
      const acc = accountOf(data.get("account_id"));
      if (acc) {
        row.account_id = acc.id;
        row.platform = acc.platform;
      } else if (state.db.accounts.length) {
        row.platform = goal?.platform && !goal.account_id ? goal.platform : null;
      }
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
  const list = sortedAccounts();
  if (!list.length) return go("accounts");
  const rows = list
    .map((a) => {
      const latest = figureFor(a.id)?.latest;
      return `<fieldset class="choices p-${esc(a.platform)}" style="display:grid;gap:10px">
        <legend>${accountBadge(a)} ${esc(a.name)} <span class="muted small">${esc(PLATFORMS[a.platform])}</span></legend>
        <div class="grid-2">
          ${field("Abonnés", `<input type="number" name="followers-${esc(a.id)}" min="0" step="1" inputmode="numeric" placeholder="${latest ? latest.followers : "0"}">`)}
          ${field("Vues sur 28 jours", `<input type="number" name="views-${esc(a.id)}" min="0" step="1" inputmode="numeric" placeholder="${latest ? latest.views : "0"}">`)}
        </div></fieldset>`;
    })
    .join("");
  openForm({
    title: "Mettre à jour mes chiffres",
    body: `<p class="muted small">Relevé du jour. Laisse vide un compte que tu ne veux pas mettre à jour. La récupération automatique arrive pour YouTube et Twitch.</p>${rows}`,
    async onSubmit(data) {
      const today = todayKey();
      let saved = 0;
      for (const a of list) {
        const followersRaw = String(data.get(`followers-${a.id}`) || "").trim();
        const viewsRaw = String(data.get(`views-${a.id}`) || "").trim();
        if (!followersRaw && !viewsRaw) continue;
        const latest = figureFor(a.id)?.latest;
        const followers = followersRaw ? Math.floor(Number(followersRaw)) : latest?.followers ?? 0;
        const views = viewsRaw ? Math.floor(Number(viewsRaw)) : latest?.views ?? 0;
        if (!(followers >= 0) || !(views >= 0)) return "Les chiffres doivent être des nombres positifs.";
        const row = await run(() => store.saveMetric({ account_id: a.id, platform: a.platform, recorded_on: today, followers, views }));
        if (!row) return "L'enregistrement a échoué.";
        state.db.metrics = state.db.metrics.filter((m) => !(m.account_id === a.id && m.recorded_on === today));
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
  "quick-add": () => ({ ideas: ideaForm, todo: taskForm, notes: noteForm }[state.route] || videoForm)(),
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
  "filter-account": (el) => {
    state.account = el.dataset.account || null;
    render();
  },
  "go-accounts": () => go("accounts"),
  "publish-file": (el) => {
    const file = el.files?.[0] || null;
    if (state.pubPreview) URL.revokeObjectURL(state.pubPreview);
    state.pubFile = file;
    state.pubPreview = file ? URL.createObjectURL(file) : null;
    keepPublishDraft();
    render();
  },
  "publish-link": (el) => {
    state.pubVideo = el.value || null;
    const v = state.pubVideo ? find("videos", state.pubVideo) : null;
    const box = view.querySelector("[data-caption]");
    if (v && box && !box.value.trim()) box.value = v.title || "";
  },
  "publish-copy": async (el) => {
    const pub = find("publications", el.dataset.id);
    if (!pub?.caption) return;
    try {
      await navigator.clipboard.writeText(pub.caption);
      toast("Légende copiée : colle-la dans TikTok");
    } catch {
      toast("Copie impossible : sélectionne la légende à la main.", true);
    }
  },
  "publish-retry": (el) => {
    const pub = find("publications", el.dataset.id);
    if (pub && !state.pubRunning) runTargets(pub);
  },
  "publish-delete": async (el) => {
    const pub = find("publications", el.dataset.id);
    if (!pub || state.pubRunning) return;
    const ok = await run(async () => {
      if (pub.media_path) await store.removeMedia(pub.media_path).catch(() => {});
      await store.remove("publications", pub.id);
      return true;
    }, "Retiré de l'historique");
    if (ok) state.db.publications = state.db.publications.filter((x) => x.id !== pub.id);
    render();
  },
  "stats-range": (el) => {
    state.statsRange = Number(el.dataset.range) || 0;
    render();
  },
  "stats-platform": (el) => {
    state.statsPlatform = el.dataset.platform || null;
    render();
  },
  "account-platform": (el) => {
    const box = modal.querySelector("[data-ig]");
    if (box) box.hidden = el.value !== "instagram";
  },
  "twitch-connect": () => {
    if (modal.open) modal.close();
    twitch.startLogin();
  },
  "tiktok-connect": () => {
    if (modal.open) modal.close();
    tiktok.startLogin();
  },
  "twitch-disconnect": async (el) => {
    const account = find("accounts", el.dataset.id);
    if (!account?.access_token) return;
    const token = account.access_token;
    const saved = await run(() => store.update("accounts", account.id, { access_token: null, refresh_token: null, token_expires_at: null }), `${PLATFORMS[account.platform]} déconnecté`);
    if (!saved) return;
    Object.assign(account, saved);
    delete state.live[account.id];
    delete state.reconnect[account.id];
    if (account.platform === "twitch") twitch.revoke(token);
    if (modal.open) modal.close();
    render();
  },
  "new-account": (el) => accountForm(null, { platform: el.dataset.platform }),
  "edit-account": (el) => {
    const a = find("accounts", el.dataset.id);
    if (a) accountForm(a);
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
    state.calCursor = state.calMode === "day" ? addDays(c, step) : state.calMode === "week" ? addDays(c, step * 7) : new Date(c.getFullYear(), c.getMonth() + step, 1);
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
  "toggle-nav": (el) => {
    state.navOpen[el.dataset.key] = el.getAttribute("aria-expanded") !== "true";
    if (!state.navOpen[el.dataset.key] && SUBS[el.dataset.key].some(([k]) => k === state.route)) return;
    renderNav();
  },
  more: () => {
    modal.innerHTML = `<form method="dialog"><div class="modal-head"><h2>Modules</h2>
      <button type="submit" class="icon-btn" aria-label="Fermer">✕</button></div>
      <div class="nav more-nav">${ROUTES.filter(([key]) => !TAB_ROUTES.includes(key))
        .map(([key, label, paths, parent]) => `<button type="submit" data-action="go" data-route="${key}">${paths ? icon(paths) : '<span style="width:16px"></span>'}<span>${parent ? ROUTES.find((r) => r[0] === parent)[1] + ", " : ""}${label}${SUBS[key] ? ", " + SUBS[key][0][1] : ""}</span></button>`)
        .join("")}</div>
      <p class="muted small">${esc(state.user?.email || "")}</p>
      ${store.isCloud ? '<button type="submit" class="btn" data-action="sign-out">Se déconnecter</button>' : ""}</form>`;
    modal.showModal();
  },
  theme: () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* le thème ne sera pas mémorisé */
    }
  },
  "cal-show": (el) => {
    state.calShow[el.dataset.key] = el.checked;
    render();
  },
  "new-note": () => noteForm(),
  "edit-note": (el) => {
    const n = find("notes", el.dataset.id);
    if (n) noteForm(n);
  },
  "new-time": () => timeForm(),
  "edit-time": (el) => {
    const e = find("time_entries", el.dataset.id);
    if (e) timeForm(e);
  },
  "time-stop": async () => {
    const active = running();
    if (!active) return;
    const saved = await run(() => store.update("time_entries", active.id, { ended_at: new Date().toISOString() }), "Chrono arrêté");
    if (saved) Object.assign(active, saved);
    render();
  },
  "time-move": (el) => {
    state.timeDay = addDays(state.timeDay, Number(el.dataset.step));
    render();
  },
  "time-today": () => {
    state.timeDay = new Date();
    render();
  },
  "review-pick": (el) => {
    state.reviewVideo = el.value;
    releaseReview();
    render();
  },
  "review-file": (el) => {
    const file = el.files?.[0];
    if (!file) return;
    releaseReview();
    state.reviewSrc = URL.createObjectURL(file);
    state.reviewName = file.name;
    view.innerHTML = renderMontage();
    afterRender();
  },
  "review-seek": (el) => {
    const player = $("#review-player");
    if (!player) return toast("Charge d'abord le fichier vidéo pour aller à ce moment.");
    player.currentTime = Number(el.dataset.at);
    player.pause();
  },
  "review-resolve": async (el) => {
    const c = find("review_comments", el.dataset.id);
    if (!c) return;
    const saved = await run(() => store.update("review_comments", c.id, { resolved: el.checked }));
    if (saved) Object.assign(c, saved);
    refreshReview();
  },
  "review-delete": async (el) => {
    const id = el.dataset.id;
    const ok = await run(async () => {
      await store.remove("review_comments", id);
      return true;
    });
    if (ok) state.db.review_comments = state.db.review_comments.filter((c) => c.id !== id);
    refreshReview();
  },
  "sign-out": async () => {
    await store.auth.signOut();
    location.reload();
  },
};

document.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]");
  if (!el || el.matches("input[type=checkbox], select, input[type=file]")) return;
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
  const el = event.target.closest("input[type=checkbox][data-action], select[data-action], input[type=file][data-action]");
  if (el) actions[el.dataset.action]?.(el, event);
});

view.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  const data = new FormData(form);
  if (form.dataset.form === "publish") {
    if (!state.pubRunning) await submitPublish(form);
    return;
  }
  if (form.dataset.form === "time-start") {
    if (running()) return;
    const saved = await run(
      () => store.insert("time_entries", { label: text(data, "label"), video_id: text(data, "video_id"), started_at: new Date().toISOString(), ended_at: null }),
      "Chrono lancé"
    );
    if (saved) state.db.time_entries.push(saved);
    render();
    return;
  }
  if (form.dataset.form === "review-comment") {
    const body = text(data, "body");
    if (!body || !state.reviewVideo) return;
    const player = $("#review-player");
    if (player) player.pause();
    const saved = await run(() =>
      store.insert("review_comments", { video_id: state.reviewVideo, at_seconds: Math.round((player?.currentTime || 0) * 10) / 10, body, resolved: false })
    );
    if (saved) state.db.review_comments.push(saved);
    form.reset();
    refreshReview();
    return;
  }
  const title = text(data, "title");
  if (!title) return;
  if (form.dataset.form === "quick-idea") {
    const saved = await run(() => store.insert("ideas", { title, tags: [], platforms: [] }), "Idée notée");
    if (saved) state.db.ideas.push(saved);
  } else if (form.dataset.form === "quick-task") {
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
  const selector = { "video-status": '[data-drop="status"]', "video-date": '[data-drop="date"]', "task-date": '[data-drop="date"]', block: "[data-block]" }[state.drag.type];
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

  if (drag.type === "task-date") {
    const task = find("tasks", drag.id);
    if (!task || task.due_on === zone.dataset.date) return;
    const savedTask = await run(() => store.update("tasks", task.id, { due_on: zone.dataset.date }));
    if (savedTask) Object.assign(task, savedTask);
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
    ...state.db.notes.filter((n) => match(n.title, n.body)).map((n) => ["Note", "edit-note", n.id, n.title]),
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

document.addEventListener("keydown", (event) => {
  const typing = event.target.closest("input, textarea, select");
  if ((event.key === "k" || event.key === "K") && (event.ctrlKey || event.metaKey || !typing) && !modal.open) {
    event.preventDefault();
    searchInput.focus();
  }
});
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
  const pending = twitch.takePendingToken();
  const tiktokCode = tiktok.takePendingCode();
  if (pending) await finishTwitchConnect(pending);
  else if (tiktokCode) {
    await finishTikTokConnect(tiktokCode);
    syncConnected();
  } else syncConnected();
}

document.addEventListener("visibilitychange", async () => {
  if (document.hidden || !store.isCloud || !state.user || modal.open) return;
  if (Date.now() - state.loadedAt < 60_000) return;
  try {
    await reload();
    render();
    syncConnected();
  } catch (err) {
    console.warn("Actualisation impossible", err);
  }
});

try {
  if (localStorage.getItem("theme") === "light") document.documentElement.dataset.theme = "light";
} catch {
  /* thème par défaut */
}

const tiktokReturn = tiktok.captureCallback();
const twitchReturn = twitch.enabled ? twitch.captureCallback() : null;

(async () => {
  if (tiktokReturn?.error) setTimeout(() => toast(`Connexion TikTok annulée : ${tiktokReturn.error}.`, true), 600);
  if (twitchReturn?.error) setTimeout(() => toast(`Connexion Twitch annulée : ${twitchReturn.error}.`, true), 600);
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
