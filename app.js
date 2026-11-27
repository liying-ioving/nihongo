// Японский в дорогу — приложение для слов. Всё хранится на телефоне (localStorage), у каждого профиля своя память.
"use strict";

// ---------- данные ----------
const ALL = [], BY = {};
TOPICS.forEach(t => {
  t.items = [];
  t.words.forEach(w => {
    const o = { key: w[0], jp: w[0], kana: w[1] || w[0], ro: w[2], ru: w[3], em: w[4], as: w[5] || "", topic: t.id };
    if (BY[o.key]) { console.warn("повтор слова", o.key); return; }
    ALL.push(o); BY[o.key] = o; t.items.push(o);
  });
});
const TOPIC = Object.fromEntries(TOPICS.map(t => [t.id, t]));
const IMG = typeof IMAGES !== "undefined" ? IMAGES : {};   // key -> путь к картинке (появятся позже)
const AUD = typeof AUDIO !== "undefined" ? AUDIO : {};     // key -> путь к живой записи (появятся позже)

// ---------- хранение ----------
const LS = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  del(k) { localStorage.removeItem(k); }
};
const DEFAULTS = { romaji: true, newPerDay: 20, revPerDay: 200, lessonSize: 6, mic: true, rate: 0.85, retention: 0.9, maxInterval: 21 };
let profiles = LS.get("jp:profiles", []);
let pid = LS.get("jp:current", null);
let P = null;
function loadProfile() {
  P = LS.get("jp:p:" + pid, null) || { cards: {}, settings: {}, daily: {}, created: Date.now() };
  P.settings = { ...DEFAULTS, ...P.settings };
}
function save() { if (pid) LS.set("jp:p:" + pid, P); }
function dayKey() { const d = new Date(Date.now() - 4 * 3600e3); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
function daily() { const k = dayKey(); if (P.daily.date !== k) P.daily = { date: k, new: 0, rev: 0 }; return P.daily; }
const S = () => P.settings;
const me = () => profiles.find(p => p.id === pid);
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ---------- звук ----------
let jaVoice = null;
function pickVoice() {
  if (!("speechSynthesis" in window)) return;
  const vs = speechSynthesis.getVoices().filter(v => /^ja/i.test(v.lang));
  const score = v => (/premium|enhanced|улучш|高品質|拡張/i.test(v.name) ? 10 : 0) + (/kyoko|o-ren|otoya|hattori/i.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0);
  vs.sort((a, b) => score(b) - score(a));
  jaVoice = vs[0] || null;
}
if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
let audioEl = null;
function say(w) {
  if (!w) return;
  if (AUD[w.key]) {
    if (audioEl) audioEl.pause();
    audioEl = new Audio(AUD[w.key]); audioEl.playbackRate = P ? Math.max(0.7, S().rate + 0.15) : 1; audioEl.play().catch(() => {});
    return;
  }
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(w.kana);
  u.lang = "ja-JP"; if (jaVoice) u.voice = jaVoice; u.rate = P ? S().rate : 0.85;
  speechSynthesis.speak(u);
}

// ---------- запись своего голоса ----------
const MIC = { rec: null, chunks: [], url: null, on: false };
async function micStart() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    MIC.chunks = []; MIC.rec = new MediaRecorder(stream);
    MIC.rec.ondataavailable = e => MIC.chunks.push(e.data);
    MIC.rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      if (MIC.url) URL.revokeObjectURL(MIC.url);
      MIC.url = URL.createObjectURL(new Blob(MIC.chunks, { type: MIC.rec.mimeType || "audio/mp4" }));
      MIC.on = false; paintMic(); micPlay();
    };
    MIC.rec.start(); MIC.on = true; paintMic();
  } catch (e) { toast("Нет доступа к микрофону"); }
}
function micStop() { if (MIC.rec && MIC.on) MIC.rec.stop(); }
function micPlay() { if (MIC.url) { const a = new Audio(MIC.url); a.play().catch(() => {}); } }
function micReset() { if (MIC.on) micStop(); if (MIC.url) URL.revokeObjectURL(MIC.url); MIC.url = null; }
function micHTML() {
  if (!S().mic || !window.MediaRecorder) return "";
  return `<div class="mic" id="mic">${micInner()}</div>`;
}
function micInner() {
  if (MIC.on) return `<button class="rec" data-act="micStop">⏹ Стоп</button>`;
  return `<button data-act="micStart">🎙 Повторить вслух</button>` + (MIC.url ? `<button data-act="micPlay">▶︎ Я</button>` : "");
}
function paintMic() { const m = document.getElementById("mic"); if (m) m.innerHTML = micInner(); }

