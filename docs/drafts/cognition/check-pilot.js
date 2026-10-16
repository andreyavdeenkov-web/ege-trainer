/**
 * Проверка пилотных заданий и сборка документа для экспертизы.
 *   node docs/drafts/cognition/check-pilot.js          — проверка, отчёт в консоль
 *   node docs/drafts/cognition/check-pilot.js --write  — то же + docs/drafts/cognition/pilot.md
 *   node docs/drafts/cognition/check-pilot.js --set batch1 [--write] — партия (batch1.js → batch1.md);
 *       дополнительно сверяется с утверждённым пилотом: ID и близкие суждения.
 *
 * Программная проверка подтверждает только форму: модель задания, число вариантов,
 * объяснения, ключи, отсутствие дублей. Содержательную правильность она не доказывает —
 * для этого см. поле REVIEW (экспертиза) в pilot.js.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadBank } = require('../../../tests/helpers/ege.js');
const { metadataErrors, newTaskErrors } = require('../../../tests/helpers/bank-rules.js');
const argSet = process.argv.indexOf('--set');
const SET = argSet === -1 ? 'pilot' : process.argv[argSet + 1];
const isPilot = SET === 'pilot';
const pilot = require('./pilot.js');
const { tasks, REVIEW } = require(`./${SET}.js`);
const BASIS = require(`./${SET}.js`).BASIS || pilot.BASIS;
// С чем сверяются дубли: банк сайта, а для партии — ещё и утверждённый пилот.
const others = () => EGE.tasks.concat(isPilot ? [] : pilot.tasks);
const STATUSES = isPilot ? ['принять', 'переработать', 'заменить'] : ['готово', 'требует согласования', 'требует уточнения'];

const EGE = loadBank();
const S = EGE.scoring;
const errors = [];
const warnings = [];
const err = (id, msg) => errors.push(`${id}: ${msg}`);

/* ---------- Модели КИМ ---------- */

const MODEL = {
  1: { title: 'Позиция 1 КИМ — два термина, «выпадающих» из общего ряда', type: 'exclude-two', points: 1 },
  2: { title: 'Позиция 2 КИМ — выбор верных суждений', type: 'multiple', points: 2 },
  3: { title: 'Позиция 3 КИМ — установление соответствия', type: 'matching', points: 1 },
  4: { title: 'Позиция 4 КИМ — ситуация (слайд) и выбор из списка', type: 'multiple', points: 2 }
};

const RESTRICTIVE = /(^|[^а-яё])(только|всегда|никогда|исключительно|любой|любое|любая|единственн|раз и навсегда)/i;
const EMPTY_EXPLANATION = /соответствует определению|противоречит теории|так как это верно|так как это неверно/i;
const norm = (t) => String(t).toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const words = (t) => new Set(norm(t).split(' ').filter((w) => w.length > 3));
const jaccard = (a, b) => {
  const A = words(a); const B = words(b);
  const inter = [...A].filter((w) => B.has(w)).length;
  return inter / (A.size + B.size - inter || 1);
};
const textsOf = (t) => (S.getTaskType(t) === 'matching' ? t.items.map((i) => i.text) : t.statements.map((s) => s.text));
const keyString = (t) => S.getCorrect(t).join('');

/* ---------- Проверки ---------- */

