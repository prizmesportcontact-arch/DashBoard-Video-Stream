// Accès aux données : Supabase quand il est configuré, sinon stockage local (mode démo).
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

export const TABLES = ["videos", "ideas", "tasks", "goals", "metrics", "notes", "time_entries", "review_comments"];
export const isCloud = Boolean(SUPABASE_URL && SUPABASE_KEY);

let client = null;
const LOCAL_KEY = "dashboard-demo-v1";

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) {
      const db = JSON.parse(raw);
      TABLES.forEach((name) => (db[name] ||= []));
      return db;
    }
  } catch (err) {
    console.warn("Lecture locale impossible", err);
  }
  return Object.fromEntries(TABLES.map((t) => [t, []]));
}

function writeLocal(db) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(db));
  } catch (err) {
    console.warn("Écriture locale impossible", err);
  }
}

function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function fail(error) {
  if (error) throw new Error(error.message || String(error));
}

export async function init() {
  if (!isCloud) return;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.119.0");
  client = createClient(SUPABASE_URL, SUPABASE_KEY);
}

export const auth = {
  async user() {
    if (!isCloud) return { id: "demo", email: "mode démo" };
    const { data } = await client.auth.getSession();
    return data.session?.user ?? null;
  },
  async signIn(email, password) {
    const { error } = await client.auth.signInWithPassword({ email, password });
    fail(error);
  },
  async signUp(email, password) {
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: location.origin + location.pathname },
    });
    fail(error);
    return { needsConfirmation: !data.session };
  },
  async signOut() {
    if (isCloud) await client.auth.signOut();
  },
  onChange(callback) {
    if (!isCloud) return;
    client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") callback(event);
    });
  },
};

export async function loadAll() {
  if (!isCloud) return readLocal();
  const results = await Promise.all(
    TABLES.map((t) => client.from(t).select("*").order("created_at", { ascending: true }))
  );
  const db = {};
  results.forEach(({ data, error }, i) => {
    fail(error);
    db[TABLES[i]] = data;
  });
  return db;
}

export async function insert(table, row) {
  if (!isCloud) {
    const db = readLocal();
    const now = new Date().toISOString();
    const full = { id: uid(), created_at: now, updated_at: now, ...row };
    db[table].push(full);
    writeLocal(db);
    return full;
  }
  const { data, error } = await client.from(table).insert(row).select().single();
  fail(error);
  return data;
}

export async function update(table, id, patch) {
  if (!isCloud) {
    const db = readLocal();
    const item = db[table].find((r) => r.id === id);
    if (!item) throw new Error("Élément introuvable");
    Object.assign(item, patch, { updated_at: new Date().toISOString() });
    writeLocal(db);
    return item;
  }
  const { data, error } = await client.from(table).update(patch).eq("id", id).select().single();
  fail(error);
  return data;
}

export async function remove(table, id) {
  if (!isCloud) {
    const db = readLocal();
    db[table] = db[table].filter((r) => r.id !== id);
    if (table === "videos") {
      db.tasks.forEach((t) => {
        if (t.video_id === id) t.video_id = null;
      });
      db.time_entries.forEach((t) => {
        if (t.video_id === id) t.video_id = null;
      });
      db.review_comments = db.review_comments.filter((c) => c.video_id !== id);
    }
    writeLocal(db);
    return;
  }
  const { error } = await client.from(table).delete().eq("id", id);
  fail(error);
}

// Un relevé de chiffres par plateforme et par jour : le dernier remplace le précédent.
export async function saveMetric(row) {
  if (!isCloud) {
    const db = readLocal();
    const existing = db.metrics.find(
      (m) => m.platform === row.platform && m.recorded_on === row.recorded_on
    );
    if (existing) {
      Object.assign(existing, row, { updated_at: new Date().toISOString() });
      writeLocal(db);
      return existing;
    }
    writeLocal(db);
    return insert("metrics", row);
  }
  const { data, error } = await client
    .from("metrics")
    .upsert(row, { onConflict: "user_id,platform,recorded_on" })
    .select()
    .single();
  fail(error);
  return data;
}

/* ---------- Fichiers vidéo en ligne ---------- */

const BUCKET = "media";

export async function mediaUrl(path) {
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, 3600);
  fail(error);
  return data.signedUrl;
}

export async function removeMedia(path) {
  if (!isCloud) return;
  const { error } = await client.storage.from(BUCKET).remove([path]);
  fail(error);
}