// ---------- помощники ----------
const $app = document.getElementById("app");
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const card = w => P.cards[w.key];
const stage = w => SRS.stage(card(w));
const now = () => Date.now();
const ro = w => S().romaji ? `<div class="romaji">${w.ro}</div>` : "";
const pic = w => IMG[w.key] ? `<img src="${IMG[w.key]}" alt="">` : w.em;
const thumb = w => IMG[w.key] ? `<img class="th" src="${IMG[w.key]}" alt="" loading="lazy">` : w.em;
function toast(t) { const d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2200); }
function topicCounts(t) { const c = [0, 0, 0, 0]; t.items.forEach(w => c[stage(w)]++); return c; }
// К повторению: всё, что пора, плюс слова на заучивании, до которых меньше 20 минут (их можно повторить сразу после урока)
function dueList() { const n = now(); return ALL.filter(w => { const c = card(w); return c && (c.due <= n || (c.state === "learning" && c.due <= n + 20 * 60000)); }).sort((a, b) => card(a).due - card(b).due); }
function nextLearnSoon() { const n = now(); let m = Infinity; ALL.forEach(w => { const c = card(w); if (c && c.due > n) m = Math.min(m, c.due); }); return m; }
function nextTopic() { return TOPICS.find(t => t.items.some(w => !card(w))); }
function opt() { return { retention: S().retention, maxInterval: S().maxInterval }; }
function pickOthers(w, pool, n, keyFn) {
  const used = new Set([keyFn(w)]), out = [];
  for (const c of shuffle(pool).concat(shuffle(ALL))) {
    if (out.length >= n) break;
    const k = keyFn(c); if (c.key === w.key || used.has(k)) continue;
    used.add(k); out.push(c);
  }
  return out;
}

// ---------- состояние экранов ----------
let view = "home", V = {};
function go(v, data) { view = v; V = data || {}; micReset(); render(); window.scrollTo(0, 0); }

function render() {
  if (!pid || !profiles.find(p => p.id === pid)) { view = "profiles"; }
  const f = VIEWS[view] || VIEWS.home;
  $app.innerHTML = f() + (["home", "dict", "settings"].includes(view) ? navHTML() : "");
  if (view === "dict") paintDict();
}
function navHTML() {
  const b = (v, i, t) => `<button class="${view === v ? "on" : ""}" data-act="go" data-arg="${v}"><span class="i">${i}</span>${t}</button>`;
  return `<nav class="nav"><div class="in">${b("home", "🏠", "Главная")}${b("dict", "📖", "Шпаргалка")}${b("settings", "⚙️", "Настройки")}</div></nav>`;
}

const VIEWS = {};

// ----- профили -----
const AVATARS = ["🦊", "🐼", "🦉", "🐱", "🐰", "🦌", "🐢", "🐧"];
VIEWS.profiles = () => `
  ${P && me() ? `<div class="top"><button class="iconbtn" data-act="go" data-arg="home">‹</button></div>` : ""}
  <h1 class="center" style="margin-top:${P && me() ? 0 : 40}px">日本語</h1>
  <p class="center muted">Японский в дорогу. Кто будет учиться?</p>
  <div class="list profiles" style="margin-top:22px;${profiles.length ? "" : "display:none"}">
    ${profiles.map(p => `<button class="item" data-act="pickProfile" data-arg="${p.id}"><span class="avatar">${p.av}</span><span class="w"><b>${p.name}</b><div class="t">${profStat(p.id)}</div></span><span class="muted">›</span></button>`).join("")}
  </div>
  <div class="card" style="margin-top:14px">
    <div class="small muted" style="margin-bottom:8px">${profiles.length ? "Добавить ещё одного ученика" : "Создай свой профиль — у каждого своя память и прогресс"}</div>
    <div class="row"><input id="pname" class="search" placeholder="Имя" maxlength="20" style="flex:2"><button class="btn small" data-act="addProfile" style="flex:1">Создать</button></div>
  </div>`;
