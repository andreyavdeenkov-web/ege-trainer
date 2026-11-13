#!/usr/bin/env node
'use strict';

/**
 * Подготовка данных темы «Типы обществ» (OBS-TYP) из утверждённого банка
 * преподавателя (Markdown, «Окончательная редакция банка „Типы обществ“»).
 *
 *   node scripts/build-society-types.js путь/к/банку.md
 *
 * Результат — data/tasks/society/society-types.js (25 заданий OBS-TYP-001…025).
 * Сам документ, как и экспертизы других тем, хранится вне репозитория:
 * сайт публикуется целиком. Разбор Markdown выполняется только здесь, при
 * подготовке данных; в браузере работает готовый файл с заданиями.
 *
 * Что берётся из документа (разделы III–V):
 *   III  — условия, варианты, позиции соответствия, варианты второго столбца;
 *   IV   — ключ, объяснение каждой позиции, проверяемое знание, типичная ошибка,
 *          познавательное действие, уровень, источник;
 *   V.1  — формат, типы обществ, критерии, уровень и действие (кодами);
 *   V.2  — поэлементная разметка неверных позиций (теги ошибок, тип общества);
 *   V.3  — положения сверх таблицы (пометка «дополнительно»).
 *
 * Скрипт останавливается с ошибкой, если данные разделов расходятся между собой:
 * ключ раздела IV и таблицы V.1, вердикт объяснения («Верно», «Выпадает», «(2)»…)
 * и ключ, число позиций, уровень и действие разделов IV и V.1, разметка V.2 и ключ.
 *
 * Изменения текста относительно документа — только эти (см. ADAPTATIONS и FIXES):
 *  - из условий убраны бланковые указания («…и запишите цифры, под которыми они
 *    указаны», «Запишите в таблицу выбранные цифры…») — ученик отвечает кнопками,
 *    так оформлены все задания платформы (source.adapted: true);
 *  - заголовки столбцов соответствия набраны строчными («Характеристики»), как в банке;
 *  - разметка Markdown (**полужирный**, экранирование) снята;
 *  - в объяснении задания № 20 заменена одна фраза — утверждённое преподавателем исправление.
 */
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, '..', 'data', 'tasks', 'society', 'society-types.js');

/** Утверждённые преподавателем исправления содержания: [номер, было, стало]. */
const FIXES = [
  [20,
    'С традиционной легитимностью они не связаны вовсе.',
    'Свободные конкурентные выборы сами по себе не определяют традиционную легитимность, основанную на признании обычаев и исторически сложившихся порядков.']
];

const FORMAT_TYPE = { EXCL: 'exclude-two', MATCH: 'matching', MULTI: 'multiple', COND: 'multiple' };
/** Позиция КИМ ЕГЭ-2027 по формату: модель оценивания — js/scoring.js. */
const FORMAT_KIM = { EXCL: 1, MULTI: 2, MATCH: 3, COND: 4 };
const LEVELS = { 'Б': 1, 'С': 2, 'Пв': 3 };
const LEVEL_WORDS = { 'базовый': 1, 'средний': 2, 'повышенный': 3 };
const ACTIONS = { 'Уз': 'recognition', 'Пн': 'understanding', 'Рз': 'distinction' };
const ACTION_WORDS = { 'узнавание': 'recognition', 'понимание': 'understanding', 'различение': 'distinction' };
const CRITERIA = { 'ПР': 'nature', 'Ф': 'factor', 'Э': 'economy', 'С': 'social', 'ПЛ': 'politics', 'Д': 'spiritual' };
const SOCIETIES = { 'Т': 'traditional', 'И': 'industrial', 'П': 'postindustrial' };
const TRAP_TAGS = ['ПТ', 'СП', 'ПС', 'ЧО', 'ФП'];
const LETTERS = ['А', 'Б', 'В', 'Г', 'Д'];

function fail(msg) {
  throw new Error('Банк «Типы обществ»: ' + msg);
}

