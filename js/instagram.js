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