function profStat(id) { const d = LS.get("jp:p:" + id, null); if (!d) return "новый профиль"; const n = Object.keys(d.cards).length; return n ? `слов в работе: ${n}` : "ещё не начинал(а)"; }

// ----- главная -----
VIEWS.home = () => {
  const d = daily(), due = dueList();
  const revLeft = Math.max(0, S().revPerDay - d.rev), dueN = Math.min(due.length, revLeft);
  const newLeft = Math.max(0, S().newPerDay - d.new);
  const known = ALL.filter(w => stage(w) >= 2).length, started = Object.keys(P.cards).length;
  const nt = nextTopic(), soon = nextLearnSoon();
  let msg = "";
  if (!dueN && soon !== Infinity) { const m = Math.ceil((soon - now()) / 60000); msg = m < 60 ? `Следующее повторение через ${m} мин` : m < 1440 ? `Следующее повторение через ${Math.round(m / 60)} ч` : `Следующее повторение через ${Math.round(m / 1440)} дн.`; }
  return `
  <div class="top"><button class="avatar" data-act="go" data-arg="profiles">${me().av}</button><div class="grow"><b>${me().name}</b><div class="small muted">${started ? `в работе ${started} из ${ALL.length} слов` : "начнём?"}</div></div></div>
  <div class="hero"><div class="sakura">🌸</div>
    <div class="prompt">На сегодня</div>
    <div class="stats">
      <div class="stat"><b>${dueN}</b><span>повторить</span></div>
      <div class="stat"><b>${newLeft}</b><span>новых можно</span></div>
      <div class="stat"><b>${known}</b><span>знаю</span></div>
    </div>
    <div class="stack">
      ${dueN ? `<button class="btn red" data-act="startReview">Повторить · ${dueN}</button>` : ""}
      ${nt ? `<button class="btn ${dueN ? "ghost" : ""}" data-act="startLesson" data-arg="${nt.id}">Новые слова: ${nt.icon} ${nt.name}</button>` : `<div class="center muted">Все слова начаты — молодец!</div>`}
      ${msg ? `<div class="center small muted">${msg}</div>` : ""}
    </div>
  </div>
  <h2>Темы</h2>
  <div class="topics">${TOPICS.map(t => { const c = topicCounts(t), n = t.items.length;
    return `<button class="topic" data-act="openTopic" data-arg="${t.id}"><span class="ic">${t.icon}</span><span class="nm">${t.name}</span><span class="cnt">${c[2] + c[3]} из ${n} знаю</span>
      <span class="bar"><i class="s3" style="width:${c[3] / n * 100}%"></i><i class="s2" style="width:${c[2] / n * 100}%"></i><i class="s1" style="width:${c[1] / n * 100}%"></i></span></button>`; }).join("")}</div>
  ${legend()}`;
};
const legend = () => `<div class="legend"><span><i class="dot s1"></i>запоминаю</span><span><i class="dot s2"></i>знаю</span><span><i class="dot s3"></i>выучено</span></div>`;

// ----- тема -----
VIEWS.topic = () => {
  const t = TOPIC[V.id], fresh = t.items.filter(w => !card(w)).length, seen = t.items.length - fresh;
  return `
  <div class="top"><button class="iconbtn" data-act="go" data-arg="home">‹</button><div class="grow"><b>${t.icon} ${t.name}</b></div></div>
  <div class="row" style="margin:10px 0 14px">
    ${fresh ? `<button class="btn red" data-act="startLesson" data-arg="${t.id}">Учить новые · ${fresh}</button>` : ""}
    ${seen ? `<button class="btn ghost" data-act="practice" data-arg="${t.id}">Тренировка</button>` : ""}
  </div>
  <div class="list">${t.items.map(w => wordRow(w)).join("")}</div>${legend()}`;
};
function wordRow(w) {
  return `<div class="item"><span class="em">${thumb(w)}</span><button class="w" data-act="show" data-arg="${w.key}" style="text-align:left"><div class="j">${w.jp}</div>${S().romaji ? `<div class="r">${w.ro}</div>` : ""}<div class="t">${w.ru}</div></button><i class="dot s${stage(w)}"></i><button class="speak" data-act="say" data-arg="${w.key}">🔊</button></div>`;
}