/** Снимает разметку Markdown: полужирный, экранирование, неразрывные пробелы-сущности, перенос «\». */
function clean(text) {
  return text
    .replace(/&#x20;/g, ' ')
    .replace(/\\_/g, '_')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\\$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sliceBetween(text, start, end) {
  const a = text.indexOf(start);
  if (a === -1) fail('нет раздела «' + start + '»');
  const b = end ? text.indexOf(end, a + start.length) : text.length;
  if (b === -1) fail('нет раздела «' + end + '»');
  return text.slice(a + start.length, b);
}

/** Делит текст на блоки по заголовкам-маркерам; возвращает { номер: текст блока }. */
function splitByNumber(text, re) {
  const blocks = {};
  const matches = [...text.matchAll(re)];
  matches.forEach((m, i) => {
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    blocks[Number(m[1])] = { head: m[0], body: text.slice(m.index + m[0].length, end) };
  });
  return blocks;
}

function parseTable(text) {
  return text.split('\n')
    .filter((l) => /^\s*\|/.test(l) && !/^\s*\|\s*-/.test(l))
    .map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
}

/* ---------- Раздел III: условия ---------- */

const BLANK_TAILS = [
  / и запишите цифры, под которыми они указаны\.$/,
  / Запишите цифры, под которыми они указаны\.$/
];

function stripBlank(text) {
  let out = text;
  for (const re of BLANK_TAILS) out = out.replace(re, '.');
  // «…традиционным (аграрным)?.» → «…?»: указание стояло после вопроса.
  return out.replace(/\?\.$/, '?');
}

/** «1. a; 2) b; …; 6) f.» → ['a', 'b', …, 'f'] */
function parseInlineList(line) {
  const body = line.replace(/^1\.\s+/, '1) ');
  const parts = body.split(/;\s+(?=\d\)\s)/);
  return parts.map((p, i) => {
    const m = p.match(/^(\d)\)\s+(.+)$/);
    if (!m || Number(m[1]) !== i + 1) fail('перечень позиций: «' + p + '»');
    return clean(m[2].replace(/[.;]$/, ''));
  });
}

function parseCondition(n, body) {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const first = clean(lines[0]);
  const rest = lines.slice(1);
  const answerLine = (l) => /^Ответ:/.test(l);

  if (n <= 6) {
    const listLine = rest.find((l) => /^1\.\s/.test(l));
    const instr = rest.find((l) => /^Найдите две/.test(l));
    if (!listLine || !instr) fail('№ ' + n + ': нет перечня или указания');
    return {
      question: first,
      instruction: clean(instr).replace(/, и запишите цифры, под которыми они указаны\.$/, '.'),
      statements: parseInlineList(listLine)
    };
  }
  if ((n >= 7 && n <= 14) || n === 25) {
    const rows = parseTable(body);
    const header = rows[0];
    const items = [];
    const options = [];
    rows.slice(1, 6).forEach((r, i) => {
      const m = r[0].match(/^([А-Д])\)\s+(.+)$/);
      if (!m || m[1] !== LETTERS[i]) fail('№ ' + n + ': позиция ' + LETTERS[i]);
      items.push(clean(m[2]));
      if (r[1]) {
        const o = r[1].match(/^(\d)\)\s+(.+)$/);
        if (!o || Number(o[1]) !== options.length + 1) fail('№ ' + n + ': вариант второго столбца «' + r[1] + '»');
        options.push(clean(o[2]));
      }
    });
    const sentence = (s) => s.charAt(0) + s.slice(1).toLowerCase();
    return { question: first, columns: header.slice(0, 2).map(sentence), items: items, options: options };
  }
  // MULTI и COND: нумерованный список строками.
  const statements = [];
  rest.forEach((l) => {
    if (answerLine(l)) return;
    const m = l.match(/^(\d)\.\s+(.+)$/);
    if (m) {
      if (Number(m[1]) !== statements.length + 1) fail('№ ' + n + ': номер суждения ' + m[1]);
      statements.push(clean(m[2]));
    }
  });
  return { question: stripBlank(first), statements: statements };
}

/* ---------- Раздел IV: ключи и объяснения ---------- */

