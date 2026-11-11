// Connexion à Twitch : l'utilisateur se connecte sur Twitch, qui renvoie un jeton vers Régie.
// Le jeton ne donne qu'un accès en lecture aux informations publiques de la chaîne.
import { TWITCH_CLIENT_ID, TWITCH_REDIRECT } from "./config.js";

const API = "https://api.twitch.tv/helix";
const STATE_KEY = "regie-twitch-state";
const PENDING_KEY = "regie-twitch-token";

export const enabled = Boolean(TWITCH_CLIENT_ID && TWITCH_REDIRECT);

export class TwitchExpired extends Error {
  constructor() {
    super("connexion Twitch expirée");
  }
}

function randomState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function startLogin() {
  const state = randomState();
  sessionStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    redirect_uri: TWITCH_REDIRECT,
    response_type: "token",
    scope: "",
    state,
    force_verify: "true",
  });
  location.href = `https://id.twitch.tv/oauth2/authorize?${params}`;
}

// À appeler au démarrage : récupère le jeton renvoyé par Twitch dans l'adresse, puis nettoie l'adresse.
export function captureCallback() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);
  const token = hash.get("access_token");
  const error = query.get("error") || hash.get("error");
  const state = hash.get("state") || query.get("state");
  if (!token && !error) return null;
  const expected = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  history.replaceState(null, "", `${location.pathname}#accounts`);
  if (error) return { error: query.get("error_description") || error };
  if (!expected || state !== expected) return { error: "réponse de Twitch non reconnue, recommence la connexion" };
  sessionStorage.setItem(PENDING_KEY, token);
  return { pending: true };
}

export function takePendingToken() {
  const token = sessionStorage.getItem(PENDING_KEY);
  sessionStorage.removeItem(PENDING_KEY);
  return token;
}

async function helix(path, token) {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Client-Id": TWITCH_CLIENT_ID },
  });
  if (response.status === 401) throw new TwitchExpired();
  if (!response.ok) throw new Error(`Twitch a répondu ${response.status}`);
  return response.json();
}

// Vérifie que le jeton est encore valable (Twitch demande cette vérification régulière).
export async function validate(token) {
  const response = await fetch("https://id.twitch.tv/oauth2/validate", { headers: { Authorization: `OAuth ${token}` } });
  if (response.status === 401) throw new TwitchExpired();
  if (!response.ok) throw new Error(`Twitch a répondu ${response.status}`);
  const data = await response.json();
  return { userId: data.user_id, login: data.login, expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null };
}

export async function fetchProfile(token) {
  const { data } = await helix("/users", token);
  const user = data?.[0];
  if (!user) throw new Error("profil Twitch introuvable");
  return { id: user.id, login: user.login, name: user.display_name || user.login, avatar: user.profile_image_url || null };
}

export async function fetchStats(token, userId) {
  const id = encodeURIComponent(userId);
  const [followers, streams] = await Promise.all([
    helix(`/channels/followers?broadcaster_id=${id}&first=1`, token),
    helix(`/streams?user_id=${id}`, token),
  ]);
  const stream = streams.data?.[0] || null;
  return {
    followers: Number(followers.total) || 0,
    live: stream ? { viewers: stream.viewer_count, title: stream.title, game: stream.game_name, startedAt: stream.started_at } : null,
  };
}

export async function revoke(token) {
  await fetch("https://id.twitch.tv/oauth2/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: TWITCH_CLIENT_ID, token }),
  }).catch(() => {});
}