// ----- урок: обзор → знакомство → мини-проверка -----
function startLesson(tid, force) {
  const t = TOPIC[tid];
  const left = Math.max(0, S().newPerDay - daily().new);
  if (!left && !force) { go("limit", { tid }); return; }
  const n = force ? S().lessonSize : Math.min(S().lessonSize, left);
  const words = t.items.filter(w => !card(w)).slice(0, n);
  if (!words.length) { toast("В этой теме все слова уже начаты"); return; }
  go("lesson", { tid, words, phase: "overview", i: 0, sub: 0, res: {} });
}
VIEWS.limit = () => `
  <div class="top"><button class="iconbtn" data-act="go" data-arg="home">‹</button></div>
  <div class="stagecard"><div class="done">🌙</div><h2>Новых слов на сегодня хватит</h2>
  <p class="hint">Лимит — ${S().newPerDay} в день, его можно поменять в настройках. Лучше сейчас повторить уже начатое.</p></div>
  <div class="stack bottom"><button class="btn" data-act="go" data-arg="home">На главную</button><button class="btn ghost" data-act="forceLesson" data-arg="${V.tid}">Всё равно учить</button></div>`;

VIEWS.lesson = () => {
  const L = V, t = TOPIC[L.tid];
  if (L.phase === "overview") return `
    <div class="top"><button class="iconbtn" data-act="go" data-arg="home">✕</button><div class="grow"><b>${t.icon} ${t.name}</b><div class="small muted">${L.words.length} новых слов — сначала просто посмотри и послушай</div></div></div>
    <div class="list" style="margin-top:10px">${L.words.map(w => `<div class="item"><span class="em">${thumb(w)}</span><div class="w"><div class="j">${w.jp}</div>${S().romaji ? `<div class="r">${w.ro}</div>` : ""}<div class="t">${w.ru}</div></div><button class="speak" data-act="say" data-arg="${w.key}">🔊</button></div>`).join("")}</div>
    <div class="bottom"><button class="btn red" data-act="lessonIntro">Начать</button></div>`;
  if (L.phase === "intro") {
    const w = L.words[L.i];
    const head = exHead((L.i + (L.sub ? 0.5 : 0)) / (L.words.length * 3));
    if (!L.sub) return head + `
      <div class="ex"><div class="stagecard"><div class="prompt">Слово ${L.i + 1} из ${L.words.length} · послушай</div>
        <div class="pic">${pic(w)}</div><button class="speak" style="width:64px;height:64px;font-size:26px;margin-top:10px" data-act="say" data-arg="${w.key}">🔊</button></div>
        <div class="bottom"><button class="btn" data-act="introReveal">Показать слово</button></div></div>`;
    return head + `
      <div class="ex"><div class="stagecard"><div class="pic" style="width:120px;height:120px;font-size:70px">${pic(w)}</div>
        <div class="bigjp">${w.jp}</div>${ro(w)}<div class="ru">${w.ru}</div>
        <button class="speak" data-act="say" data-arg="${w.key}">🔊</button>
        ${assocHTML(w)}${micHTML()}</div>
        <div class="bottom"><button class="btn red" data-act="introNext">${L.i + 1 < L.words.length ? "Дальше" : "К проверке"}</button></div></div>`;
  }
  if (L.phase === "check") {
    const task = L.tasks[L.i];
    return exHead((L.words.length + L.i * 2 / L.tasks.length * L.words.length) / (L.words.length * 3)) + choiceHTML(task, L);
  }
  if (L.phase === "done") return `
    <div class="stagecard" style="min-height:70dvh"><div class="done">🎉</div><h2>Урок пройден</h2>
    <p class="hint">${L.words.length} слов добавлено в повторения. Первое — уже через 1–10 минут, потом всё реже.</p></div>
    <div class="stack bottom"><button class="btn red" data-act="startReview">Повторить сейчас</button><button class="btn ghost" data-act="go" data-arg="home">На главную</button></div>`;
};
function exHead(p) { return `<div class="top"><button class="iconbtn" data-act="quit">✕</button><div class="progress"><i style="width:${Math.min(100, p * 100)}%"></i></div></div>`; }
function assocHTML(w) {
  if (!w.as) return "";
  return V.assoc === w.key ? `<div class="assoc">💡 ${w.as}</div>` : `<button class="assocbtn" data-act="assoc" data-arg="${w.key}">💡 подсказка</button>`;
}