function parseCommentary(n, head, body) {
  const key = (head.match(/ответ:\s+\*\*(\d+)\*\*/) || [])[1];
  if (!key) fail('№ ' + n + ': нет ответа в заголовке');
  const lines = body.split('\n');
  const entries = [];
  const meta = {};
  let note = null;
  let after = [];
  let inExplanation = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const intro = line.match(/^\*\*Объяснение:\*\*\s*(.*)$/);
    if (intro) {
      inExplanation = true;
      if (intro[1]) note = clean(intro[1]);
      continue;
    }
    const metaLine = clean(line);
    if (/^Проверяемое знание:/.test(metaLine)) {
      inExplanation = false;
      meta.checks = metaLine.replace(/^Проверяемое знание:\s*/, '');
      continue;
    }
    if (/^Типичная ошибка:/.test(metaLine)) { meta.typicalMistake = metaLine.replace(/^Типичная ошибка:\s*/, ''); continue; }
    if (/^Познавательное действие:/.test(metaLine)) {
      const m = metaLine.match(/^Познавательное действие:\s*(.+?)\.\s*Уровень:\s*(.+?)\.$/);
      if (!m) fail('№ ' + n + ': строка действия и уровня');
      meta.actionText = m[1];
      meta.levelText = m[2];
      continue;
    }
    if (/^Источник:/.test(metaLine)) { meta.basis = metaLine.replace(/^Источник:\s*/, ''); continue; }
    if (!inExplanation) continue;
    // Остатки нумерации Markdown («-», «1)», «1.» без текста) пропускаются.
    if (/^(-|\d[.)])$/.test(line)) continue;
    const letter = line.match(/^- ([А-Д])\)\s+(.+)$/);
    if (letter) { entries.push({ label: letter[1], text: clean(letter[2]) }); continue; }
    const num = line.match(/^(\d)[.)]\s+(.+)$/);
    if (num) { entries.push({ label: Number(num[1]), text: clean(num[2]) }); continue; }
    const bullet = line.match(/^- (.+)$/);
    if (bullet && entries.length) {
      const last = entries[entries.length - 1];
      last.bullets = (last.bullets || []).concat(clean(bullet[1]));
      continue;
    }
    // Строка после перечня позиций — пояснение ко всему заданию (№ 21).
    after.push(clean(line));
  }
  if (after.length) note = (note ? note + ' ' : '') + after.join(' ');
  entries.forEach((e) => {
    e.explanation = e.bullets ? e.text + '\n' + e.bullets.map((b) => '— ' + b).join('\n') : e.text;
  });
  return { key: key, entries: entries, note: note, meta: meta };
}

/* ---------- Раздел V ---------- */

function parsePassport(text) {
  const rows = parseTable(sliceBetween(text, '#### V.1. Паспорт заданий', '#### V.2.'));
  const head = rows[0];
  const col = (name) => {
    const i = head.indexOf(name);
    if (i === -1) fail('V.1: нет столбца ' + name);
    return i;
  };
  const out = {};
  rows.slice(1).forEach((r) => {
    const n = Number(r[col('№')]);
    out[n] = {
      format: r[col('Формат')],
      key: r[col('Ключ')],
      positions: r[col('Позиций')],
      types: r[col('Типы')].split('/').map((t) => SOCIETIES[t] || fail('V.1 № ' + n + ': тип ' + t)),
      criteria: r[col('Критерии')].split(/,\s*/).map((c) => CRITERIA[c] || fail('V.1 № ' + n + ': критерий ' + c)),
      level: LEVELS[r[col('Уровень')]] || fail('V.1 № ' + n + ': уровень'),
      actions: r[col('Действие')].split(/,\s*/).map((a) => ACTIONS[a] || fail('V.1 № ' + n + ': действие ' + a))
    };
  });
  return out;
}