const ids = new Set();
for (const t of tasks) {
  if (ids.has(t.id)) err(t.id, 'повторяющийся ID');
  ids.add(t.id);
  if (!/^OBS-(COG|SCI)-\d{3}$/.test(t.id)) err(t.id, 'ID вида OBS-COG-001 / OBS-SCI-001');
  if (EGE.tasks.some((b) => b.id === t.id)) err(t.id, 'ID уже занят в банке');
  if (!isPilot && pilot.tasks.some((b) => b.id === t.id)) err(t.id, 'ID уже занят в утверждённом пилоте');

  // Схема 2 банка — те же правила, что и для новых заданий банка.
  metadataErrors(EGE, t).concat(newTaskErrors(EGE, t)).forEach((e) => err(t.id, e));

  const model = MODEL[t.kimTask];
  if (!model) { err(t.id, 'kimTask — 1, 2, 3 или 4'); continue; }
  if (S.getTaskType(t) !== model.type) err(t.id, `модель ${t.kimTask} требует тип ${model.type}`);
  if (!REVIEW[t.id]) err(t.id, 'нет экспертизы в REVIEW');
  else if (!STATUSES.includes(REVIEW[t.id][0])) err(t.id, `статус — ${STATUSES.join(' / ')}`);
  if (!t.draft || !t.draft.code || !t.draft.theory || !t.draft.skill) err(t.id, 'нет draft.code / skill / theory');
  // Задание по официальному документу (например, Стратегии НТР): у каждой верной позиции —
  // ссылка на пункт документа (поле ref), у задания — draft.officialSource.
  if (t.draft && t.draft.officialSource) {
    (t.statements || []).filter((x) => x.correct).forEach((x, i) => {
      if (!x.ref) err(t.id, `верная позиция ${i + 1}: нет ссылки ref на пункт документа`);
    });
  }

  const correct = S.getCorrect(t);
  if (t.kimTask === 2) {
    if (t.statements.length !== 5) err(t.id, 'позиция 2: ровно 5 суждений');
    if (t.choiceOf) err(t.id, 'позиция 2: выбираются суждения');
  }
  if (t.kimTask === 4) {
    if (t.statements.length !== 6) err(t.id, 'позиция 4: ровно 6 позиций');
    if (t.choiceOf !== 'items') err(t.id, 'позиция 4: choiceOf: items');
    if (correct.length < 2 || correct.length > 4) err(t.id, 'позиция 4: 2–4 верных');
  }
  if (t.kimTask === 1 && correct.length !== 2) err(t.id, 'позиция 1: ровно два лишних');
  if (t.kimTask === 3) {
    // Во втором столбце позиции 3 — от 2 до 4 вариантов (ключи Котовой — Лисковой 2026, в. 5, 14, 28, 30).
    if (t.options.length < 2 || t.options.length > 4) err(t.id, 'позиция 3: 2–4 варианта во втором столбце');
    const used = new Set(correct);
    if (used.size !== t.options.length) err(t.id, 'позиция 3: каждый вариант второго столбца должен использоваться');
    if (t.oneToOne) err(t.id, 'позиция 3: номера повторяются, oneToOne не нужен');
  }

  // Ограничительные слова: не больше одного такого суждения в задании.
  // Правило — для суждений и позиций выбора; в позициях соответствия «только» описывает действие, а не ограничивает суждение.
  const restricted = S.getTaskType(t) === 'matching' ? [] : textsOf(t).filter((x) => RESTRICTIVE.test(x.replace(/не только/gi, '')));
  if (restricted.length > 1) err(t.id, `ограничительные слова в ${restricted.length} суждениях`);

  // Пустые объяснения-шаблоны.
  const parts = S.getTaskType(t) === 'matching' ? t.items : t.statements;
  parts.forEach((p, i) => { if (EMPTY_EXPLANATION.test(p.explanation)) err(t.id, `позиция ${i + 1}: шаблонное объяснение`); });

  // Дубли и близкие суждения в банке.
  for (const b of others()) {
    for (const x of textsOf(t)) {
      for (const y of textsOf(b)) {
        if (norm(x) === norm(y) && words(x).size >= 3) err(t.id, `суждение совпадает с ${b.id}: «${x}»`);
        else if (words(x).size >= 4 && jaccard(x, y) >= 0.5) warnings.push(`${t.id}: близко к ${b.id}: «${x}» ~ «${y}»`);
      }
    }
  }
}

// Ключи: в одной модели наборы не повторяются; доля «первое суждение верно».
for (const k of [1, 2, 3, 4]) {
  const group = tasks.filter((t) => t.kimTask === k);
  const keys = group.map(keyString);
  const dup = keys.filter((x, i) => keys.indexOf(x) !== i);
  // Повтор набора ключей — только сведение для редактора: порядок суждений не меняют ради уникальности.
  if (dup.length) warnings.push(`модель ${k}: повторяющиеся ключи ${dup.join(', ')} (сведение, не ошибка)`);
}
const m1 = tasks.filter((t) => t.kimTask === 2);
const firstTrue = m1.filter((t) => t.statements[0].correct).length;
const avgLen = (pred) => {
  const xs = m1.flatMap((t) => t.statements.filter(pred).map((s) => s.text.length));
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
};

/* ---------- Отчёт ---------- */

console.log(`Заданий: ${tasks.length} (OBS-COG: ${tasks.filter((t) => t.id.startsWith('OBS-COG')).length}, OBS-SCI: ${tasks.filter((t) => t.id.startsWith('OBS-SCI')).length})`);
for (const k of [1, 2, 3, 4]) {
  console.log(`  модель ${k}: ${tasks.filter((t) => t.kimTask === k).map((t) => `${t.id}=${keyString(t)}`).join(', ')}`);
}
console.log(`Позиция 2: первое суждение верно в ${firstTrue} из ${m1.length}; средняя длина верных ${avgLen((s) => s.correct)}, неверных ${avgLen((s) => !s.correct)} знаков`);
warnings.forEach((w) => console.log('ПРЕДУПРЕЖДЕНИЕ ' + w));
errors.forEach((e) => console.log('ОШИБКА ' + e));
console.log(errors.length ? `Ошибок: ${errors.length}` : 'Ошибок нет');

/* ---------- Документ для экспертизы ---------- */