// задания с выбором: listen — услышать и выбрать значение; pic — по картинке выбрать японское слово
function makeChoice(type, w, pool) {
  const others = type === "listen" ? pickOthers(w, pool, 3, c => c.em + c.ru) : pickOthers(w, pool, 3, c => c.jp);
  return { type, w, opts: shuffle([w, ...others]), picked: null };
}
function choiceHTML(task) {
  const w = task.w, done = task.picked !== null;
  const cls = o => !done ? "" : o.key === w.key ? "ok" : o.key === task.picked ? "bad" : "";
  const top = task.type === "listen"
    ? `<div class="prompt">Что это значит?</div><button class="speak" style="width:84px;height:84px;font-size:34px" data-act="say" data-arg="${w.key}">🔊</button>${done ? `<div class="bigjp">${w.jp}</div>${ro(w)}` : ""}`
    : `<div class="prompt">Как это по-японски?</div><div class="pic">${pic(w)}</div><div class="ru">${w.ru}</div>`;
  const opts = task.opts.map(o => task.type === "listen"
    ? `<button class="opt ${cls(o)}" data-act="pick" data-arg="${o.key}"><span class="e">${thumb(o)}</span><span class="small">${o.ru}</span></button>`
    : `<button class="opt ${cls(o)}" data-act="pick" data-arg="${o.key}"><span class="j">${o.jp}</span>${S().romaji ? `<span class="r">${o.ro}</span>` : ""}</button>`).join("");
  const wrong = done && task.picked !== w.key;
  return `<div class="ex"><div class="stagecard">${top}${wrong ? assocHTML(w) : ""}</div><div class="opts">${opts}</div>
    ${wrong ? `<div class="bottom"><button class="btn" data-act="choiceNext">Дальше</button></div>` : ""}</div>`;
}