/** «2 — И, ПТ; 4 — Т, ПТ/СП; 3 — ПТ + ПС; 6 — П, СП (стандартизация и индивидуализация)» */
function parseTraps(cell, n) {
  if (cell === '—') return {};
  const out = {};
  cell.split(/;\s*/).forEach((part) => {
    const m = part.match(/^(\d)\s+—\s+(.+)$/);
    if (!m) fail('V.2 № ' + n + ': «' + part + '»');
    let rest = m[2];
    let comment = null;
    const c = rest.match(/\s*\(([^)]+)\)\s*$/);
    if (c) { comment = c[1]; rest = rest.slice(0, c.index); }
    const tokens = rest.split(/,\s*/);
    const trap = { tags: [], combine: 'or', actual: [] };
    tokens.forEach((tok) => {
      if (/^[ТИП](\/[ТИП])*$/.test(tok)) {
        trap.actual = tok.split('/').map((t) => SOCIETIES[t]);
      } else {
        const both = tok.split(/\s*\+\s*/);
        const tags = both.length > 1 ? both : tok.split('/');
        if (both.length > 1) trap.combine = 'and';
        tags.forEach((t) => { if (!TRAP_TAGS.includes(t)) fail('V.2 № ' + n + ': тег ' + t); });
        trap.tags = tags;
      }
    });
    if (comment) trap.comment = comment;
    out[Number(m[1])] = trap;
  });
  return out;
}

function parseMarkup(text) {
  const rows = parseTable(sliceBetween(text, '#### V.2. Поэлементная разметка позиций', '#### V.3.'));
  const out = {};
  rows.slice(1).forEach((r) => {
    const n = Number(r[0]);
    out[n] = { fitting: r[1], traps: parseTraps(r[2], n) };
  });
  return out;
}

/** V.3: «16.5, 20.2» → [[16, 5], [20, 2]]; «11В» → [[11, 'В']]. */
function parseExtras(text) {
  const rows = parseTable(sliceBetween(text, '#### V.3. Положения сверх таблицы', '#### V.4.'));
  const out = [];
  rows.slice(1).forEach((r) => {
    r[0].split(/,\s*/).forEach((ref) => {
      const m = ref.match(/^(\d+)(?:\.(\d)|([А-Д]))$/);
      if (!m) fail('V.3: ссылка «' + ref + '»');
      out.push({ n: Number(m[1]), pos: m[2] ? Number(m[2]) : m[3], text: clean(r[1]) });
    });
  });
  return out;
}

/* ---------- Сборка ---------- */

function verdictOk(format, explanation, isKey) {
  if (format === 'EXCL') return isKey ? /^Выпадает\./.test(explanation) : /^Верно\./.test(explanation);
  if (format === 'MULTI') return isKey ? /^Верно\./.test(explanation) : /^Неверно[.: ]/.test(explanation);
  if (format === 'COND') return isKey ? /^Подходит\./.test(explanation) : /^Не подходит\./.test(explanation);
  return false;
}

