// Chiffres des comptes Instagram pro, avec la clé d'accès générée dans l'espace développeur Meta.
// La clé dure 60 jours ; Régie la prolonge toute seule à chaque ouverture (au plus une fois par jour).
const API = "https://graph.instagram.com";
const DAY = 24 * 60 * 60 * 1000;

export class InstagramExpired extends Error {
  constructor(message) {
    super(message || "clé Instagram expirée");
  }
}

async function call(path, params) {
  const response = await fetch(`${API}${path}?${new URLSearchParams(params)}`);
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

export async function fetchProfile(token) {
  const data = await call("/me", {
    fields: "user_id,username,name,followers_count,media_count,profile_picture_url",
    access_token: token,
  });
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
export function shouldRefresh(expiresAt) {
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
