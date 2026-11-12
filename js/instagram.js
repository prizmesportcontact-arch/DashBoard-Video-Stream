// Chiffres des comptes Instagram pro, avec la clé d'accès générée dans l'espace développeur Meta.
// Deux sortes de clés existent :
// - « IG… » (connexion Instagram) : lues sur graph.instagram.com, prolongées par Régie (au plus une fois par jour) ;
// - « EAA… » (connexion unifiée, celle des nouvelles apps Meta) : lues sur graph.facebook.com
//   avec le numéro du compte Instagram ; elles ne se prolongent pas depuis le navigateur.
const API = "https://graph.instagram.com";
const FB_API = "https://graph.facebook.com/v23.0";
const DAY = 24 * 60 * 60 * 1000;

export class InstagramExpired extends Error {
  constructor(message) {
    super(message || "clé Instagram expirée");
  }
}

export const isUnified = (token) => String(token || "").startsWith("EAA");

export class MissingId extends Error {
  constructor() {
    super("numéro du compte Instagram manquant");
  }
}

async function call(path, params, base = API) {
  const response = await fetch(`${base}${path}?${new URLSearchParams(params)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const err = data.error || {};
    if (err.code === 190 || response.status === 401) throw new InstagramExpired(err.message);
    throw new Error(err.message || `Instagram a répondu ${response.status}`);
  }
  return data;
}

export function cleanToken(value) {
  return String(value || "").replace(/\s+/g, "");
}

export function cleanId(value) {
  return String(value || "").replace(/\D+/g, "");
}

export async function fetchProfile(token, id) {
  let data;
  if (isUnified(token)) {
    if (!id) throw new MissingId();
    data = await call(`/${encodeURIComponent(id)}`, { fields: "id,username,name,followers_count,media_count,profile_picture_url", access_token: token }, FB_API);
  } else {
    data = await call("/me", { fields: "user_id,username,name,followers_count,media_count,profile_picture_url", access_token: token });
  }
  return {
    id: String(data.user_id || data.id),
    username: data.username,
    name: data.name || data.username,
    followers: typeof data.followers_count === "number" ? data.followers_count : null,
    posts: data.media_count ?? null,
    avatar: data.profile_picture_url || null,
  };
}

// Une clé ne peut être prolongée qu'après 24 h ; on le fait dès que c'est possible.
export function shouldRefresh(token, expiresAt) {
  if (isUnified(token)) return false;
  if (!expiresAt) return true;
  return new Date(expiresAt).getTime() - Date.now() < 59 * DAY;
}

export async function refresh(token) {
  const data = await call("/refresh_access_token", { grant_type: "ig_refresh_token", access_token: token });
  return { token: data.access_token, expiresAt: new Date(Date.now() + (data.expires_in || 60 * 86400) * 1000).toISOString() };
}

export function freshExpiry() {
  return new Date(Date.now() + 60 * DAY).toISOString();
}

// Publication d'un Reel : Instagram télécharge la vidéo depuis un lien temporaire, la prépare, puis on la publie.
// Seules les clés « EAA… » (connexion unifiée) passent par graph.facebook.com ; les clés « IG… » par graph.instagram.com.
async function post(path, params, token) {
  const base = isUnified(token) ? FB_API : API;
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, access_token: token }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const err = data.error || {};
    if (err.code === 190) throw new InstagramExpired(err.message);
    if (err.code === 10 || err.code === 200) throw new Error("la clé de ce compte n'a pas le droit de publier : regénère-la chez Meta");
    throw new Error(err.error_user_msg || err.message || `Instagram a répondu ${response.status}`);
  }
  return data;
}

// Deux façons d'envoyer la vidéo à Instagram :
// - videoUrl : Instagram la télécharge depuis un lien temporaire (vidéos jusqu'à 50 Mo) ;
// - upload(uri) : envoi en plusieurs morceaux vers l'adresse fournie par Instagram (vidéos plus lourdes).
export async function publishReel({ token, id, videoUrl, upload, caption, onStep = () => {} }) {
  if (isUnified(token) && !id) throw new MissingId();
  const owner = isUnified(token) ? id : "me";
  const params = { media_type: "REELS", caption: caption || "", share_to_feed: "true" };
  if (upload) params.upload_type = "resumable";
  else params.video_url = videoUrl;
  onStep(upload ? "Envoi vers Instagram" : "Instagram récupère la vidéo");
  const container = await post(`/${owner}/media`, params, token);
  if (upload) {
    if (!container.uri) throw new Error("Instagram n'a pas fourni d'adresse d'envoi");
    await upload(container.uri);
  }
  const base = isUnified(token) ? FB_API : API;
  const started = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 4000));
    const res = await fetch(`${base}/${container.id}?${new URLSearchParams({ fields: "status_code,status", access_token: token })}`);
    const data = await res.json().catch(() => ({}));
    if (data.status_code === "FINISHED") break;
    if (data.status_code === "ERROR" || data.status_code === "EXPIRED") throw new Error(`Instagram n'a pas pu préparer la vidéo (${data.status || data.status_code})`);
    if (Date.now() - started > 10 * 60 * 1000) throw new Error("Instagram met trop de temps à préparer la vidéo, réessaie plus tard");
    onStep("Instagram prépare la vidéo");
  }
  onStep("Publication");
  const published = await post(`/${owner}/media_publish`, { creation_id: container.id }, token);
  return published.id;
}