function build(md) {
  const exam = sliceBetween(md, '### Раздел III. Экзаменационный банк', '### Раздел IV.');
  const keys = sliceBetween(md, '### Раздел IV. Ключи и методические комментарии', '### Раздел V.');
  const passport = parsePassport(md);
  const markup = parseMarkup(md);
  const extras = parseExtras(md);

  const conditions = splitByNumber(exam, /^\*\*(\d+)\.\*\*\s*/gm);
  const comments = splitByNumber(keys, /^#### № (\d+) — ответ: .*$/gm);
  const numbers = Object.keys(passport).map(Number);
  if (numbers.length !== 25) fail('в паспорте ' + numbers.length + ' заданий вместо 25');

  return numbers.map((n) => {
    const pass = passport[n];
    const cond = conditions[n] || fail('нет условия № ' + n);
    const parsed = parseCondition(n, cond.body);
    const com = parseCommentary(n, comments[n] ? comments[n].head : fail('нет ключа № ' + n), comments[n].body);
    if (com.key !== pass.key) fail('№ ' + n + ': ключ IV (' + com.key + ') ≠ V.1 (' + pass.key + ')');
    if (LEVEL_WORDS[com.meta.levelText] !== pass.level) fail('№ ' + n + ': уровень IV и V.1 расходятся');
    const actionsIV = com.meta.actionText.split(/\s+и\s+/).map((a) => ACTION_WORDS[a]);
    if (actionsIV.join() !== pass.actions.join()) fail('№ ' + n + ': действие IV и V.1 расходятся');

    for (const [fn, from, to] of FIXES) {
      if (fn !== n) continue;
      const entry = com.entries.find((e) => e.explanation.includes(from));
      if (!entry) fail('исправление № ' + n + ': нет фразы «' + from + '»');
      entry.explanation = entry.explanation.replace(from, to);
    }

    const format = pass.format;
    const task = {
      id: 'OBS-TYP-' + String(n).padStart(3, '0'),
      bankNumber: n,
      bankFormat: format,
      kimTask: FORMAT_KIM[format]
    };
    if (FORMAT_TYPE[format] !== 'multiple') task.type = FORMAT_TYPE[format];
    if (format === 'COND') task.choiceOf = 'items';
    task.question = parsed.question;
    if (parsed.instruction) task.instruction = parsed.instruction;
    task.source = { kind: 'author', ref: 'Банк «Типы обществ», № ' + n, adapted: true };
    task.difficulty = pass.level;
    task.cognitiveActions = pass.actions;
    task.criteria = pass.criteria;
    task.societyTypes = pass.types;
    task.checks = com.meta.checks;
    task.typicalMistake = com.meta.typicalMistake;
    task.basis = com.meta.basis;
    if (com.note) task.explanationNote = com.note;

    const extraFor = (pos) => {
      const found = extras.filter((x) => x.n === n && x.pos === pos);
      return found.length ? found.map((x) => x.text).join(' ') : null;
    };

    if (format === 'MATCH') {
      if (parsed.items.length !== 5) fail('№ ' + n + ': позиций ' + parsed.items.length);
      if (pass.positions !== '5→' + parsed.options.length) fail('№ ' + n + ': число вариантов не совпадает с V.1');
      if (com.entries.length !== 5) fail('№ ' + n + ': объяснений ' + com.entries.length);
      task.columns = parsed.columns;
      task.items = parsed.items.map((text, i) => {
        const e = com.entries[i];
        if (e.label !== LETTERS[i]) fail('№ ' + n + ': объяснение позиции ' + LETTERS[i]);
        const match = Number(pass.key[i]);
        const said = (e.explanation.match(/\((\d)\)/) || [])[1];
        if (Number(said) !== match) fail('№ ' + n + LETTERS[i] + ': объяснение (' + said + ') ≠ ключ (' + match + ')');
        const item = { text: text, match: match, explanation: e.explanation };
        const extra = extraFor(LETTERS[i]);
        if (extra) item.extra = extra;
        return item;
      });
      task.options = parsed.options;
      const fitting = markup[n] && markup[n].fitting;
      if (fitting && fitting !== LETTERS.map((l, i) => l + pass.key[i]).join(', ')) fail('№ ' + n + ': V.2 расходится с ключом');
      return task;
    }

    const keySet = pass.key.split('').map(Number);
    if (parsed.statements.length !== Number(pass.positions)) fail('№ ' + n + ': позиций ' + parsed.statements.length);
    if (com.entries.length !== parsed.statements.length) fail('№ ' + n + ': объяснений ' + com.entries.length);
    const traps = markup[n] ? markup[n].traps : {};
    if (markup[n]) {
      const fit = markup[n].fitting.replace(/\s*\(.+\)$/, '').split(/,\s*/).map(Number);
      const expectFit = parsed.statements.map((s, i) => i + 1).filter((i) => format === 'EXCL' ? !keySet.includes(i) : keySet.includes(i));
      if (fit.join() !== expectFit.join()) fail('№ ' + n + ': V.2 «соответствующие условию» расходятся с ключом');
      const trapNums = Object.keys(traps).map(Number).sort();
      const expectTrap = parsed.statements.map((s, i) => i + 1).filter((i) => format === 'EXCL' ? keySet.includes(i) : !keySet.includes(i));
      if (trapNums.join() !== expectTrap.join()) fail('№ ' + n + ': V.2 «неверные позиции» расходятся с ключом');
    } else {
      fail('№ ' + n + ': нет строки V.2');
    }
    task.statements = parsed.statements.map((text, i) => {
      const e = com.entries[i];
      if (e.label !== i + 1) fail('№ ' + n + ': объяснение позиции ' + (i + 1));
      const correct = keySet.includes(i + 1);
      if (!verdictOk(format, e.explanation, correct)) fail('№ ' + n + '.' + (i + 1) + ': вердикт объяснения расходится с ключом');
      const st = { text: text, correct: correct, explanation: e.explanation };
      if (traps[i + 1]) st.trap = traps[i + 1];
      const extra = extraFor(i + 1);
      if (extra) st.extra = extra;
      return st;
    });
    return task;
  });
}

/* ---------- Запись файла ---------- */

function literal(value, indent) {
  const pad = '  '.repeat(indent);
  const inner = '  '.repeat(indent + 1);
  if (typeof value === 'string') return "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v !== 'object')) return '[' + value.map((v) => literal(v, 0)).join(', ') + ']';
    return '[\n' + value.map((v) => inner + literal(v, indent + 1)).join(',\n') + '\n' + pad + ']';
  }
  const keys = Object.keys(value);
  return '{\n' + keys.map((k) => inner + k + ': ' + literal(value[k], indent + 1)).join(',\n') + '\n' + pad + '}';
}

