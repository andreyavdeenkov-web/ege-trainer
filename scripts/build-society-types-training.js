#!/usr/bin/env node
'use strict';

/**
 * Подготовка данных тренировочных практикумов темы «Типы обществ» (OBS-TYP-P01, OBS-TYP-P02)
 * из утверждённых документов преподавателя «Типы обществ тест 1.docx» и «…тест 2.docx».
 *
 *   pandoc -t markdown --wrap=none "Типы обществ тест 1.docx" -o test1.md
 *   pandoc -t markdown --wrap=none "Типы обществ тест 2.docx" -o test2.md
 *   node scripts/build-society-types-training.js test1.md test2.md
 *
 * Результат — data/tasks/society/society-types-training.js: OBS-TYP-026…040 (тест 1, № 1–15)
 * и OBS-TYP-041…055 (тест 2, № 1–15). Документы хранятся вне репозитория (сайт публикуется
 * целиком); разбор выполняется только здесь, в браузере работает готовый файл.
 *
 * Скрипт останавливается, если в документе расходятся ключ из таблицы, ключ в заголовке
 * пояснения и вердикты пояснений («верно»/«неверно», «относится»/«не относится», «тип 2»),
 * если не хватает вариантов или пояснений.
 *
 * Изменения относительно документов — только оформление под интерфейс платформы:
 *  - из условий убраны бланковые указания («…и запишите цифры…», «Запишите цифры…»,
 *    «Запишите в таблицу выбранные цифры…», строки «Ответ:»), source.adapted: true;
 *  - в заданиях на исключение вердикт пояснения записан как «Выпадает из общего ряда» /
 *    «Не выпадает из общего ряда» (тест 1, № 1: общее пояснение разнесено по позициям,
 *    слова пояснения сохранены; тест 2, № 1: «относится» / «не относится»);
 *  - в остальных пояснениях первая буква вердикта прописная («Верно:», «Неверно.»), номер
 *    позиции и буква А–Д перед пояснением убраны — их показывает интерфейс;
 *  - заголовки столбцов соответствия набраны строчными с прописной первой буквой; заголовки
 *    первого столбца исправлены по решению преподавателя от 14.11.2026 (COLUMN_FIXES);
 *  - снята разметка Markdown.
 */
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, '..', 'data', 'tasks', 'society', 'society-types-training.js');

/**
 * Правки, утверждённые преподавателем 14.11.2026 (решения 1 и 2): заголовок первого столбца
 * соответствия. Ключ — «тест.задание», значение — [заголовок в документе, утверждённый заголовок].
 */
const COMMON_FEATURES = {
  // Общий признак ряда — формулировки утверждены преподавателем 14.11.2026 (решение 7).
  '1.1': 'Преобладание промышленного производства, рост доли городского населения, широкое использование машинного труда и формирование класса наёмных рабочих — признаки индустриального общества.',
  '2.1': 'Возрастание роли знаний и информации, наукоёмкие технологии, преобладание сферы услуг в занятости и непрерывное образование — признаки постиндустриального общества.'
};

const COLUMN_FIXES = {
  '1.13': ['Характеристиками', 'Характеристики'],
  '1.14': ['Признаками', 'Признаки'],
  '1.15': ['Примерами', 'Примеры'],
  '2.13': ['Признаки / явления', 'Признаки'],
  '2.14': ['Признаки / явления', 'Явления'],
  '2.15': ['Признаки / явления', 'Характеристики']
};
const LETTERS = ['А', 'Б', 'В', 'Г', 'Д'];

function fail(msg) {
  throw new Error('Тренировочные практикумы «Типы обществ»: ' + msg);
}

function clean(text) {
  return text
    .replace(/\\([()_\-*])/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/ --- /g, ' — ')
    .replace(/---/g, '—')
    .replace(/\s+/g, ' ')
    .trim();
}

