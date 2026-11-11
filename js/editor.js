// Monteur : découpe, recadrage, texte et export MP4, entièrement dans le navigateur.
// Les fichiers restent sur l'appareil ; seul l'export peut être envoyé en ligne.

const RATIOS = { "9:16": [1080, 1920], "16:9": [1920, 1080], "1:1": [1080, 1080], "4:5": [1080, 1350] };
const FPS = 30;
const MAX_UPLOAD = 50 * 1024 * 1024;
const TEXT_Y = { top: 0.14, center: 0.5, bottom: 0.82 };
const TEXT_SIZE = { s: 0.05, m: 0.07, l: 0.1 };
const TEXT_COLORS = { white: "#ffffff", yellow: "#ffe14d", black: "#111111" };

const project = {
  ratio: "9:16",
  fit: "cover",
  height: 1080,
  sources: new Map(),
  clips: [],
  texts: [],
  selected: null,
  selectedText: null,
  time: 0,
  playing: false,
};
let ctx = null; // fourni par l'application : store, toast, esc, videos(), onUploaded()
let root = null;
let raf = 0;
let activeEl = null;
let exporting = null;
let result = null;
let vault = null;

const uid = () => Math.random().toString(36).slice(2, 10);
const pad = (n) => String(n).padStart(2, "0");
const clock = (t) => `${Math.floor(Math.max(0, t) / 60)}:${pad(Math.floor(Math.max(0, t) % 60))}.${Math.floor((Math.max(0, t) % 1) * 10)}`;
const clipLen = (c) => c.end - c.start;
const total = () => project.clips.reduce((sum, c) => sum + clipLen(c), 0);
const size = () => {
  const [w, h] = RATIOS[project.ratio];
  const k = project.height / 1080;
  return [Math.round((w * k) / 2) * 2, Math.round((h * k) / 2) * 2];
};
const megabytes = (bytes) => `${(bytes / 1048576).toFixed(1).replace(".", ",")} Mo`;

function locate(t) {
  let offset = 0;
  for (let i = 0; i < project.clips.length; i++) {
    const clip = project.clips[i];
    const len = clipLen(clip);
    if (t < offset + len || i === project.clips.length - 1) {
      return { index: i, clip, offset, local: clip.start + Math.min(Math.max(0, t - offset), len) };
    }
    offset += len;
  }
  return null;
}

/* ---------- Dessin d'une image (aperçu et export partagent ce code) ---------- */

