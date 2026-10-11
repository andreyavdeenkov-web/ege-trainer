'use strict';
/**
 * Оценка времени выполнения заданий практикума «Норма права» по их объёму.
 * Использование: node scripts/estimate-time.js [страница] — по умолчанию olympiad-demo.html.
 *
 * Модель (для ученика 9–11 класса, ориентир для экспертизы, не замер):
 *   чтение условия, ситуации и нормативных текстов — 110 слов в минуту
 *   (юридический текст читают медленнее обычного);
 *   формулировки строк и вариантов — 160 слов в минуту;
 *   решения: выбор в строке — 20 с; уточнение «спорно» — +15 с; доказательство — +35 с;
 *   метка фрагмента — 6 с; шаг рассуждения — 15 с, ошибочный шаг — ещё 40 с
 *   (происхождение и тип); довод — 2 решения по 20 с; краткий ответ — 45 с; слот — 20 с;
 *   фиксация части составного задания — 15 с.
 * Итог округляется до 0,5 мин.
 */
const { loadBank } = require('../tests/helpers/olymp.js');

const READ = 110;
const SCAN = 160;
const words = (t) => (String(t || '').match(/[\p{L}\d]+/gu) || []).length;
const legalWords = (legal) => (legal || []).reduce((n, b) => n + b.fragments.reduce((m, f) => m + words(f.text), 0), 0);

function rowsCost(rows) {
  let s = 0;
  for (const r of rows) {
    s += (words(r.label) + r.options.reduce((n, o) => n + words(o), 0)) / SCAN * 60 + 20;
    if (r.followUp) s += 15;
    if (r.evidence) s += 35;
  }
  return s;
}
const argsCost = (list) => list.reduce((s, a) => s + words(a.text) / READ * 60 + 40, 0);
const shortCost = (items) => items.reduce((s, it) => s + words(it.label) / SCAN * 60 + 45, 0);

function estimate(task) {
  let read = words(task.question) + legalWords(task.legal) + words((task.situation || []).join(' '));
  let sec = 0;
  const rowsOfSections = (sections) => (sections || []).flatMap((x) => x.rows);
  switch (task.type) {
    case 'analysis-grid': sec += rowsCost(rowsOfSections(task.sections)); break;
    case 'text-markup':
      read += words(task.markupHint);
      sec += Object.keys(task.markup.key).length * 6 + rowsCost(rowsOfSections(task.sections));
      break;
    case 'reasoning-check':
      read += words(task.markHint);
      sec += task.steps.reduce((s, st) => s + words(st.text) / READ * 60 + 15 + (st.key.error ? 40 : 0), 0);
      sec += rowsCost(rowsOfSections(task.sections));
      break;
    case 'formula-builder':
      read += words(task.template) + words(task.context ? task.context.paragraphs.join(' ') : '');
      sec += task.slots.reduce((s, sl) => s + sl.options.reduce((n, o) => n + words(o), 0) / SCAN * 60 + 20, 0);
      break;
    case 'short-answer': sec += shortCost(task.items); break;
    case 'systematize':
      read += task.categories.reduce((n, c) => n + words(c.label) + words(c.definition), 0) + words(task.criterion);
      sec += task.items.reduce((s, it) => s + words(it.text) / READ * 60 + 20, 0);
      break;
    case 'link-map':
      read += task.relations.reduce((n, r) => n + words(r.label) + words(r.definition), 0) + words(task.relationsNote);
      sec += task.pairs.length * 35 + rowsCost(rowsOfSections(task.sections));
      break;
    case 'argument-check': read += words(task.issue) + words(task.conclusion); sec += argsCost(task.arguments); break;
    case 'compound':
      for (const p of task.parts) {
        read += words(p.intro) + legalWords(p.legal) + words(p.issue) + words(p.conclusion);
        if (p.kind === 'choice') sec += rowsCost(p.rows);
        else if (p.kind === 'short') sec += shortCost(p.items);
        else sec += argsCost(p.arguments);
        sec += 15;
      }
      break;
    default: return null;
  }
  const total = read / READ * 60 + sec;
  return { readMin: read / READ, workMin: sec / 60, total: Math.round(total / 30) / 2 };
}

if (require.main === module) {
  const OLY = loadBank(process.argv[2] || 'olympiad-demo.html');
  for (const t of OLY.tasks.filter((x) => x.topic === 'LAW-NRM')) {
    const e = estimate(t);
    if (e) console.log([t.id, t.type, e.readMin.toFixed(1), e.workMin.toFixed(1), e.total].join('\t'));
  }
}

module.exports = { estimate };