function upperFirst(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function section(md, start, end) {
  const a = md.indexOf(start);
  if (a === -1) fail('нет раздела «' + start + '»');
  const b = end ? md.indexOf(end, a) : md.length;
  if (b === -1) fail('нет раздела «' + end + '»');
  return md.slice(a, b);
}

function splitTasks(text) {
  const out = {};
  const parts = [...text.matchAll(/^## Задание (\d+)(.*)$/gm)];
  parts.forEach((m, i) => {
    const end = i + 1 < parts.length ? parts[i + 1].index : text.length;
    out[Number(m[1])] = { head: m[2], body: text.slice(m.index + m[0].length, end) };
  });
  return out;
}

/** Таблица ключей: строки «  1    35   …». */
function parseKeyTable(text) {
  const keys = {};
  const checks = {};
  text.split('\n').forEach((line) => {
    const m = line.match(/^\s+(\d{1,2})\s{2,}(\d{2,5})(?:\s{2,}(.+?))?\s*$/);
    if (m) {
      keys[Number(m[1])] = m[2];
      if (m[3]) checks[Number(m[1])] = clean(m[3]);
    }
  });
  return { keys, checks };
}

const BLANK = [
  [/,? и запишите цифры, под которыми они указаны\.$/, '.'],
  [/ Запишите цифры, под которыми они указаны\.$/, '']
];

function stripBlank(text) {
  let out = text;
  for (const [re, to] of BLANK) out = out.replace(re, to);
  return out;
}

function kindOf(question) {
  if (/за исключением двух/.test(question)) return 'EXCL';
  if (/^Установите соответствие/.test(question)) return 'MATCH';
  if (/^Выберите верные суждения/.test(question)) return 'MULTI';
  return 'LIST';
}

/** Условие задания из части I. */
function parseCondition(n, body) {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean)
    .filter((l) => !/^Ответ:/.test(l) && !/^А \\_/.test(l) && !/^Запишите в таблицу выбранные цифры/.test(l));
  const first = clean(lines[0]);
  const kind = kindOf(first);
  if (kind === 'MATCH') {
    const rows = lines.filter((l) => /^[А-Д]\)\s/.test(l) || /^[А-ЯЁ][А-ЯЁ /]+\s{2,}ТИПЫ ОБЩЕСТВ/.test(l));
    const header = rows.shift().split(/\s{2,}/).map((c) => upperFirst(clean(c).toLowerCase()));
    const items = [];
    const options = [];
    rows.forEach((r, i) => {
      const cells = r.split(/\s{2,}/);
      const m = cells[0].match(/^([А-Д])\)\s+(.+)$/);
      if (!m || m[1] !== LETTERS[i]) fail('тест, № ' + n + ': позиция ' + LETTERS[i]);
      items.push(clean(m[2]));
      if (cells[1]) {
        const o = cells[1].match(/^(\d)\\?\)\s+(.+)$/);
        if (!o || Number(o[1]) !== options.length + 1) fail('№ ' + n + ': вариант второго столбца «' + cells[1] + '»');
        options.push(clean(o[2]));
      }
    });
    return { kind, question: first, columns: header, items, options };
  }
  const statements = [];
  let instruction = null;
  lines.slice(1).forEach((l) => {
    const m = l.match(/^(\d)\\\)\s+(.+)$/);
    if (m) {
      if (Number(m[1]) !== statements.length + 1) fail('№ ' + n + ': номер варианта ' + m[1]);
      statements.push(clean(m[2]));
    } else if (/^Найдите две/.test(l)) {
      instruction = clean(l).replace(/, и запишите цифры, под которыми они указаны\.$/, '.');
    }
  });
  let question = stripBlank(first);
  if (kind === 'EXCL' && !instruction) {
    // Тест 2, № 1: указание в том же абзаце, что и условие.
    const m = first.match(/^(.*?\.)\s+(Найдите две .*)$/);
    if (!m) fail('№ ' + n + ': нет указания «Найдите две…»');
    question = m[1];
    instruction = m[2].replace(/, и запишите цифры, под которыми они указаны\.$/, '.');
  }
  return { kind, question, instruction, statements };
}

/** Пояснения части III: «N --- верно: …» (тест 1) или «**N) верно.** …» (тест 2). */
function parseExplanations(n, body, kind) {
  const entries = [];
  const prose = [];
  body.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
    let m = l.match(/^(\d|[А-Д])\s+---\s+(.+)$/);
    if (m) { entries.push({ label: m[1], text: clean(m[2]) }); return; }
    m = l.match(/^\*\*(\d|[А-Д])\)\s+([^*]+)\*\*\s*(.*)$/);
    if (m) { entries.push({ label: m[1], verdict: clean(m[2]), text: clean(m[3]) }); return; }
    prose.push(clean(l));
  });
  return { entries, prose };
}

const VERDICT_CHOICE = /^(верно|неверно)([.:])\s*(.*)$/;

function choiceExplanation(n, e, correct) {
  // Тест 1: «верно: …»; тест 2: вердикт «верно.» отдельно, текст после него.
  const raw = e.verdict ? e.verdict + ' ' + e.text : e.text;
  const m = raw.match(VERDICT_CHOICE);
  if (!m) fail('№ ' + n + ', позиция ' + e.label + ': нет вердикта «верно/неверно»');
  if ((m[1] === 'верно') !== correct) fail('№ ' + n + ', позиция ' + e.label + ': вердикт пояснения расходится с ключом');
  return upperFirst(m[1]) + m[2] + ' ' + m[3];
}

