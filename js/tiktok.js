// Connexion à TikTok : l'utilisateur se connecte sur TikTok, qui renvoie un code vers Régie.
// Le code est échangé par la fonction « tiktok » de Supabase, qui garde le secret de l'app.
// La connexion dure un an ; Régie la renouvelle à chaque actualisation.
import { TIKTOK_CLIENT_KEY, TWITCH_REDIRECT } from "./config.js";
import * as store from "./store.js";

const STATE_KEY = "regie-tiktok-state";
const PENDING_KEY = "regie-tiktok-code";

export const enabled = Boolean(TIKTOK_CLIENT_KEY && TWITCH_REDIRECT && store.isCloud);

export class TikTokExpired extends Error {
  constructor() {
    super("connexion TikTok expirée");
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
    client_key: TIKTOK_CLIENT_KEY,
    scope: "user.info.basic,user.info.profile,user.info.stats,video.upload",
    response_type: "code",
    redirect_uri: TWITCH_REDIRECT,
    state,
    disable_auto_auth: "1",
  });
  location.href = `https://www.tiktok.com/v2/auth/authorize/?${params}`;
}

// À appeler au démarrage, avant Twitch : récupère le code renvoyé par TikTok puis nettoie l'adresse.
export function captureCallback() {
  const expected = sessionStorage.getItem(STATE_KEY);
  if (!expected) return null;
  const query = new URLSearchParams(location.search);
  const code = query.get("code");
  const error = query.get("error");
  if (!code && !error) return null;
  sessionStorage.removeItem(STATE_KEY);
  history.replaceState(null, "", `${location.pathname}#accounts`);
  if (error) return { error: query.get("error_description") || error };
  if (query.get("state") !== expected) return { error: "réponse de TikTok non reconnue, recommence la connexion" };
  sessionStorage.setItem(PENDING_KEY, code);
  return { pending: true };
}

export function takePendingCode() {
  const code = sessionStorage.getItem(PENDING_KEY);
  sessionStorage.removeItem(PENDING_KEY);
  return code;
}

async function call(body) {
  const { data, error, expired, tokens } = await store.callFunction("tiktok", body);
  if (expired) throw new TikTokExpired();
  if (error) throw Object.assign(new Error(error), { tokens });
  return data;
}

export const exchange = (code) => call({ action: "exchange", code });
export const sync = (refreshToken) => call({ action: "sync", refresh_token: refreshToken });
// Envoie une vidéo du stockage de Régie dans la boîte TikTok du compte, en brouillon.
export const sendDraft = (refreshToken, path) => call({ action: "draft", refresh_token: refreshToken, path });