const HEADER = `/*
 * Раздел «Человек и общество», тема «Типы обществ» (OBS-TYP): традиционное,
 * индустриальное и постиндустриальное общество — 25 заданий практикума.
 *
 * ФАЙЛ СГЕНЕРИРОВАН: node scripts/build-society-types.js <банк.md>. Не правьте вручную —
 * меняйте утверждённый банк преподавателя и запускайте скрипт заново.
 *
 * Источник — окончательная редакция банка «Типы обществ: традиционное, индустриальное,
 * постиндустриальное» (документ хранится вне репозитория). Номер задания в банке —
 * bankNumber и номер в ID (OBS-TYP-001 — № 1). Формулировки, ключи и объяснения — как
 * в банке; из условий убраны только бланковые указания («запишите цифры…»).
 * Единственное содержательное изменение — утверждённая правка объяснения № 20.
 *
 * Поля сверх схемы 2 (см. README, «Типы обществ»):
 *   bankFormat       — формат банка: EXCL, MATCH, MULTI, COND;
 *   cognitiveActions — recognition (узнавание), understanding (понимание), distinction (различение);
 *   criteria         — критерии сравнения обществ: nature, factor, economy, social, politics, spiritual;
 *   societyTypes     — проверяемые типы обществ: traditional, industrial, postindustrial;
 *   checks, typicalMistake, basis, explanationNote — проверяемое знание, типичная ошибка,
 *                      опора в таблице, пояснение ко всему заданию;
 *   trap             — у неверной позиции: теги ошибки (ПТ, СП, ПС, ЧО, ФП) и тип общества,
 *                      к которому признак относится на самом деле (разметка V.2 банка);
 *   extra            — положение сверх таблицы (раздел V.3): показывается с пометкой «дополнительно».
 * difficulty: 1 — базовый, 2 — средний, 3 — повышенный уровень.
 * kimTask — позиция КИМ ЕГЭ: EXCL — 1, MULTI — 2, MATCH — 3, COND — 4 (оценивание — js/scoring.js).
 */
`;

function main() {
  const src = process.argv[2];
  if (!src) {
    console.error('Использование: node scripts/build-society-types.js путь/к/банку.md');
    process.exit(2);
  }
  const tasks = build(fs.readFileSync(src, 'utf8'));
  const body = HEADER + "EGE.addTasks('OBS-TYP', " + literal(tasks, 0) + ');\n';
  fs.writeFileSync(OUT, body);
  console.log('Записано заданий: ' + tasks.length + ' → ' + path.relative(process.cwd(), OUT));
}

if (require.main === module) main();
module.exports = { build };