function build(md, docNo, firstId) {
  const tasksPart = section(md, '# Часть I.', '# Часть II.');
  const keysPart = section(md, '# Часть II.', '# Часть III.');
  const explPart = section(md, '# Часть III.', null).split('## Методические оговорки')[0];
  const conditions = splitTasks(tasksPart);
  const explanations = splitTasks(explPart);
  const { keys, checks } = parseKeyTable(keysPart);
  const numbers = Object.keys(conditions).map(Number);
  if (numbers.length !== 15) fail('тест ' + docNo + ': заданий ' + numbers.length + ' вместо 15');

  return numbers.map((n) => {
    const where = 'тест ' + docNo + ', № ' + n;
    const cond = parseCondition(n, conditions[n].body);
    const key = keys[n] || fail(where + ': нет ключа в таблице');
    const ex = explanations[n] || fail(where + ': нет пояснения');
    const headKey = (ex.head.match(/[Оо]твет (\d+)/) || [])[1];
    if (headKey !== key) fail(where + ': ключ в таблице (' + key + ') и в пояснении (' + headKey + ') расходятся');
    const { entries, prose } = parseExplanations(n, ex.body, cond.kind);
    const kim = { EXCL: 1, MULTI: 2, MATCH: 3, LIST: 4 }[cond.kind];

    const task = { id: 'OBS-TYP-' + String(firstId + n - 1).padStart(3, '0'), kimTask: kim };
    if (cond.kind === 'EXCL') task.type = 'exclude-two';
    if (cond.kind === 'MATCH') task.type = 'matching';
    if (cond.kind === 'LIST') task.choiceOf = 'items';
    task.question = cond.question;
    if (cond.instruction) task.instruction = cond.instruction;
    task.source = { kind: 'author', ref: 'Типы обществ, тест ' + docNo + ', задание ' + n, adapted: true };
    if (checks[n]) task.checks = checks[n];

    if (cond.kind === 'MATCH') {
      if (cond.items.length !== 5 || cond.options.length !== 3) fail(where + ': структура соответствия');
      if (entries.length !== 5) fail(where + ': пояснений ' + entries.length);
      task.columns = cond.columns.slice();
      const fix = COLUMN_FIXES[docNo + '.' + n];
      if (fix) {
        if (task.columns[0] !== fix[0]) fail(where + ': утверждённая правка заголовка не подходит к документу («' + task.columns[0] + '»)');
        task.columns[0] = fix[1];
      }
      task.items = cond.items.map((text, i) => {
        const e = entries[i];
        if (e.label !== LETTERS[i]) fail(where + ': пояснение позиции ' + LETTERS[i]);
        const match = Number(key[i]);
        let explanation;
        if (e.verdict) {
          // «**А) тип 1.** Традиционное: …»
          const v = e.verdict.match(/^тип (\d)\.$/);
          if (!v || Number(v[1]) !== match) fail(where + LETTERS[i] + ': пояснение расходится с ключом');
          explanation = 'Тип ' + v[1] + '. ' + e.text;
        } else {
          // «А --- 1: аграрная экономика.»
          const v = e.text.match(/^(\d):\s*(.+)$/);
          if (!v || Number(v[1]) !== match) fail(where + LETTERS[i] + ': пояснение расходится с ключом');
          explanation = v[1] + ' — ' + cond.options[match - 1] + ': ' + v[2];
        }
        return { text, match, explanation };
      });
      task.options = cond.options;
      return task;
    }

    const keySet = key.split('').map(Number);
    if (cond.statements.length < 5 || cond.statements.length > 6) fail(where + ': вариантов ' + cond.statements.length);

    if (cond.kind === 'EXCL') {
      if (keySet.length !== 2) fail(where + ': в ключе не две позиции');
      let perPosition;
      if (entries.length === cond.statements.length) {
        // Тест 2: «**1) относится.** …» / «**3) не относится.** …»
        perPosition = entries.map((e, i) => {
          if (Number(e.label) !== i + 1) fail(where + ': пояснение позиции ' + (i + 1));
          const out = /^не относится\.$/.test(e.verdict);
          if (!out && !/^относится\.$/.test(e.verdict)) fail(where + ': вердикт «' + e.verdict + '»');
          if (out !== keySet.includes(i + 1)) fail(where + ': вердикт позиции ' + (i + 1) + ' расходится с ключом');
          return (out ? 'Выпадает из общего ряда. ' : 'Не выпадает из общего ряда. ') + e.text;
        });
      } else {
        // Тест 1: «Индустриальные: 1 — промышленность; 2 — урбанизация; … Исключения: 3 — …; 5 — ….»
        const text = prose.join(' ');
        const m = text.match(/^(.+?):\s*(.+?)\.\s*Исключения:\s*(.+?)\.?$/);
        if (!m) fail(where + ': общее пояснение не разбирается');
        const parse = (list) => {
          const map = {};
          list.split(/;\s*/).forEach((p) => {
            const x = p.match(/^(\d)\s+—\s+(.+)$/);
            if (!x) fail(where + ': «' + p + '»');
            map[Number(x[1])] = x[2];
          });
          return map;
        };
        const inRow = parse(m[2]);
        const outRow = parse(m[3]);
        const outNums = Object.keys(outRow).map(Number).sort();
        if (outNums.join() !== keySet.join()) fail(where + ': исключения в пояснении расходятся с ключом');
        perPosition = cond.statements.map((s, i) => {
          // Слова общего пояснения сохраняются: «Индустриальные: … промышленность», «Исключения: … натуральное хозяйство (традиционное)».
          if (outRow[i + 1]) return 'Выпадает из общего ряда. ' + upperFirst(outRow[i + 1]) + '.';
          if (!inRow[i + 1]) fail(where + ': нет пояснения позиции ' + (i + 1));
          return 'Не выпадает из общего ряда. ' + m[1] + ': ' + inRow[i + 1] + '.';
        });
      }
      const feature = COMMON_FEATURES[docNo + '.' + n] || fail(where + ': нет утверждённого общего признака ряда');
      task.commonFeature = feature;
      task.statements = cond.statements.map((text, i) => ({
        text, correct: keySet.includes(i + 1), explanation: perPosition[i]
      }));
      return task;
    }

    if (entries.length !== cond.statements.length) fail(where + ': пояснений ' + entries.length + ', вариантов ' + cond.statements.length);
    task.statements = cond.statements.map((text, i) => {
      const e = entries[i];
      if (Number(e.label) !== i + 1) fail(where + ': пояснение позиции ' + (i + 1));
      const correct = keySet.includes(i + 1);
      return { text, correct, explanation: choiceExplanation(n, e, correct) };
    });
    return task;
  });
}