// ----- повторение -----
function startReview(practiceTopic) {
  let q;
  if (practiceTopic) q = shuffle(TOPIC[practiceTopic].items.filter(w => card(w))).map(w => w.key);
  else { const left = Math.max(0, S().revPerDay - daily().rev); q = dueList().slice(0, left).map(w => w.key); }
  if (!q.length) { toast(practiceTopic ? "В теме ещё нет начатых слов" : "Сейчас повторять нечего"); go("home"); return; }
  go("review", { q, i: 0, practice: practiceTopic || null, ok: 0, total: 0, task: null });
  nextTask();
}
function nextTask() {
  const R = V;
  if (R.i >= R.q.length) { R.task = null; render(); return; }
  const w = BY[R.q[R.i]], st = stage(w);
  const pool = TOPIC[w.topic].items;
  let task;
  if (st <= 1 && Math.random() < 0.75) task = makeChoice(Math.random() < 0.5 ? "listen" : "pic", w, pool);
  else task = { type: Math.random() < 0.6 ? "recall" : "hear", w, revealed: false };
  R.task = task; V.assoc = null; micReset();
  render();
  if (task.type === "listen" || task.type === "hear") say(w);
}
VIEWS.review = () => {
  const R = V;
  if (!R.task) return `
    <div class="stagecard" style="min-height:70dvh"><div class="done">${R.practice ? "💪" : "✨"}</div><h2>${R.practice ? "Тренировка окончена" : "Повторение окончено"}</h2>
    <p class="hint">Ответов: ${R.total}, сразу верно — ${R.ok}.</p></div>
    <div class="stack bottom"><button class="btn" data-act="go" data-arg="home">На главную</button></div>`;
  const t = R.task, w = t.w, head = exHead(R.i / R.q.length);
  if (t.type === "listen" || t.type === "pic") return head + choiceHTML(t);
  const q = t.type === "recall"
    ? `<div class="prompt">Скажи по-японски</div><div class="pic">${pic(w)}</div><div class="ru">${w.ru}</div>`
    : `<div class="prompt">Что это значит?</div><button class="speak" style="width:84px;height:84px;font-size:34px" data-act="say" data-arg="${w.key}">🔊</button>`;
  if (!t.revealed) return head + `<div class="ex"><div class="stagecard">${q}${t.type === "recall" ? micHTML() : ""}</div>
    <div class="bottom"><button class="btn" data-act="reveal">Показать ответ</button></div></div>`;
  return head + `<div class="ex"><div class="stagecard">${t.type === "hear" ? `<div class="pic" style="width:120px;height:120px;font-size:70px">${pic(w)}</div>` : ""}
      <div class="bigjp">${w.jp}</div>${ro(w)}<div class="ru">${w.ru}</div><button class="speak" data-act="say" data-arg="${w.key}">🔊</button>${assocHTML(w)}${t.type === "recall" && MIC.url ? `<div class="mic"><button data-act="micPlay">▶︎ Я</button></div>` : ""}</div>
    <div class="bottom"><div class="small muted center" style="margin-bottom:8px">Как вспомнилось?</div>
    <div class="grades"><button class="g1" data-act="grade" data-arg="1">Не вспомнил</button><button class="g2" data-act="grade" data-arg="2">С трудом</button><button class="g3" data-act="grade" data-arg="3">Легко</button></div></div></div>`;
};
function answer(g) {
  const R = V, w = R.task.w;
  R.total++; if (g >= 3) R.ok++;
  if (!R.practice) {
    P.cards[w.key] = SRS.review(card(w), g, now(), opt());
    daily().rev++; save();
    if (P.cards[w.key].due - now() < 20 * 60000) R.q.splice(Math.min(R.q.length, R.i + 4), 0, w.key);
  } else if (g === 1) R.q.splice(Math.min(R.q.length, R.i + 4), 0, w.key);
  R.i++; nextTask();
}

// ----- шпаргалка -----
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ё/g, "е");
VIEWS.dict = () => `
  <h1>Шпаргалка</h1><p class="muted small" style="margin-top:0">Найди слово и покажи японцу крупно</p>
  <input id="q" class="search" placeholder="Поиск: вода, mizu, 水" value="${V.q || ""}" autocomplete="off">
  <div id="res" style="margin-top:12px"></div>`;
function paintDict() {
  const q = norm(V.q || "").trim(), res = document.getElementById("res");
  if (!q) { res.innerHTML = TOPICS.map(t => `<h2>${t.icon} ${t.name}</h2><div class="list">${t.items.map(wordRow).join("")}</div>`).join(""); return; }
  const found = ALL.filter(w => norm(w.ru).includes(q) || norm(w.ro).includes(q) || w.jp.includes(V.q.trim()) || w.kana.includes(V.q.trim()));
  res.innerHTML = found.length ? `<div class="list">${found.map(wordRow).join("")}</div>` : `<p class="center muted">Ничего не нашлось</p>`;
}
VIEWS.show = () => { const w = BY[V.key]; return `
  <div class="show"><button class="iconbtn" style="position:absolute;top:calc(10px + var(--safe-t));left:10px" data-act="back">✕</button>
    <div class="pic" style="width:110px;height:110px;font-size:64px">${pic(w)}</div>
    <div class="huge">${w.jp}</div>${w.kana !== w.jp ? `<div class="jp" style="font-size:22px;color:var(--ink2)">${w.kana}</div>` : ""}${ro(w)}<div class="ru">${w.ru}</div>
    <button class="speak" style="width:64px;height:64px;font-size:26px" data-act="say" data-arg="${w.key}">🔊</button>${assocHTML(w)}
    <div class="small muted">${SRS.STAGES[stage(w)]}</div></div>`; };

