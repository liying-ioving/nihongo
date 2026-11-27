// Интервальные повторения: шаги заучивания внутри дня + FSRS-4.5 для интервалов в днях.
const SRS = (() => {
  const W = [0.4872,1.4003,3.7145,13.8206,5.1618,1.2298,0.8975,0.031,1.6474,0.1367,1.0461,2.1072,0.0793,0.3246,1.587,0.2272,2.8755];
  const DECAY = -0.5, FACTOR = 19 / 81, DAY = 86400000, MIN = 60000;
  const LEARN_STEPS = [1 * MIN, 10 * MIN];      // новое слово: через минуту, через 10 минут, потом дни
  const RELEARN_STEP = 10 * MIN;                // забытое: через 10 минут
  const clampD = d => Math.min(10, Math.max(1, d));
  const initS = g => W[g - 1];
  const initD = g => clampD(W[4] - (g - 3) * W[5]);
  const retr = (t, s) => Math.pow(1 + FACTOR * t / s, DECAY);
  const nextD = (d, g) => clampD(W[7] * initD(3) + (1 - W[7]) * (d - W[6] * (g - 3)));
  function nextS(s, d, r, g) {
    if (g === 1) return Math.min(s, W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));
    const hard = g === 2 ? W[15] : 1, easy = g === 4 ? W[16] : 1;
    return s * (Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hard * easy + 1);
  }
  function intervalDays(s, opt) {
    const r = opt.retention || 0.9;
    const ivl = s / FACTOR * (Math.pow(r, 1 / DECAY) - 1);
    return Math.max(1, Math.min(opt.maxInterval || 30, Math.round(ivl)));
  }
  // g: 1 — не вспомнил, 2 — с трудом, 3 — хорошо, 4 — легко
  function review(card, g, now, opt) {
    const c = card ? { ...card } : { state: "learning", step: 0, reps: 0, lapses: 0, s: initS(g), d: initD(g), last: now, due: now };
    if (!card) {
      c.step = g === 1 ? 0 : (g === 4 ? LEARN_STEPS.length : 1);
    } else if (c.state === "learning") {
      if (g === 1) c.step = 0;
      else c.step += (g === 4 ? 2 : 1);
      c.d = nextD(c.d, g);
      if (g === 4) c.s = Math.max(c.s, initS(4) / 2);
    } else {
      const t = Math.max(0, (now - c.last) / DAY);
      const r = retr(t, c.s);
      c.d = nextD(c.d, g);
      c.s = nextS(c.s, c.d, r, g);
      if (g === 1) { c.lapses++; c.state = "learning"; c.step = 1; c.due = now + RELEARN_STEP; c.reps++; c.last = now; return c; }
    }
    c.reps++;
    c.last = now;
    if (c.state === "learning" && c.step < LEARN_STEPS.length) {
      c.due = now + LEARN_STEPS[c.step];
    } else {
      const graduating = c.state === "learning";
      c.state = "review";
      // только что заученное — первый перерыв 1 день (на «легко» — по алгоритму)
      c.due = now + (graduating && g < 4 ? 1 : intervalDays(c.s, opt)) * DAY;
    }
    return c;
  }
  // Ступени для человека
  function stage(card) {
    if (!card) return 0;                       // новое
    if (card.state === "learning" || card.s < 5) return 1;  // запоминаю
    if (card.s < 21) return 2;                 // знаю
    return 3;                                  // выучено
  }
  const STAGES = ["новое", "запоминаю", "знаю", "выучено"];
  return { review, stage, STAGES, DAY, MIN };
})();
