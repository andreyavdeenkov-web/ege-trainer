#!/usr/bin/env node
'use strict';
/**
 * Комплект для официальной сверки нормативных текстов рабочего банка практикума «Норма права».
 *
 *   node scripts/legal-checklist.js           — обновить чек-лист docs/drafts/pr-law-nrm-verification-checklist.md
 *                                               и дополнить шаблон work/law-nrm/verification.json новыми положениями.
 *
 * verification.json — журнал сверки: по каждому положению (ключ «акт | структурная единица»)
 * записываются статус, редакция, адрес официального источника, дата проверки и текст из
 * официального источника. Статус «confirmed» ставится только после реальной сверки; тест
 * tests/olymp-nrm-work.test.js допускает verified: true у блока задания, только если в журнале
 * есть подтверждённая запись и текст задания совпадает с официальным текстом.
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadBank } = require('../tests/helpers/olymp.js');

const root = path.join(__dirname, '..');
const JOURNAL = path.join(root, 'work/law-nrm/verification.json');
const CHECKLIST = path.join(root, 'docs/drafts/pr-law-nrm-verification-checklist.md');

const keyOf = (b) => b.act + ' | ' + b.ref;
const textOf = (b) => b.fragments.map((f) => f.text).join('');

function collect() {
  const OLY = loadBank('olympiad-work.html');
  const map = new Map();
  for (const t of OLY.tasks.filter((x) => x.topic === 'LAW-NRM' && x.olympiad === 'PR')) {
    const blocks = t.type === 'compound' ? OLY.compound.allLegal(t) : (t.legal || []);
    for (const b of blocks) {
      const k = keyOf(b);
      if (!map.has(k)) map.set(k, { act: b.act, ref: b.ref, text: textOf(b), tasks: [] });
      map.get(k).tasks.push(t.id);
    }
  }
  return map;
}

function readJournal() {
  try { return JSON.parse(fs.readFileSync(JOURNAL, 'utf8')); } catch (e) { return { note: '', entries: {} }; }
}

if (require.main === module) {
  const items = collect();
  const journal = readJournal();
  journal.note = 'Журнал официальной сверки. status: pending | confirmed | differs. Заполняется только по официальному источнику (pravo.gov.ru или официальная публикация); дата — день проверки.';
  for (const [k, it] of items) {
    if (!journal.entries[k]) {
      journal.entries[k] = { status: 'pending', edition: '', source: '', checked: '', officialText: '', comment: '' };
    }
    journal.entries[k].tasks = it.tasks;
  }
  fs.writeFileSync(JOURNAL, JSON.stringify(journal, null, 2) + '\n');
  const lines = [
    '# Чек-лист официальной сверки нормативных текстов (рабочий банк, обязательная часть)',
    '',
    'Сгенерировано `node scripts/legal-checklist.js`. Журнал результатов — `work/law-nrm/verification.json`.',
    '',
    '**Порядок сверки по каждому положению:**',
    '1. Открыть действующую редакцию на официальном интернет-портале правовой информации (pravo.gov.ru, ИПС «Законодательство России») или в официальной публикации.',
    '2. Записать редакцию («в ред. Федерального закона от … № …» или «ред. от ДД.ММ.ГГГГ»), адрес страницы и дату проверки.',
    '3. Скопировать официальный текст нужного фрагмента в `officialText`.',
    '4. Проверить, нет ли изменений, не вступивших в силу; если есть — записать в `comment`.',
    '5. Статус: `confirmed` — текст задания совпадает с официальным; `differs` — расходится (тогда я исправляю задание и объяснения).',
    '',
    'Пометка «не подтверждено» снимается с задания только после того, как **все** его положения получили `confirmed`.',
    '',
    '| № | Акт | Структурная единица | Задания | Статус | Текст в задании (сверить дословно) |',
    '|---|---|---|---|---|---|'
  ];
  let i = 0;
  for (const [k, it] of items) {
    i++;
    const st = journal.entries[k].status;
    lines.push('| ' + i + ' | ' + it.act + ' | ' + it.ref + ' | ' + it.tasks.join(', ') + ' | ' + st + ' | ' + it.text.replace(/\|/g, '\\|') + ' |');
  }
  fs.writeFileSync(CHECKLIST, lines.join('\n') + '\n');
  console.log('Положений: ' + items.size + '; чек-лист и журнал обновлены');
}

module.exports = { collect, keyOf, textOf, JOURNAL };
