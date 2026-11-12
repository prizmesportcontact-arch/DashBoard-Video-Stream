// Relais d'envoi pour Régie : les navigateurs ne peuvent pas envoyer de fichier directement aux serveurs
// d'upload d'Instagram et de TikTok. La vidéo est rangée en morceaux dans le stockage de l'utilisateur ;
// cette fonction prend un morceau et le transmet. Elle n'accepte que les deux adresses d'upload officielles.
const ALLOWED = ["https://prizmesportcontact-arch.github.io", "http://localhost:8765"];
const HOSTS = { instagram: "rupload.facebook.com", tiktok: "open-upload.tiktokapis.com" };

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED.includes(origin) ? origin : ALLOWED[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

async function signedIn(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
  });
  return res.ok;
}

// Lit un morceau dans le stockage avec la session de l'utilisateur : il ne peut lire que ses propres fichiers.
async function readPart(req: Request, path: string) {
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/storage/v1/object/media/${path.split("/").map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: req.headers.get("authorization") ?? "", apikey: req.headers.get("apikey") ?? "" },
  });
  if (!res.ok) throw new Error("morceau de vidéo introuvable dans le stockage de Régie");
  return new Uint8Array(await res.arrayBuffer());
}

function checkHost(url: string, host: string) {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.hostname !== host) throw new Error("adresse d'envoi refusée");
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get("origin")), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "méthode non prise en charge" }), { status: 405, headers });
  if (!(await signedIn(req))) return new Response(JSON.stringify({ error: "connecte-toi à Régie" }), { status: 401, headers });
  try {
    const body = await req.json();
    const start = Number(body.start);
    const size = Number(body.size);
    if (!Number.isFinite(start) || !Number.isFinite(size) || typeof body.path !== "string") throw new Error("demande incomplète");
    if (body.kind === "instagram") {
      checkHost(body.url, HOSTS.instagram);
      const bytes = await readPart(req, body.path);
      const res = await fetch(body.url, {
        method: "POST",
        headers: { Authorization: `OAuth ${body.token}`, offset: String(start), file_size: String(size) },
        body: bytes,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.debug_info?.message || data.error?.message || `Instagram a refusé le morceau (${res.status})`);
      return new Response(JSON.stringify({ ok: true }), { headers });
    }
    if (body.kind === "tiktok") {
      checkHost(body.url, HOSTS.tiktok);
      const bytes = await readPart(req, body.path);
      const end = start + bytes.byteLength - 1;
      const res = await fetch(body.url, {
        method: "PUT",
        headers: { "Content-Type": body.type || "video/mp4", "Content-Range": `bytes ${start}-${end}/${size}` },
        body: bytes,
      });
      if (!res.ok && res.status !== 206) throw new Error(`TikTok a refusé le morceau (${res.status})`);
      return new Response(JSON.stringify({ ok: true }), { headers });
    }
    throw new Error("demande non reconnue");
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 502, headers });
  }
});
