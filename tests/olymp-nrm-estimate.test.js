'use strict';

/** Оценка времени выполнения (scripts/estimate-time.js): работает для всех демо-заданий практикума. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBank } = require('./helpers/olymp.js');
const { estimate } = require('../scripts/estimate-time.js');

test('estimate-time: оценка есть для каждого демо-задания и лежит в разумных пределах', () => {
  const OLY = loadBank('olympiad-demo.html');
  const demo = OLY.tasks.filter((t) => t.olympiad === 'DEMO');
  assert.ok(demo.length >= 10);
  for (const task of demo) {
    const e = estimate(task);
    assert.ok(e, task.id + ': нет оценки для типа ' + task.type);
    assert.ok(e.total >= 1 && e.total <= 30, task.id + ': ' + e.total);
  }
});
