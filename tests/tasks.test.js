'use strict';

/**
 * Проверка банка заданий: загружает файлы так же, как браузер
 * (в порядке <script> из index.html), и валидирует каждое задание.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const dataScripts = scripts.filter((s) => s.startsWith('data/tasks/'));

function loadBank() {
  const context = vm.createContext({});
  context.globalThis = context;
  for (const src of ['js/registry.js', 'js/scoring.js', ...dataScripts]) {
    vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), context, { filename: src });
  }
  return context.EGE;
}

test('все файлы из data/tasks подключены в index.html', () => {
  const files = fs.readdirSync(path.join(root, 'data/tasks')).filter((f) => f.endsWith('.js'));
  for (const f of files) {
    assert.ok(dataScripts.includes('data/tasks/' + f), `Файл data/tasks/${f} не подключён в index.html`);
  }
  for (const s of scripts) {
    assert.ok(fs.existsSync(path.join(root, s)), `Скрипт ${s} из index.html не найден`);
  }
});

test('банк заданий корректен', () => {
  const EGE = loadBank();
  assert.ok(EGE.tasks.length > 0, 'Нет ни одного задания');

  for (const task of EGE.tasks) {
    const where = `Задание ${task.id}`;
    assert.ok(EGE.getTopic(task.topic), `${where}: неизвестная тема`);
    assert.equal(typeof task.question, 'string', `${where}: нет вопроса`);
    assert.ok(task.question.trim().length > 0, `${where}: пустой вопрос`);
    assert.ok(Array.isArray(task.statements), `${where}: нет суждений`);
    assert.ok(task.statements.length >= 3 && task.statements.length <= 9,
      `${where}: суждений должно быть от 3 до 9 (для выбора цифрами на клавиатуре)`);

    task.statements.forEach((s, i) => {
      const w = `${where}, суждение ${i + 1}`;
      assert.equal(typeof s.correct, 'boolean', `${w}: поле correct должно быть true/false`);
      assert.ok(typeof s.text === 'string' && s.text.trim(), `${w}: пустой текст`);
      assert.ok(typeof s.explanation === 'string' && s.explanation.trim(), `${w}: нет объяснения`);
    });

    const correct = EGE.scoring.getCorrectNumbers(task);
    assert.ok(correct.length >= 1, `${where}: нет верных суждений`);
    assert.ok(correct.length < task.statements.length, `${where}: все суждения верные`);
  }
});

test('в каждой теме есть задания', () => {
  const EGE = loadBank();
  for (const topic of EGE.topics) {
    assert.ok(EGE.getTasksByTopic(topic.id).length > 0, `Тема «${topic.title}» пуста`);
  }
  assert.equal(EGE.getTasksByTopic('all').length, EGE.tasks.length);
});

test('повторяющийся id и неизвестная тема отклоняются', () => {
  const EGE = loadBank();
  const sample = { id: EGE.tasks[0].id, question: 'q', statements: [] };
  assert.throws(() => EGE.addTasks('economy', [sample]), /Повторяющийся id/);
  assert.throws(() => EGE.addTasks('history', [{ id: 'x' }]), /Неизвестная тема/);
});