function render() {
  const letter = (i) => 'АБВГДЕ'[i];
  const out = [];
  if (isPilot) {
    out.push('# Пилот: 10 + 10 заданий — итоговая версия для утверждения', '');
    out.push('Статус: **утверждён автором (редакция 6)**. Задания не подключены к сайту и не входят в банк.');
  } else {
    out.push(`# Партия ${SET.replace(/\D/g, '')}: ${tasks.length} заданий — редакционный черновик`, '');
    out.push('Статус: **черновик для экспертизы автором**. Задания не подключены к сайту и не входят в банк.');
  }
  out.push(`Источник данных: \`docs/drafts/cognition/${SET}.js\`; этот файл собран скриптом \`check-pilot.js${isPilot ? '' : ' --set ' + SET} --write\` — правьте \`${SET}.js\`.`, '');
  out.push('Формулировки адаптированы к интерфейсу тренажёра (без «запишите цифры…»). В скобках «Ответ в бланке» — запись ответа по правилам ЕГЭ.', '');
  const count = (st) => tasks.filter((t) => REVIEW[t.id][0] === st).length;
  if (!isPilot) out.push(`**Редакционная экспертиза партии:** готово — ${count('готово')}, требует согласования — ${count('требует согласования')}, требует уточнения — ${count('требует уточнения')}. Обоснование отбора и перепланировки — в отчёте \`stage-1-2.md\`, раздел «Партия 1».`, '');
  else out.push(`**Заключительная экспертиза** (сверка с полным корпусом № 1–4 из 30 вариантов Котовой — Лисковой 2026): принять — ${count('принять')}, переработать — ${count('переработать')}, заменить — ${count('заменить')}. Подробности — в отчёте \`stage-1-2.md\`, разделы «Редакция 5» и «Редакция 6».`, '');
  out.push('| ID | Модель | Элемент | Ключ | Сл. | Статус |', '|---|---|---|---|---|---|');
  for (const t of tasks) {
    out.push(`| ${t.id} | ${t.kimTask} | ${t.draft.code} | ${keyString(t)} | ${t.difficulty} | ${REVIEW[t.id][0]} |`);
  }
  out.push('');
  for (const t of tasks) {
    const type = S.getTaskType(t);
    const topic = t.id.startsWith('OBS-COG') ? 'Познание' : 'Научное познание';
    out.push('---', '', `## ${t.id}`, '');
    out.push(`**Тема:** ${topic}  `);
    out.push(`**Элемент кодификатора:** ${t.draft.code}  `);
    out.push(`**Проверяемое содержание:** ${t.draft.content}  `);
    out.push(`**Умение:** ${t.draft.skill}  `);
    out.push(`**Формат:** ${MODEL[t.kimTask].title}; ${MODEL[t.kimTask].points} ${S.pluralPoints(MODEL[t.kimTask].points)}; сложность ${t.difficulty} из 3`, '');
    out.push(`**Условие задания:** ${t.question}${t.instruction ? ' ' + t.instruction : ''}`, '');
    out.push('**Варианты ответа:**', '');
    if (type === 'matching') {
      out.push(`| ${t.columns[0]} | ${t.columns[1]} |`, '|---|---|');
      const n = Math.max(t.items.length, t.options.length);
      for (let i = 0; i < n; i++) {
        const a = t.items[i] ? `${letter(i)}) ${t.items[i].text}` : '';
        const b = t.options[i] ? `${i + 1}) ${t.options[i]}` : '';
        out.push(`| ${a} | ${b} |`);
      }
    } else {
      t.statements.forEach((s, i) => out.push(`${i + 1}) ${s.text}`));
    }
    out.push('');
    if (type === 'matching') {
      out.push(`**Правильный ответ:** ${t.items.map((it, i) => `${letter(i)} — ${it.match}`).join(', ')} (ответ в бланке: ${keyString(t)})`, '');
      out.push('**Объяснения:**', '');
      t.items.forEach((it, i) => out.push(`- **${letter(i)} — ${it.match}.** ${it.explanation}`));
    } else {
      out.push(`**Правильный ответ:** ${S.getCorrect(t).join(', ')} (ответ в бланке: ${keyString(t)})`, '');
      if (t.commonFeature) out.push(`**Общий признак ряда:** ${t.commonFeature}`, '');
      out.push('**Объяснения:**', '');
      t.statements.forEach((s, i) => out.push(`- **${i + 1}.** ${s.explanation}`));
    }
    out.push('');
    const parts = type === 'matching' ? t.items : t.statements;
    const mistakes = parts.map((p, i) => [p, i]).filter(([p]) => p.mistake);
    out.push('**Типичные ошибки:**', '');
    mistakes.forEach(([p, i]) => out.push(`- ${type === 'matching' ? letter(i) : i + 1}: ${p.mistake}`));
    out.push('', `**Теоретическая опора:** ${t.draft.theory}`, '');
    out.push(`**Основание соответствия ФИПИ:** ${BASIS[t.kimTask]} Элемент содержания — кодификатор ЕГЭ-2027 (проект), ${t.draft.code}. Задание авторское, не является заданием ФИПИ или сборника.`, '');
    out.push(`**${isPilot ? 'Заключительная экспертиза' : 'Редакционная экспертиза'}:** ${REVIEW[t.id][1]}`, '');
    out.push(`**Редакционный статус:** ${REVIEW[t.id][0]}`, '');
  }
  return out.join('\n');
}

if (process.argv.includes('--write')) {
  fs.writeFileSync(path.join(__dirname, `${SET}.md`), render());
  console.log(`Записан docs/drafts/cognition/${SET}.md`);
}
process.exitCode = errors.length ? 1 : 0;
