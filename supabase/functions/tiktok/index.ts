// Passerelle TikTok pour Régie : TikTok exige un secret pour échanger et prolonger les connexions,
// qui ne peut pas vivre dans le navigateur. Seuls les utilisateurs connectés à Régie peuvent l'appeler.
const KEY = Deno.env.get("TIKTOK_CLIENT_KEY") ?? "";
const SECRET = Deno.env.get("TIKTOK_CLIENT_SECRET") ?? "";
const REDIRECT = Deno.env.get("TIKTOK_REDIRECT") ?? "https://prizmesportcontact-arch.github.io/DashBoard-Video-Stream/";
const ALLOWED = ["https://prizmesportcontact-arch.github.io", "http://localhost:8765"];
const FIELDS = "open_id,display_name,username,avatar_url,follower_count,video_count,likes_count";

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED.includes(origin) ? origin : ALLOWED[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

async function token(params: Record<string, string>) {
  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: KEY, client_secret: SECRET, ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error || !data.access_token) {
    const expired = ["invalid_grant", "access_token_invalid", "refresh_token_invalid"].includes(data.error);
    throw Object.assign(new Error(data.error_description || data.error || `TikTok ${res.status}`), { expired });
  }
  return data;
}

async function profile(accessToken: string) {
  const res = await fetch(`https://open.tiktokapis.com/v2/user/info/?fields=${FIELDS}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data.error && data.error.code !== "ok")) {
    throw new Error(data.error?.message || `TikTok ${res.status}`);
  }
  const u = data.data?.user ?? {};
  return {
    id: u.open_id,
    name: u.display_name || u.username,
    username: u.username ?? null,
    avatar: u.avatar_url ?? null,
    followers: typeof u.follower_count === "number" ? u.follower_count : null,
    videos: u.video_count ?? null,
    likes: u.likes_count ?? null,
  };
}

// Envoie une vidéo (rangée dans le stockage Supabase de l'utilisateur) dans la boîte de réception TikTok,
// en brouillon : l'utilisateur termine la publication dans l'appli TikTok.
async function sendDraft(req: Request, accessToken: string, path: string) {
  const file = await fetch(`${Deno.env.get("SUPABASE_URL")}/storage/v1/object/media/${path.split("/").map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: req.headers.get("authorization") ?? "", apikey: req.headers.get("apikey") ?? "" },
  });
  if (!file.ok) throw new Error("vidéo introuvable dans le stockage de Régie");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const size = bytes.byteLength;
  const init = await fetch("https://open.tiktokapis.com/v2/post/publish/inbox/video/init/", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: size, total_chunk_count: 1 } }),
  });
  const started = await init.json().catch(() => ({}));
  if (!init.ok || (started.error && started.error.code !== "ok")) {
    const code = started.error?.code ?? "";
    const message = code === "scope_not_authorized"
      ? "TikTok n'a pas encore donné le droit d'envoyer des vidéos : reconnecte ce compte TikTok dans Régie"
      : started.error?.message || `TikTok ${init.status}`;
    throw new Error(message);
  }
  const put = await fetch(started.data.upload_url, {
    method: "PUT",
    headers: { "Content-Type": file.headers.get("content-type") || "video/mp4", "Content-Range": `bytes 0-${size - 1}/${size}` },
    body: bytes,
  });
  if (!put.ok) throw new Error(`envoi de la vidéo refusé par TikTok (${put.status})`);
  return started.data.publish_id as string;
}

// Vérifie que l'appel vient d'un utilisateur connecté à Régie.
async function signedIn(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
  });
  return res.ok;
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get("origin")), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "méthode non prise en charge" }), { status: 405, headers });
  if (!(await signedIn(req))) return new Response(JSON.stringify({ error: "connecte-toi à Régie" }), { status: 401, headers });
  if (!KEY || !SECRET) return new Response(JSON.stringify({ error: "TikTok n'est pas encore configuré" }), { status: 500, headers });
  let t: Record<string, any> | undefined;
  try {
    const body = await req.json();
    if (body.action === "exchange" && typeof body.code === "string") {
      t = await token({ code: body.code, grant_type: "authorization_code", redirect_uri: REDIRECT });
    } else if (body.action === "sync" && typeof body.refresh_token === "string") {
      t = await token({ refresh_token: body.refresh_token, grant_type: "refresh_token" });
    } else if (body.action === "draft" && typeof body.refresh_token === "string" && typeof body.path === "string") {
      t = await token({ refresh_token: body.refresh_token, grant_type: "refresh_token" });
      const publishId = await sendDraft(req, t.access_token, body.path);
      return new Response(
        JSON.stringify({
          access_token: t.access_token,
          refresh_token: t.refresh_token,
          refresh_expires_at: new Date(Date.now() + (t.refresh_expires_in ?? 31536000) * 1000).toISOString(),
          publish_id: publishId,
        }),
        { headers }
      );
    } else {
      return new Response(JSON.stringify({ error: "demande non reconnue" }), { status: 400, headers });
    }
    const user = await profile(t.access_token);
    return new Response(
      JSON.stringify({
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        refresh_expires_at: new Date(Date.now() + (t.refresh_expires_in ?? 31536000) * 1000).toISOString(),
        profile: user,
      }),
      { headers }
    );
  } catch (err) {
    const e = err as Error & { expired?: boolean };
    // Si la connexion a été renouvelée avant l'erreur, on renvoie quand même les nouvelles clés.
    const tokens = t ? { access_token: t.access_token, refresh_token: t.refresh_token } : undefined;
    return new Response(JSON.stringify({ error: e.message, expired: Boolean(e.expired), tokens }), { status: e.expired ? 401 : 502, headers });
  }
});
