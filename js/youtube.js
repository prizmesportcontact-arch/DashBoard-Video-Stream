// Chiffres publics des chaînes YouTube, à partir du @ de la chaîne. Aucune connexion nécessaire.
// La clé est publique par nature : elle n'est acceptée que depuis l'adresse de Régie et pour l'API YouTube.
import { YOUTUBE_API_KEY } from "./config.js";

export const enabled = Boolean(YOUTUBE_API_KEY);

export class ChannelNotFound extends Error {
  constructor(handle) {
    super(`chaîne introuvable pour ${handle}`);
  }
}

export async function fetchChannel({ id, handle }) {
  const params = new URLSearchParams({ part: "snippet,statistics", key: YOUTUBE_API_KEY });
  if (id) params.set("id", id);
  else params.set("forHandle", String(handle || "").trim().replace(/^@?/, "@"));
  const response = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `YouTube a répondu ${response.status}`);
  const channel = data.items?.[0];
  if (!channel) throw new ChannelNotFound(handle || id);
  const stats = channel.statistics || {};
  return {
    id: channel.id,
    title: channel.snippet?.title || "",
    avatar: channel.snippet?.thumbnails?.default?.url || null,
    subscribers: stats.hiddenSubscriberCount ? null : Number(stats.subscriberCount) || 0,
    views: Number(stats.viewCount) || 0,
    videos: Number(stats.videoCount) || 0,
  };
}
