'use strict';

/** Учебник: модель прогресса. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore, testCatalog, demoChapter } = require('./helpers/textbook.js');

function setup() {
  const TXT = loadCore();
  testCatalog(TXT);
  const ch = demoChapter();
  TXT.defineChapter(ch);
  return { TXT, P: TXT.progress, ch, state: TXT.progress.create() };
}

const T = '2026-09-25T10:00:00.000Z';

test('ответ засчитывается один раз; сброс позволяет ответить заново', () => {
  const { P, state } = setup();
  assert.equal(P.getAnswer(state, 'demo', 'act/guess'), null);
  assert.equal(P.setAnswer(state, 'demo', 'act/guess', 1, null, T), true);
  assert.equal(P.setAnswer(state, 'demo', 'act/guess', 0, null, T), false);
  assert.deepEqual(P.getAnswer(state, 'demo', 'act/guess'), { value: 1, correct: null, at: T });
  P.clearAnswers(state, 'demo', ['act/guess']);
  assert.equal(P.getAnswer(state, 'demo', 'act/guess'), null);
});

test('статус раздела: текст — по «Дальше», задания — по ответам', () => {
  const { P, state, ch } = setup();
  const [read, act] = ch.sections;
  assert.equal(P.sectionStatus(state, ch, read), 'new');
  P.visit(state, 'demo', 'read');
  assert.equal(P.sectionStatus(state, ch, read), 'started');
  P.finish(state, 'demo', 'read');
  assert.equal(P.sectionStatus(state, ch, read), 'done');

  P.setAnswer(state, 'demo', 'act/guess', 0, null, T);
  assert.equal(P.sectionStatus(state, ch, act), 'started');
  assert.equal(P.pendingCount(state, ch, act), 2);
  P.finish(state, 'demo', 'act');   // «Дальше» без ответов раздел не засчитывает
  assert.equal(P.sectionStatus(state, ch, act), 'started');
  P.setAnswer(state, 'demo', 'act/sort/one', 0, true, T);
  P.setAnswer(state, 'demo', 'act/sort/two', 0, false, T);   // ошибка — всё равно ответ
  assert.equal(P.sectionStatus(state, ch, act), 'done');
  assert.equal(P.pendingCount(state, ch, act), 0);
});

test('прогресс главы: олимпиадный раздел и итоги считаются отдельно', () => {
  const { P, state, ch } = setup();
  let sum = P.chapterSummary(state, ch);
  assert.deepEqual([sum.done, sum.total, sum.percent, sum.started, sum.next], [0, 3, 0, false, 'read']);
  assert.deepEqual(sum.olympiad, { done: 0, total: 1, percent: 0 });

  P.visit(state, 'demo', 'read');
  P.finish(state, 'demo', 'read');
  sum = P.chapterSummary(state, ch);
  assert.deepEqual([sum.done, sum.percent, sum.started, sum.next], [1, 33, true, 'act']);

  P.visit(state, 'demo', 'deep');
  P.open(state, 'demo', 'deep/hmm', 'answer');
  P.finish(state, 'demo', 'deep');
  sum = P.chapterSummary(state, ch);
  assert.equal(sum.done, 1, 'олимпиадный раздел не входит в основной процент');
  assert.deepEqual(sum.olympiad, { done: 1, total: 1, percent: 100 });
  assert.equal(sum.next, 'act');
});

test('«Продолжить» ведёт в последний незавершённый раздел', () => {
  const { P, state, ch } = setup();
  P.visit(state, 'demo', 'final');
  assert.equal(P.chapterSummary(state, ch).next, 'final');
  P.visit(state, 'demo', 'result');   // итоги не учитываются — ищем первый неизученный
  assert.equal(P.chapterSummary(state, ch).next, 'read');
});

test('итоги: освоено, ошибки, что повторить', () => {
  const { P, state, ch } = setup();
  let rep = P.report(state, ch);
  assert.deepEqual(rep.final, { sectionId: 'final', total: 3, answered: 0, correct: 0, complete: false });
  assert.deepEqual(rep.mastered, []);
  assert.deepEqual(rep.unfinished, ['read', 'act', 'deep', 'final']);

  P.setAnswer(state, 'demo', 'final/q/a', [0], true, T);
  P.setAnswer(state, 'demo', 'final/q/b', [0], false, T);
  rep = P.report(state, ch);
  assert.deepEqual(rep.mastered, ['read']);
  assert.deepEqual(rep.review, ['act']);
  assert.deepEqual(rep.mistakes, [{ questionId: 'b', text: 'Вопрос 2', ref: 'act' }]);
  assert.equal(rep.final.complete, false);

  P.setAnswer(state, 'demo', 'final/q/c', [0], true, T);
  rep = P.report(state, ch);
  assert.deepEqual(rep.final, { sectionId: 'final', total: 3, answered: 3, correct: 2, complete: true });
  assert.deepEqual(rep.mastered, ['read', 'deep']);
  assert.ok(!rep.unfinished.includes('final'));
});

test('раскрытые элементы схем и карточек запоминаются', () => {
  const { P, state } = setup();
  assert.equal(P.open(state, 'demo', 'act/flow', 'subject'), true);
  assert.equal(P.open(state, 'demo', 'act/flow', 'subject'), false);
  P.open(state, 'demo', 'act/flow', 'object');
  assert.equal(P.isOpened(state, 'demo', 'act/flow', 'object'), true);
  assert.equal(P.isOpened(state, 'demo', 'act/flow', 'result'), false);
  assert.equal(P.openedCount(state, 'demo', 'act/flow'), 2);
});

test('сохранение: JSON туда и обратно, мусор отбрасывается, сброс главы', () => {
  const { P, state } = setup();
  P.setAnswer(state, 'demo', 'act/guess', 1, null, T);
  P.visit(state, 'demo', 'act');
  P.open(state, 'demo', 'act/flow', 'x');
  const copy = P.normalize(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(copy, state);

  assert.deepEqual(P.normalize(null), P.create());
  assert.deepEqual(P.normalize({ schemaVersion: 99, chapters: {} }), P.create());
  const dirty = P.normalize({
    schemaVersion: 1,
    chapters: { demo: { answers: { a: { value: 1, correct: 'yes' }, b: 'x' }, opened: { f: [1, 'ok'] }, visited: { s: 1, t: true }, last: 5 } }
  });
  assert.deepEqual(dirty.chapters.demo, { answers: {}, opened: { f: ['ok'] }, finished: {}, visited: { t: true }, last: null });

  P.reset(state, 'demo');
  assert.equal(P.getAnswer(state, 'demo', 'act/guess'), null);
});

test('хранилище без localStorage не падает', () => {
  const { TXT } = setup();
  assert.deepEqual(TXT.progressStorage.load(), TXT.progress.create());
  assert.doesNotThrow(() => TXT.progressStorage.save(TXT.progress.create()));
});
