'use strict';

/**
 * Обратная совместимость: 36 заданий, которые были в банке до схемы 2,
 * не меняются — ни формулировки, ни ключи, ни объяснения, ни баллы.
 * Снимок: tests/fixtures/legacy-tasks.json.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBank, contentHash } = require('./helpers/ege.js');
const snapshot = require('./fixtures/legacy-tasks.json');

const EGE = loadBank();
const ids = Object.keys(snapshot.tasks);

test('в снимке 36 заданий, все они есть в банке', () => {
  assert.equal(ids.length, 36);
  for (const id of ids) assert.ok(EGE.getTask(id), `Задание ${id} пропало из банка`);
});

test('ключи, тип и максимальный балл старых заданий не изменились', () => {
  for (const id of ids) {
    const task = EGE.getTask(id);
    const saved = snapshot.tasks[id];
    assert.equal(EGE.scoring.getTaskType(task), saved.type, `${id}: изменился тип`);
    assert.deepEqual(Array.from(EGE.scoring.getCorrect(task)), saved.correct, `${id}: изменился ключ`);
    assert.equal(EGE.scoring.getMaxPoints(task), saved.maxPoints, `${id}: изменился максимальный балл`);
  }
});

test('формулировки и объяснения старых заданий не изменились', () => {
  for (const id of ids) {
    assert.equal(contentHash(EGE.getTask(id)), snapshot.tasks[id].hash,
      `${id}: изменилось содержимое задания (формулировка, суждения или объяснения)`);
  }
});

test('старые задания остаются в выдаче (не сняты)', () => {
  for (const id of ids) assert.ok(!EGE.getTask(id).retired, `${id}: снято с выдачи`);
});

test('полный верный ответ на каждое старое задание даёт максимум баллов', () => {
  for (const id of ids) {
    const task = EGE.getTask(id);
    const key = EGE.scoring.getCorrect(task);
    assert.equal(EGE.scoring.scoreTask(task, key), snapshot.tasks[id].maxPoints, id);
  }
});