// ----- настройки -----
VIEWS.settings = () => {
  const s = S();
  const sw = (k, t, sub) => `<div class="set"><label>${t}${sub ? `<div class="small muted">${sub}</div>` : ""}</label><button class="switch ${s[k] ? "on" : ""}" data-act="toggle" data-arg="${k}"></button></div>`;
  const num = (k, t, opts, sub) => `<div class="set"><label>${t}${sub ? `<div class="small muted">${sub}</div>` : ""}</label><select data-set="${k}">${opts.map(o => `<option value="${o[0]}" ${String(s[k]) === String(o[0]) ? "selected" : ""}>${o[1]}</option>`).join("")}</select></div>`;
  const n = a => a.map(x => [x, x]);
  return `
  <h1>Настройки</h1>
  <h2>Профиль</h2>
  <div class="list"><button class="item" data-act="go" data-arg="profiles"><span class="avatar">${me().av}</span><span class="w"><b>${me().name}</b><div class="t">сменить или добавить ученика</div></span><span class="muted">›</span></button></div>
  <h2>Показ слов</h2>
  <div class="list">${sw("romaji", "Латиница (ромадзи)", "чтение под японским написанием")}${sw("mic", "Повторять вслух в микрофон", "можно выключить, если неудобно говорить")}
    ${num("rate", "Скорость голоса", [[0.6, "медленно"], [0.75, "спокойно"], [0.85, "обычно"], [1, "быстро"]])}
    <div class="set"><label>Проверить голос</label><button class="speak" data-act="sayTest">🔊</button></div></div>
  <h2>Нагрузка</h2>
  <div class="list">${num("newPerDay", "Новых слов в день", n([5, 10, 15, 20, 30, 40, 60]))}${num("lessonSize", "Слов в одном уроке", n([4, 5, 6, 8, 10]))}
    ${num("revPerDay", "Повторений в день, максимум", n([50, 100, 150, 200, 300, 500]))}
    ${num("maxInterval", "Самый длинный перерыв", [[7, "неделя"], [14, "2 недели"], [21, "3 недели"], [30, "месяц"], [90, "3 месяца"]], "пока путешествуешь, лучше короче")}
    ${num("retention", "Цель запоминания", [[0.85, "85% — меньше повторений"], [0.9, "90% — баланс"], [0.95, "95% — надёжнее"]])}</div>
  <h2>Данные</h2>
  <div class="list"><button class="item" data-act="export">💾 <span class="w">Сохранить прогресс в файл</span></button>
    <label class="item">📂 <span class="w">Восстановить из файла</span><input type="file" accept=".json,application/json" id="imp" hidden></label>
    <button class="item" data-act="resetProgress" style="color:var(--red)">↺ <span class="w">Сбросить прогресс профиля</span></button>
    <button class="item" data-act="deleteProfile" style="color:var(--red)">🗑 <span class="w">Удалить профиль</span></button></div>
  <p class="small muted center" style="margin-top:18px">Прогресс хранится только на этом телефоне. Время от времени сохраняй его в файл.</p>`;
};