/* ---------- Запись файла ---------- */

function literal(value, indent) {
  const pad = '  '.repeat(indent);
  const inner = '  '.repeat(indent + 1);
  if (typeof value === 'string') return "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v !== 'object')) return '[' + value.map((v) => literal(v, 0)).join(', ') + ']';
    return '[\n' + value.map((v) => inner + literal(v, indent + 1)).join(',\n') + '\n' + pad + ']';
  }
  return '{\n' + Object.keys(value).map((k) => inner + k + ': ' + literal(value[k], indent + 1)).join(',\n') + '\n' + pad + '}';
}

const HEADER = `/*
 * Раздел «Человек и общество», тема «Типы обществ» (OBS-TYP): тренировочные практикумы
 * № 1 (OBS-TYP-026…040 = тест 1, задания 1–15) и № 2 (OBS-TYP-041…055 = тест 2, задания 1–15).
 *
 * ФАЙЛ СГЕНЕРИРОВАН: node scripts/build-society-types-training.js <тест1.md> <тест2.md>.
 * Не правьте вручную — меняйте документы преподавателя и запускайте скрипт заново.
 *
 * Источник — утверждённые документы «Типы обществ тест 1» и «Типы обществ тест 2»
 * (хранятся вне репозитория). Формулировки условий, вариантов, порядок вариантов и букв А–Д,
 * ключи и пояснения — как в документах; изменения оформления перечислены в скрипте.
 * kimTask — позиция КИМ ЕГЭ: 1 — два лишних (1 балл), 2 — суждения (2 балла),
 * 3 — соответствие (1 балл только за полностью верный ответ), 4 — выбор из списка или
 * по ситуации (2 балла). Общий признак ряда (commonFeature) у заданий на исключение —
 * формулировки, утверждённые преподавателем 14.11.2026; показывается после проверки задания.
 */
`;

function main() {
  const [a, b] = process.argv.slice(2);
  if (!a || !b) {
    console.error('Использование: node scripts/build-society-types-training.js тест1.md тест2.md');
    process.exit(2);
  }
  const tasks = build(fs.readFileSync(a, 'utf8'), 1, 26).concat(build(fs.readFileSync(b, 'utf8'), 2, 41));
  fs.writeFileSync(OUT, HEADER + "EGE.addTasks('OBS-TYP', " + literal(tasks, 0) + ');\n');
  console.log('Записано заданий: ' + tasks.length + ' → ' + path.relative(process.cwd(), OUT));
}

if (require.main === module) main();
module.exports = { build };
