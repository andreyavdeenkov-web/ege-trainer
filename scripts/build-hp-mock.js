'use strict';

/**
 * Собирает файлы пробного тура «Высшая проба — диагностический вариант № 1»
 * из утверждённых исходных данных docs/hp-diag-1/:
 *   data/olympiads/hp/mock/diag-1.js     — условия без ключей (подключается в olympiad.html);
 *   data/olympiads/hp/mock/diag-1-key.js — ключи и разборы (загружается после завершения попытки).
 *
 *   node scripts/build-hp-mock.js           — записать файлы;
 *   node scripts/build-hp-mock.js --check   — проверить, что файлы совпадают со сборкой.
 * Файлы сайта вручную не редактируются: правки вносятся в docs/hp-diag-1/ и пересобираются.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'docs/hp-diag-1/variant.js');
const OUT_DIR = path.join(ROOT, 'data/olympiads/hp/mock');
const VARIANT_FILE = 'diag-1.js';
const KEY_FILE = 'diag-1-key.js';
const KEY_SRC = 'data/olympiads/hp/mock/' + KEY_FILE;

/** Подписи типов для ввода ответа (технические указания — решение преподавателя). */
const UNIT_SUFFIXES = ['млрд', 'млрд ден. ед.'];

function publicTask(t) {
  const out = {
    number: t.number,
    type: t.type,
    discipline: t.discipline,
    points: t.points,
    level: t.level,
    question: t.question
  };
  if (t.answerFormatUi) out.answerFormat = t.answerFormatUi;
  if (t.type === 'multiple-select') out.options = t.options.map((o) => ({ text: o.text }));
  if (t.type === 'multi-field') out.fields = t.fields.map(({ answer, ...rest }) => rest);
  if (t.type === 'matching') {
    out.items = t.items.map((i) => ({ text: i.text }));
    out.options = t.options.slice();
    out.oneToOne = true;
    out.labels = 'numbers-letters';
  }
  if (t.type === 'essay') {
    out.disciplineLabel = t.disciplineLabel;
    out.limits = t.limits;
  }
  return out;
}

function keyTask(t) {
  const k = {};
  if (t.type === 'multiple-select') k.options = t.options.map((o) => ({ correct: o.correct, explanation: o.explanation }));
  if (t.type === 'short-text') {
    k.acceptedAnswers = t.accepted.filter((a) => a.basis !== 'proposed').map((a) => a.text);
    k.normalize = { yo: true, punctuation: true };
  }
  if (t.type === 'numeric') {
    k.answer = t.answer;
    k.unitSuffixes = UNIT_SUFFIXES;
  }
  if (t.type === 'multi-field') k.answers = Object.fromEntries(t.fields.map((f) => [f.id, f.answer]));
  if (t.type === 'matching') {
    const LETTERS = 'АБВГДЕЖ';
    k.matches = t.items.map((i) => LETTERS.indexOf(i.match) + 1);
    k.itemExplanations = t.items.map((i) => i.explanation);
    k.extraExplanations = t.extraExplanations;
  }
  if (t.keyDisplay) k.keyDisplay = t.keyDisplay;
  k.diagTopic = t.diagTopic;
  k.feedback = t.feedback;
  return k;
}

function build() {
  delete require.cache[require.resolve(SOURCE)];
  for (const part of ['part-1', 'part-2', 'part-3', 'part-4']) {
    const p = path.join(ROOT, 'docs/hp-diag-1', part + '.js');
    delete require.cache[require.resolve(p)];
  }
  const V = require(SOURCE);
  const variant = {
    id: V.id,
    olympiad: 'HP',
    title: V.title,
    subtitle: V.subtitle,
    classes: V.classes,
    stage: V.stage,
    round: V.round,
    durationMinutes: V.durationMinutes,
    maxPoints: V.maxPoints,
    autoMaxPoints: V.autoMaxPoints,
    disclaimer: V.disclaimer,
    keySrc: KEY_SRC,
    instruction: {
      lead: V.instruction.lead,
      table: V.instruction.table,
      items: V.instruction.items.map((i) => i.text)
    },
    parts: V.parts,
    disciplines: V.disciplines,
    scoring: V.scoring,
    tasks: V.tasks.map(publicTask)
  };
  const key = { tasks: Object.fromEntries(V.tasks.map((t) => [t.number, keyTask(t)])) };
  const head = (what) => '/*\n * ' + what + '\n * Файл собран из docs/hp-diag-1/ командой node scripts/build-hp-mock.js — вручную не редактировать.\n */\n';
  return {
    [VARIANT_FILE]: head('Пробный тур «Высшая проба — диагностический вариант № 1»: условия заданий без ключей.') +
      'OLY.mock.defineVariant(' + JSON.stringify(variant, null, 2) + ');\n',
    [KEY_FILE]: head('Пробный тур «Высшая проба — диагностический вариант № 1»: ключи и разборы.\n * Загружается страницей только после завершения попытки.') +
      'OLY.mock.defineKey(' + JSON.stringify(V.id) + ', ' + JSON.stringify(key, null, 2) + ');\n'
  };
}

if (require.main === module) {
  const files = build();
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(OUT_DIR, name);
    if (check) {
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      if (current !== content) { stale++; console.error('Устарел: ' + path.relative(ROOT, file)); }
    } else {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(file, content);
      console.log('Записан: ' + path.relative(ROOT, file));
    }
  }
  if (stale) process.exit(1);
}

module.exports = { build, VARIANT_FILE, KEY_FILE, OUT_DIR };