// ---------- действия ----------
const ACT = {
  go: v => go(v),
  back: () => go(V.from || "home", V.fromData),
  say: k => say(BY[k]),
  sayTest: () => say({ key: "_", kana: "こんにちは、よろしくお願いします" }),
  show: k => go("show", { key: k, from: view, fromData: V }),
  assoc: k => { V.assoc = k; render(); },
  openTopic: id => go("topic", { id }),
  pickProfile: id => { pid = id; LS.set("jp:current", pid); loadProfile(); go("home"); },
  addProfile: () => {
    const name = (document.getElementById("pname").value || "").trim();
    if (!name) { toast("Впиши имя"); return; }
    const p = { id: "p" + Date.now().toString(36), name, av: AVATARS[profiles.length % AVATARS.length] };
    profiles.push(p); LS.set("jp:profiles", profiles); ACT.pickProfile(p.id);
  },
  startLesson: id => startLesson(id),
  forceLesson: id => startLesson(id, true),
  lessonIntro: () => { V.phase = "intro"; V.i = 0; V.sub = 0; render(); say(V.words[0]); },
  introReveal: () => { V.sub = 1; render(); say(V.words[V.i]); },
  introNext: () => {
    micReset(); V.assoc = null;
    if (V.i + 1 < V.words.length) { V.i++; V.sub = 0; render(); say(V.words[V.i]); return; }
    const pool = V.words.length >= 4 ? V.words : TOPIC[V.tid].items;
    V.tasks = [...shuffle(V.words).map(w => makeChoice("listen", w, pool)), ...shuffle(V.words).map(w => makeChoice("pic", w, pool))];
    V.phase = "check"; V.i = 0; render(); say(V.tasks[0].w);
  },
  pick: k => {
    const t = view === "lesson" ? V.tasks[V.i] : V.task;
    if (!t || t.picked !== null) return;
    t.picked = k; const ok = k === t.w.key;
    if (view === "lesson") { const r = V.res[t.w.key] = V.res[t.w.key] || { ok: 0, n: 0 }; r.n++; if (ok) r.ok++; }
    render(); say(t.w);
    if (ok) setTimeout(() => ACT.choiceNext(), 900);
  },
  choiceNext: () => {
    if (view === "lesson") {
      if (V.phase !== "check") return;
      V.assoc = null;
      if (V.i + 1 < V.tasks.length) { V.i++; render(); if (V.tasks[V.i].type === "listen") say(V.tasks[V.i].w); return; }
      const n = now();
      V.words.forEach(w => { const r = V.res[w.key] || { ok: 0, n: 1 }; const g = r.ok === r.n ? 3 : r.ok ? 2 : 1; P.cards[w.key] = SRS.review(null, g, n, opt()); });
      daily().new += V.words.length; save();
      V.phase = "done"; render();
    } else if (view === "review" && V.task) { answer(V.task.picked === V.task.w.key ? 3 : 1); }
  },
  startReview: () => startReview(),
  practice: id => startReview(id),
  reveal: () => { micStop(); V.task.revealed = true; render(); say(V.task.w); },
  grade: g => answer(+g),
  quit: () => { if (view === "lesson" && V.phase !== "overview" && V.phase !== "done" && !confirm("Выйти из урока? Слова этого урока не сохранятся.")) return; go("home"); },
  micStart: () => micStart(), micStop: () => micStop(), micPlay: () => micPlay(),
  toggle: k => { S()[k] = !S()[k]; save(); render(); },
  export: () => {
    const data = { app: "jp-words", v: 1, profile: me(), data: P, at: new Date().toISOString() };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
    a.download = `японский-${me().name}-${dayKey()}.json`; document.body.appendChild(a); a.click(); a.remove();
  },
  resetProgress: () => { if (!confirm(`Сбросить весь прогресс профиля «${me().name}»? Это нельзя отменить.`)) return; P.cards = {}; P.daily = {}; save(); toast("Прогресс сброшен"); go("home"); },
  deleteProfile: () => {
    if (!confirm(`Удалить профиль «${me().name}» со всем прогрессом? Это нельзя отменить.`)) return;
    LS.del("jp:p:" + pid); profiles = profiles.filter(p => p.id !== pid); LS.set("jp:profiles", profiles);
    pid = null; LS.del("jp:current"); go("profiles");
  },
};
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const f = ACT[b.dataset.act]; if (f) f(b.dataset.arg, b);
});
document.addEventListener("change", e => {
  const el = e.target;
  if (el.dataset.set) { const v = el.value; S()[el.dataset.set] = isNaN(+v) ? v : +v; save(); toast("Сохранено"); }
  if (el.id === "imp" && el.files[0]) {
    el.files[0].text().then(txt => {
      const d = JSON.parse(txt);
      if (d.app !== "jp-words" || !d.data || !d.data.cards) throw new Error();
      if (!confirm(`Заменить прогресс профиля «${me().name}» данными из файла (${Object.keys(d.data.cards).length} слов)?`)) return;
      P = d.data; P.settings = { ...DEFAULTS, ...P.settings }; save(); toast("Прогресс восстановлен"); go("home");
    }).catch(() => toast("Это не файл прогресса"));
  }
});
document.addEventListener("input", e => { if (e.target.id === "q") { V.q = e.target.value; paintDict(); } });
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "pname") ACT.addProfile(); });

// ---------- старт ----------
if (pid && profiles.find(p => p.id === pid)) loadProfile();
render();
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