function wrapLines(g, text, maxWidth) {
  const lines = [];
  for (const raw of String(text).split("\n")) {
    let line = "";
    for (const word of raw.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && g.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

function drawTexts(g, w, h, t) {
  for (const item of project.texts) {
    if (t < item.from || t >= item.to || !item.text.trim()) continue;
    const px = Math.round(w * TEXT_SIZE[item.size]);
    g.font = `700 ${px}px Geist, system-ui, -apple-system, "Segoe UI", sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const lines = wrapLines(g, item.text, w * 0.86);
    const lineHeight = px * 1.2;
    const top = h * TEXT_Y[item.pos] - ((lines.length - 1) * lineHeight) / 2;
    if (item.box) {
      const width = Math.max(...lines.map((l) => g.measureText(l).width)) + px * 0.7;
      g.fillStyle = item.color === "black" ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.72)";
      g.beginPath();
      g.roundRect(w / 2 - width / 2, top - lineHeight / 2 - px * 0.15, width, lines.length * lineHeight + px * 0.3, px * 0.25);
      g.fill();
    }
    lines.forEach((line, i) => {
      const y = top + i * lineHeight;
      if (!item.box) {
        g.lineJoin = "round";
        g.lineWidth = px * 0.16;
        g.strokeStyle = item.color === "black" ? "#ffffff" : "#000000";
        g.strokeText(line, w / 2, y);
      }
      g.fillStyle = TEXT_COLORS[item.color];
      g.fillText(line, w / 2, y);
    });
  }
}

function drawFrame(g, w, h, image, sw, sh, clip, t) {
  g.fillStyle = "#000";
  g.fillRect(0, 0, w, h);
  if (image && sw && sh) {
    const scale = project.fit === "cover" ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const pan = clip?.pan ?? 0.5;
    const x = dw > w ? (w - dw) * pan : (w - dw) / 2;
    const y = dh > h ? (h - dh) * pan : (h - dh) / 2;
    g.drawImage(image, x, y, dw, dh);
  }
  drawTexts(g, w, h, t);
}

/* ---------- Aperçu ---------- */

function paint() {
  const canvas = root?.querySelector("#ed-canvas");
  if (!canvas) return;
  const g = canvas.getContext("2d");
  const at = locate(project.time);
  const src = at ? project.sources.get(at.clip.source) : null;
  drawFrame(g, canvas.width, canvas.height, src?.el, src?.el.videoWidth, src?.el.videoHeight, at?.clip, project.time);
  const now = root.querySelector("#ed-now");
  if (now) now.textContent = `${clock(project.time)} / ${clock(total())}`;
  const head = root.querySelector("#ed-head");
  if (head) head.style.left = `${total() ? (project.time / total()) * 100 : 0}%`;
}

function pause() {
  project.playing = false;
  cancelAnimationFrame(raf);
  project.sources.forEach((s) => s.el.pause());
  const button = root?.querySelector('[data-ed="play"]');
  if (button) button.textContent = "Lire";
}

function seek(t) {
  const wasPlaying = project.playing;
  pause();
  project.time = Math.min(Math.max(0, t), total());
  const at = locate(project.time);
  if (!at) return paint();
  const el = project.sources.get(at.clip.source).el;
  activeEl = el;
  const done = () => {
    el.removeEventListener("seeked", done);
    paint();
    if (wasPlaying) play();
  };
  el.addEventListener("seeked", done);
  el.currentTime = at.local;
  paint();
}

function play() {
  if (!project.clips.length) return;
  if (project.time >= total() - 0.05) project.time = 0;
  let at = locate(project.time);
  let el = project.sources.get(at.clip.source).el;
  if (Math.abs(el.currentTime - at.local) > 0.08) el.currentTime = at.local;
  activeEl = el;
  project.playing = true;
  const button = root?.querySelector('[data-ed="play"]');
  if (button) button.textContent = "Pause";
  el.play().catch(() => {});

  const tick = () => {
    if (!project.playing) return;
    const clip = at.clip;
    if (el.currentTime >= clip.end - 0.015 || el.ended) {
      const next = project.clips[at.index + 1];
      if (!next) {
        project.time = total();
        pause();
        paint();
        return;
      }
      const offset = at.offset + clipLen(clip);
      const nextEl = project.sources.get(next.source).el;
      const continuous = nextEl === el && Math.abs(next.start - el.currentTime) < 0.06;
      if (!continuous) {
        el.pause();
        nextEl.currentTime = next.start;
        nextEl.play().catch(() => {});
      }
      el = nextEl;
      activeEl = el;
      at = { index: at.index + 1, clip: next, offset, local: next.start };
      project.time = offset;
    } else {
      project.time = at.offset + Math.max(0, el.currentTime - clip.start);
    }
    paint();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

/* ---------- Import ---------- */

function addSource(file) {
  return new Promise((resolve, reject) => {
    const el = document.createElement("video");
    el.preload = "auto";
    el.playsInline = true;
    el.src = URL.createObjectURL(file);
    el.addEventListener("loadedmetadata", () => {
      if (!Number.isFinite(el.duration) || !el.videoWidth) return reject(new Error("vidéo illisible"));
      const source = { id: uid(), file, name: file.name, el, duration: el.duration };
      project.sources.set(source.id, source);
      vault.appendChild(el);
      resolve(source);
    }, { once: true });
    el.addEventListener("error", () => reject(new Error("format non lisible par ce navigateur")), { once: true });
  });
}

async function importFiles(files) {
  for (const file of files) {
    try {
      const source = await addSource(file);
      project.clips.push({ id: uid(), source: source.id, start: 0, end: source.duration, pan: 0.5 });
    } catch (err) {
      ctx.toast(`« ${file.name} » : ${err.message}.`, true);
    }
  }
  if (project.selected === null && project.clips.length) project.selected = project.clips[0].id;
  refresh();
  seek(project.time);
}

/* ---------- Opérations de montage ---------- */

const selectedClip = () => project.clips.find((c) => c.id === project.selected) || null;
const selectedText = () => project.texts.find((t) => t.id === project.selectedText) || null;

function clipOffset(clip) {
  let offset = 0;
  for (const c of project.clips) {
    if (c === clip) return offset;
    offset += clipLen(c);
  }
  return 0;
}

const ops = {
  split() {
    const at = locate(project.time);
    if (!at) return;
    const { clip, local, index } = at;
    if (local - clip.start < 0.1 || clip.end - local < 0.1) return ctx.toast("Place la tête de lecture à l'intérieur d'un morceau.");
    const second = { ...clip, id: uid(), start: local };
    clip.end = local;
    project.clips.splice(index + 1, 0, second);
    project.selected = second.id;
  },
  trimStart() {
    const clip = selectedClip();
    const at = locate(project.time);
    if (!clip || at?.clip !== clip || clip.end - at.local < 0.1) return ctx.toast("Place la tête de lecture dans le morceau sélectionné.");
    const offset = clipOffset(clip);
    clip.start = at.local;
    project.time = offset;
  },
  trimEnd() {
    const clip = selectedClip();
    const at = locate(project.time);
    if (!clip || at?.clip !== clip || at.local - clip.start < 0.1) return ctx.toast("Place la tête de lecture dans le morceau sélectionné.");
    clip.end = at.local;
  },
  remove() {
    const clip = selectedClip();
    if (!clip) return;
    const index = project.clips.indexOf(clip);
    project.clips.splice(index, 1);
    project.selected = project.clips[Math.min(index, project.clips.length - 1)]?.id ?? null;
    const used = new Set(project.clips.map((c) => c.source));
    for (const [id, source] of project.sources) {
      if (!used.has(id)) {
        URL.revokeObjectURL(source.el.src);
        source.el.remove();
        project.sources.delete(id);
      }
    }
  },
  left() {
    const index = project.clips.indexOf(selectedClip());
    if (index > 0) project.clips.splice(index - 1, 0, project.clips.splice(index, 1)[0]);
  },
  right() {
    const index = project.clips.indexOf(selectedClip());
    if (index >= 0 && index < project.clips.length - 1) project.clips.splice(index + 1, 0, project.clips.splice(index, 1)[0]);
  },
  addText() {
    if (!project.clips.length) return ctx.toast("Importe d'abord une vidéo.");
    const from = Math.min(project.time, Math.max(0, total() - 0.5));
    const item = { id: uid(), text: "Ton texte", from, to: Math.min(total(), from + 3), pos: "bottom", size: "m", color: "white", box: false };
    project.texts.push(item);
    project.selectedText = item.id;
  },
  removeText() {
    project.texts = project.texts.filter((t) => t.id !== project.selectedText);
    project.selectedText = null;
  },
  textFrom() {
    const item = selectedText();
    if (item && project.time < item.to - 0.2) item.from = project.time;
  },
  textTo() {
    const item = selectedText();
    if (item && project.time > item.from + 0.2) item.to = project.time;
  },
};

/* ---------- Export ---------- */

async function runExport() {
  if (!project.clips.length || exporting) return;
  pause();
  if (typeof VideoEncoder === "undefined") {
    return ctx.toast("Ce navigateur ne sait pas exporter une vidéo. Utilise Chrome ou Edge à jour sur ordinateur.", true);
  }
  const job = { cancelled: false, output: null, progress: 0, label: "Préparation" };
  exporting = job;
  result = null;
  refresh();
  const inputs = [];
  try {
    const mb = await import("./vendor/mediabunny.min.mjs");
    const [width, height] = size();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext("2d", { alpha: false });

    const format = new mb.Mp4OutputFormat({ fastStart: "in-memory" });
    const output = new mb.Output({ format, target: new mb.BufferTarget() });
    job.output = output;

    const videoCodec = await mb.getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), { width, height });
    if (!videoCodec) throw new Error("aucun encodeur vidéo disponible dans ce navigateur");
    const videoSource = new mb.CanvasSource(canvas, { codec: videoCodec, bitrate: mb.QUALITY_HIGH, keyFrameInterval: 2 });
    output.addVideoTrack(videoSource, { frameRate: FPS });

    const duration = total();
    const sampleRate = 48000;
    const audioCodec = await mb.getFirstEncodableAudioCodec(format.getSupportedAudioCodecs(), { numberOfChannels: 2, sampleRate });
    const audioSource = audioCodec ? new mb.AudioBufferSource({ codec: audioCodec, bitrate: mb.QUALITY_HIGH }) : null;
    if (audioSource) output.addAudioTrack(audioSource);

    await output.start();

    const opened = new Map();
    const open = (sourceId) => {
      if (!opened.has(sourceId)) {
        const input = new mb.Input({ source: new mb.BlobSource(project.sources.get(sourceId).file), formats: mb.ALL_FORMATS });
        inputs.push(input);
        opened.set(sourceId, input);
      }
      return opened.get(sourceId);
    };

    // Son : chaque morceau est placé à sa position sur une piste unique, puis encodé d'un bloc.
    if (audioSource) {
      job.label = "Préparation du son";
      refreshProgress();
      const offline = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * sampleRate)), sampleRate);
      let offset = 0;
      for (const clip of project.clips) {
        if (job.cancelled) throw new Error("annulé");
        const track = await open(clip.source).getPrimaryAudioTrack();
        if (track && (await track.canDecode())) {
          const sink = new mb.AudioBufferSink(track);
          for await (const { buffer, timestamp } of sink.buffers(clip.start, clip.end)) {
            const from = Math.max(0, clip.start - timestamp);
            const to = Math.min(buffer.duration, clip.end - timestamp);
            if (to - from <= 0) continue;
            const node = offline.createBufferSource();
            node.buffer = buffer;
            node.connect(offline.destination);
            node.start(Math.max(0, offset + timestamp + from - clip.start), from, to - from);
          }
        }
        offset += clipLen(clip);
      }
      await audioSource.add(await offline.startRendering());
    }

    job.label = "Export des images";
    const totalFrames = Math.max(1, Math.round(duration * FPS));
    let frame = 0;
    let offset = 0;
    for (const clip of project.clips) {
      const track = await open(clip.source).getPrimaryVideoTrack();
      if (!track || !(await track.canDecode())) throw new Error(`« ${project.sources.get(clip.source).name} » ne peut pas être décodée par ce navigateur`);
      const sink = new mb.CanvasSink(track, { poolSize: 2 });
      const last = Math.min(totalFrames, Math.round((offset + clipLen(clip)) * FPS));
      const first = frame;
      const stamps = (function* () {
        for (let i = first; i < last; i++) yield Math.min(clip.end - 0.001, clip.start + (i / FPS - offset));
      })();
      for await (const wrapped of sink.canvasesAtTimestamps(stamps)) {
        if (job.cancelled) throw new Error("annulé");
        const t = frame / FPS;
        drawFrame(g, width, height, wrapped?.canvas, wrapped?.canvas.width, wrapped?.canvas.height, clip, t);
        await videoSource.add(t, 1 / FPS);
        frame += 1;
        if (frame % 5 === 0) {
          job.progress = frame / totalFrames;
          refreshProgress();
        }
      }
      offset += clipLen(clip);
    }

    job.label = "Finalisation";
    job.progress = 1;
    refreshProgress();
    await output.finalize();
    const blob = new Blob([output.target.buffer], { type: "video/mp4" });
    result = { blob, url: URL.createObjectURL(blob), name: `montage-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.mp4`, width, height, duration, noAudio: !audioSource, audioCodec };
  } catch (err) {
    if (job.output && job.output.state !== "finalized") await job.output.cancel().catch(() => {});
    if (!job.cancelled) {
      console.error(err);
      ctx.toast(`Export impossible : ${err.message}.`, true);
    }
  } finally {
    inputs.forEach((input) => input.dispose());
    exporting = null;
    refresh();
  }
}

function refreshProgress() {
  const bar = root?.querySelector("#ed-progress");
  const label = root?.querySelector("#ed-progress-label");
  if (bar && exporting) bar.style.width = `${(exporting.progress * 100).toFixed(1)}%`;
  if (label && exporting) label.textContent = `${exporting.label}, ${Math.round(exporting.progress * 100)} %`;
}

async function upload() {
  const select = root.querySelector("#ed-upload-video");
  const video = ctx.videos().find((v) => v.id === select?.value);
  if (!result || !video) return;
  const button = root.querySelector('[data-ed="upload"]');
  button.disabled = true;
  button.textContent = "Envoi en cours";
  try {
    await ctx.onUpload(video, result.blob);
    result.sent = video.title;
    ctx.toast("Montage envoyé sur Régie");
  } catch (err) {
    console.error(err);
    ctx.toast(`Envoi impossible : ${err.message}.`, true);
  }
  refresh();
}

/* ---------- Interface ---------- */

function sidePanel() {
  const esc = ctx.esc;
  const clip = selectedClip();
  const item = selectedText();
  const clipBox = clip
    ? `<section class="ed-box"><h3>Morceau sélectionné</h3>
        <p class="muted small">${esc(project.sources.get(clip.source)?.name || "")}, ${clock(clipLen(clip))}</p>
        <label class="field"><span>Cadrage (gauche, droite ou haut, bas)</span>
          <input type="range" min="0" max="1" step="0.01" value="${clip.pan}" data-ed-input="pan"></label>
        <div class="ed-row">
          <button type="button" class="btn small" data-ed="trimStart">Début ici</button>
          <button type="button" class="btn small" data-ed="trimEnd">Fin ici</button>
          <button type="button" class="btn small" data-ed="left" aria-label="Déplacer avant">◀</button>
          <button type="button" class="btn small" data-ed="right" aria-label="Déplacer après">▶</button>
          <button type="button" class="btn small danger" data-ed="remove">Supprimer</button>
        </div></section>`
    : "";
  const option = (value, label, current) => `<option value="${value}" ${current === value ? "selected" : ""}>${label}</option>`;
  const textBox = `<section class="ed-box"><div class="panel-head"><h3>Textes</h3>
      <button type="button" class="btn small" data-ed="addText">Ajouter un texte</button></div>
      ${project.texts.length ? "" : '<p class="muted small">Le texte apparaît à partir de la tête de lecture, pendant 3 secondes.</p>'}
      ${item ? `<label class="field"><span>Texte</span><textarea data-ed-input="text" maxlength="200">${esc(item.text)}</textarea></label>
        <div class="grid-2">
          <label class="field"><span>Position</span><select data-ed-input="pos">${option("top", "Haut", item.pos)}${option("center", "Centre", item.pos)}${option("bottom", "Bas", item.pos)}</select></label>
          <label class="field"><span>Taille</span><select data-ed-input="size">${option("s", "Petit", item.size)}${option("m", "Moyen", item.size)}${option("l", "Grand", item.size)}</select></label>
          <label class="field"><span>Couleur</span><select data-ed-input="color">${option("white", "Blanc", item.color)}${option("yellow", "Jaune", item.color)}${option("black", "Noir", item.color)}</select></label>
          <label class="source" style="align-self:end;min-height:36px"><input type="checkbox" class="check small-check" data-ed-input="box" ${item.box ? "checked" : ""}><span>Fond derrière le texte</span></label>
        </div>
        <p class="muted small">Affiché de ${clock(item.from)} à ${clock(item.to)}</p>
        <div class="ed-row">
          <button type="button" class="btn small" data-ed="textFrom">Début ici</button>
          <button type="button" class="btn small" data-ed="textTo">Fin ici</button>
          <button type="button" class="btn small danger" data-ed="removeText">Supprimer</button>
        </div>` : ""}
    </section>`;

  let exportBox = "";
  if (exporting) {
    exportBox = `<section class="ed-box"><h3>Export en cours</h3>
      <div class="bar"><i id="ed-progress" style="width:${(exporting.progress * 100).toFixed(1)}%"></i></div>
      <p class="muted small" id="ed-progress-label">${esc(exporting.label)}</p>
      <p class="muted small">Garde cet onglet au premier plan jusqu'à la fin.</p>
      <button type="button" class="btn small" data-ed="cancel">Annuler</button></section>`;
  } else if (result) {
    const videos = ctx.videos().filter((v) => v.kind !== "stream");
    const canSend = ctx.store.isCloud && result.blob.size <= MAX_UPLOAD && videos.length;
    exportBox = `<section class="ed-box"><h3>Export terminé</h3>
      <video class="ed-result" src="${result.url}" controls playsinline></video>
      <p class="muted small">${result.width} × ${result.height}, ${clock(result.duration)}, ${megabytes(result.blob.size)}${result.noAudio ? ", sans son (ce navigateur ne sait pas encoder l'audio)" : ""}</p>
      ${!result.noAudio && result.audioCodec !== "aac" ? `<p class="small" style="color:var(--sponsor)">Le son est encodé en ${esc(String(result.audioCodec).toUpperCase())} et non en AAC, faute d'encodeur AAC dans ce navigateur. Certaines plateformes et certains téléphones peuvent le refuser : vérifie le son avant de publier.</p>` : ""}
      <a class="btn primary" href="${result.url}" download="${esc(result.name)}">Télécharger le MP4</a>
      ${result.sent ? `<p class="small">Envoyé sur la fiche « ${esc(result.sent)} ». Tu peux le relire dans Montage, Retours.</p>`
        : canSend ? `<label class="field"><span>Envoyer sur Régie, rattaché à la fiche</span><select id="ed-upload-video">${videos.map((v) => `<option value="${esc(v.id)}">${esc(v.title)}</option>`).join("")}</select></label>
          <button type="button" class="btn" data-ed="upload">Envoyer sur Régie</button>`
        : `<p class="muted small">${!ctx.store.isCloud ? "L'envoi en ligne n'existe pas en mode démo." : result.blob.size > MAX_UPLOAD ? "Trop lourd pour l'envoi en ligne (50 Mo maximum) : garde le fichier téléchargé." : "Crée une fiche vidéo pour pouvoir y rattacher ce montage."}</p>`}
    </section>`;
  }
  return exportBox + clipBox + textBox;
}

function timeline() {
  const esc = ctx.esc;
  const sum = total();
  if (!sum) return "";
  const clips = project.clips
    .map((clip) => `<div role="button" tabindex="0" draggable="true" class="ed-clip ${clip.id === project.selected ? "is-selected" : ""}"
      data-clip="${clip.id}" style="width:${((clipLen(clip) / sum) * 100).toFixed(3)}%" title="${esc(project.sources.get(clip.source)?.name || "")}">
      <span>${esc(project.sources.get(clip.source)?.name || "")}</span><small>${clock(clipLen(clip))}</small></div>`)
    .join("");
  const texts = project.texts
    .map((t) => `<div role="button" tabindex="0" class="ed-text ${t.id === project.selectedText ? "is-selected" : ""}" data-text="${t.id}"
      style="left:${((t.from / sum) * 100).toFixed(3)}%;width:${(((Math.min(t.to, sum) - t.from) / sum) * 100).toFixed(3)}%">${esc(t.text)}</div>`)
    .join("");
  return `<div class="ed-track" id="ed-track">${clips}<i class="ed-head" id="ed-head"></i></div>
    <div class="ed-texts" id="ed-texts">${texts}</div>`;
}

function refresh() {
  if (!root) return;
  const empty = !project.clips.length;
  root.querySelector("#ed-empty").hidden = !empty;
  root.querySelector("#ed-work").hidden = empty;
  root.querySelector("#ed-side").innerHTML = sidePanel();
  root.querySelector("#ed-timeline").innerHTML = timeline();
  const canvas = root.querySelector("#ed-canvas");
  const [w, h] = RATIOS[project.ratio];
  if (canvas.width !== w / 2 || canvas.height !== h / 2) {
    canvas.width = w / 2;
    canvas.height = h / 2;
  }
  canvas.style.aspectRatio = `${w} / ${h}`;
  root.querySelector('[data-ed="export"]').disabled = empty || Boolean(exporting);
  paint();
}

export function html() {
  const option = (value, label, current) => `<option value="${value}" ${String(current) === String(value) ? "selected" : ""}>${label}</option>`;
  return `<div class="editor" id="editor">
    <div class="toolbar">
      <label class="btn small primary">Importer des vidéos<input type="file" accept="video/*" multiple data-ed-input="files" hidden></label>
      <select data-ed-input="ratio" aria-label="Format" style="width:auto">
        ${option("9:16", "Vertical 9:16 (TikTok, Reels, Shorts)", project.ratio)}${option("16:9", "Horizontal 16:9 (YouTube)", project.ratio)}
        ${option("1:1", "Carré 1:1", project.ratio)}${option("4:5", "Portrait 4:5 (Instagram)", project.ratio)}</select>
      <select data-ed-input="fit" aria-label="Cadrage" style="width:auto">
        ${option("cover", "Remplir (recadrer)", project.fit)}${option("contain", "Adapter (bandes noires)", project.fit)}</select>
      <select data-ed-input="height" aria-label="Qualité" style="width:auto">
        ${option(1080, "1080p", project.height)}${option(720, "720p, plus rapide", project.height)}</select>
      <span class="spacer"></span>
      <button type="button" class="btn small primary" data-ed="export">Exporter en MP4</button>
    </div>
    <div class="panel glass" id="ed-empty">
      <div class="empty"><p>Importe une ou plusieurs vidéos depuis ton appareil pour commencer le montage.</p>
      <p class="muted small">Les fichiers restent sur ton appareil. Le projet n'est pas sauvegardé : exporte avant de fermer la page.</p></div>
    </div>
    <div id="ed-work" hidden>
      <div class="ed-main">
        <div class="ed-stage">
          <canvas id="ed-canvas" width="540" height="960"></canvas>
          <div class="ed-transport">
            <button type="button" class="btn small primary" data-ed="play">Lire</button>
            <span class="timecode" id="ed-now">0:00.0 / 0:00.0</span>
            <button type="button" class="btn small" data-ed="split">Couper ici</button>
          </div>
        </div>
        <aside class="ed-side" id="ed-side"></aside>
      </div>
      <div class="ed-timeline" id="ed-timeline"></div>
    </div>
  </div>`;
}

export function mount(view, context) {
  ctx = context;
  root = view.querySelector("#editor");
  if (!root) return;
  if (!vault) {
    vault = document.createElement("div");
    vault.hidden = true;
    document.body.appendChild(vault);
    window.addEventListener("beforeunload", (event) => {
      if (project.clips.length) event.preventDefault();
    });
  }

  root.addEventListener("click", (event) => {
    const clip = event.target.closest("[data-clip]");
    const text = event.target.closest("[data-text]");
    const action = event.target.closest("[data-ed]")?.dataset.ed;
    if (action === "play") return project.playing ? pause() : play();
    if (action === "export") return runExport();
    if (action === "upload") return upload();
    if (action === "cancel") {
      if (exporting) exporting.cancelled = true;
      return;
    }
    if (action && ops[action]) {
      pause();
      ops[action]();
      refresh();
      seek(Math.min(project.time, total()));
      return;
    }
    if (text) {
      project.selectedText = text.dataset.text;
      refresh();
      return;
    }
    const track = event.target.closest("#ed-track, #ed-texts");
    if (track) {
      if (clip) project.selected = clip.dataset.clip;
      const box = root.querySelector("#ed-track").getBoundingClientRect();
      const t = ((event.clientX - box.left) / box.width) * total();
      refresh();
      seek(t);
    }
  });

  root.addEventListener("input", (event) => {
    const key = event.target.dataset.edInput;
    if (!key) return;
    const clip = selectedClip();
    const item = selectedText();
    if (key === "pan" && clip) clip.pan = Number(event.target.value);
    else if (key === "text" && item) item.text = event.target.value;
    else return;
    paint();
    if (key === "text") {
      const block = root.querySelector(`[data-text="${item.id}"]`);
      if (block) block.textContent = item.text;
    }
  });

  root.addEventListener("change", (event) => {
    const key = event.target.dataset.edInput;
    if (!key) return;
    const item = selectedText();
    if (key === "files") {
      importFiles([...event.target.files]);
      event.target.value = "";
      return;
    }
    if (key === "ratio" || key === "fit") project[key] = event.target.value;
    else if (key === "height") project.height = Number(event.target.value);
    else if (item && ["pos", "size", "color"].includes(key)) item[key] = event.target.value;
    else if (item && key === "box") item.box = event.target.checked;
    else return;
    refresh();
  });

  // Réordonner les morceaux en les glissant.
  let dragged = null;
  root.addEventListener("dragstart", (event) => {
    const clip = event.target.closest("[data-clip]");
    if (!clip) return;
    dragged = clip.dataset.clip;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", dragged);
    event.stopPropagation();
  });
  root.addEventListener("dragover", (event) => {
    if (dragged && event.target.closest("[data-clip]")) event.preventDefault();
    event.stopPropagation();
  });
  root.addEventListener("drop", (event) => {
    event.stopPropagation();
    const target = event.target.closest("[data-clip]");
    if (!dragged || !target || target.dataset.clip === dragged) return;
    event.preventDefault();
    const from = project.clips.findIndex((c) => c.id === dragged);
    const moved = project.clips.splice(from, 1)[0];
    const to = project.clips.findIndex((c) => c.id === target.dataset.clip);
    const box = target.getBoundingClientRect();
    project.clips.splice(event.clientX > box.left + box.width / 2 ? to + 1 : to, 0, moved);
    dragged = null;
    refresh();
    seek(Math.min(project.time, total()));
  });
  root.addEventListener("dragend", () => (dragged = null));

  refresh();
  if (project.clips.length) seek(project.time);
}

export function leave() {
  if (root) pause();
  root = null;
}

// Pour les tests automatiques.
export const debug = { project, total, getResult: () => result, isExporting: () => Boolean(exporting) };
