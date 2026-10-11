/**
 * Олимпиады, интерфейс: краткий самостоятельный ответ (тип short-answer).
 *
 * Решение: пустые поля ввода; под полем — как программа поняла запись
 * («Распознано: ч. 1 ст. 20 УК РФ»), чтобы ученик видел нормализацию до проверки.
 * Подсказка распознавания ничего не говорит о правильности ответа.
 * Разбор: введённый ответ, распознанный вид, правильный ответ, краткая причина ошибки
 * и раскрывающееся объяснение.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var ui = OLY.ui;
  var R = OLY.nrmRows;
  var S = OLY.shortAnswer;
  var N = ui.nrm;
  var el = N.el;

  var PLACEHOLDER = {
    article: 'например: ст. 10 ч. 2 ГК',
    number: 'число цифрами или словами',
    term: 'термин'
  };

  function itemShort(task, item) {
    return item.short || ('Ответ ' + (task.items.indexOf(item) + 1));
  }

  /** Как программа поняла запись — без оценки правильности. */
  function recognized(item, text) {
    var raw = String(text || '').trim();
    if (!raw) return '';
    if (item.kind === 'article') {
      var a = S.parseArticle(raw);
      return a ? 'Распознано: ' + S.articleText(a) + (a.code ? '' : ' (кодекс не указан)') : 'Не распознано: укажите номер статьи цифрами';
    }
    if (item.kind === 'number') {
      var n = S.parseNumber(raw);
      return n === null ? 'Не распознано: введите целое число цифрами или словами' : 'Распознано: ' + n;
    }
    return '';
  }

  function copy(task, response) {
    var r = {};
    task.items.forEach(function (item) {
      var v = response && response[item.id];
      r[item.id] = typeof v === 'string' ? v : '';
    });
    return r;
  }

  /* ---------- Решение ---------- */

  /** Поле краткого ответа с подсказкой распознавания (используется и в составных заданиях). */
  function itemEditor(task, item, answers, onChanged) {
    var card = el('div', 'nrm-row');
    card.id = N.anchorId(task, item.id);
    var label = el('label', 'nrm-row__label', item.label);
    var inputId = 'nrm-in-' + task.id + '-' + item.id;
    label.setAttribute('for', inputId);
    card.appendChild(label);
    var input = el('input', 'nrm-input');
    input.type = 'text';
    input.id = inputId;
    input.autocomplete = 'off';
    input.setAttribute('autocapitalize', 'off');
    input.spellcheck = false;
    input.maxLength = 120;
    input.placeholder = PLACEHOLDER[item.kind];
    input.value = answers[item.id];
    var hintId = inputId + '-hint';
    var hint = el('p', 'nrm-input__hint');
    hint.id = hintId;
    hint.setAttribute('aria-live', 'polite');
    input.setAttribute('aria-describedby', hintId);
    input.addEventListener('input', function () {
      answers[item.id] = input.value;
      onChanged();
    });
    card.appendChild(input);
    card.appendChild(hint);
    return { card: card, input: input, hint: hint };
  }

  function render(container, task, ctx) {
    var answers = copy(task, ctx.response);
    var parts = {};

    var box = el('div', 'nrm-grid nrm-short');
    var notice = N.demoNotice(task);
    if (notice) box.appendChild(notice);
    if (task.legal) box.appendChild(N.renderLegal(task, {}).node);

    var block = el('section', 'nrm-block');
    var head = el('div', 'nrm-block__head');
    head.appendChild(el('h3', 'nrm-block__title', task.itemsTitle || 'Краткие ответы'));
    var count = el('span', 'nrm-block__count');
    head.appendChild(count);
    block.appendChild(head);
    block.appendChild(el('p', 'nrm-block__hint', 'Ответ вводится в поле. Номер статьи — с частью или без неё, кодекс можно указать сокращённо; число — цифрами или словами; регистр и буква «ё» не учитываются.'));
    var list = el('div', 'nrm-rows');
    task.items.forEach(function (item) {
      var e = itemEditor(task, item, answers, function () {
        paint();
        ctx.onChange(JSON.parse(JSON.stringify(answers)));
      });
      list.appendChild(e.card);
      parts[item.id] = e;
    });
    block.appendChild(list);
    box.appendChild(block);

    var fill = N.fillBar(task);
    fill.node.classList.add('nrm-fillbar--sticky');
    box.appendChild(fill.node);

    function paint() {
      var filled = 0;
      var firstEmpty = null;
      task.items.forEach(function (item) {
        var p = parts[item.id];
        var v = answers[item.id];
        if (p.input.value !== v) p.input.value = v;
        var done = v.trim() !== '';
        if (done) filled++;
        else if (!firstEmpty) firstEmpty = item.id;
        p.card.classList.toggle('is-filled', done);
        p.hint.textContent = recognized(item, v);
      });
      count.textContent = filled + ' из ' + task.items.length;
      count.classList.toggle('is-done', filled === task.items.length);
      fill.update(filled, task.items.length, firstEmpty);
    }

    container.textContent = '';
    container.appendChild(box);
    paint();
    return {
      set: function (next) {
        var fresh = copy(task, next);
        Object.keys(fresh).forEach(function (id) { answers[id] = fresh[id]; });
        paint();
      }
    };
  }

  /* ---------- Разбор ---------- */

  function reasonOf(item, d) {
    var w = d.wrong ? R.explanation(d.wrong.explanation) : null;
    if (w) return w;
    if (d.reason === 'unparsed') {
      return { short: item.kind === 'article' ? 'Запись не распознана как ссылка на статью: нужен номер статьи цифрами.' : 'Запись не распознана как число.', full: null };
    }
    if (d.reason === 'code') {
      return { short: 'Неверный кодекс: эта норма находится в ' + S.CODES.filter(function (c) { return c.id === item.key.code; })[0].title + '.', full: null };
    }
    if (d.reason === 'article') return { short: 'Неверный номер статьи.', full: null };
    if (d.reason === 'part') return R.explanation(item.partWrong);
    if (d.reason === 'number') return { short: 'Неверное число.', full: null };
    if (d.reason === 'term') return { short: 'Термин не совпадает ни с одной допустимой формой.', full: null };
    return null;
  }

  function itemReview(task, item, text, d) {
    var card = el('div', 'nrm-row nrm-rv');
    card.id = N.anchorId(task, item.id);
    var head = el('div', 'nrm-row__head');
    head.appendChild(el('span', 'nrm-row__label', item.label));
    if (d) head.appendChild(el('span', 'nrm-rv__pts', N.fmt(d.points) + ' из 1'));
    card.appendChild(head);
    var reason = null;
    if (d) {
      var cls = d.status === 'ok' ? 'text-right' : (d.status === 'partial' ? 'text-warn' : 'text-wrong');
      card.appendChild(N.answerLine('Ваш ответ: ', text ? '«' + text + '»' : 'нет ответа', cls, d.status));
      var rec = recognized(item, text);
      if (rec && d.status !== 'ok') card.appendChild(el('p', 'nrm-input__hint', rec));
      if (d.status !== 'ok') {
        card.appendChild(N.answerLine('Правильно: ', S.keyText(item) + (item.kind === 'term' && item.key.length > 1 ? ' (принимаются также: ' + item.key.slice(1).join(', ') + ')' : ''), 'text-right'));
        if (d.status !== 'empty') {
          reason = reasonOf(item, d);
          if (reason) card.appendChild(el('p', 'nrm-rv__mistake', reason.short));
        }
      }
      card.classList.add('nrm-rv--' + (d.status === 'ok' ? 'ok' : (d.points > 0 ? 'partial' : 'wrong')));
    } else {
      card.appendChild(N.answerLine('Правильно: ', S.keyText(item), 'text-right'));
    }
    var box = N.more(d && d.status !== 'ok' ? 'Подробное объяснение' : 'Пояснение', [reason && reason.full, item.explanation], false);
    if (box) card.appendChild(box);
    return card;
  }

  function renderReview(container, task, ctx) {
    var result = ctx.result && ctx.result.verdict !== 'unanswered' ? ctx.result : null;
    var answers = result ? copy(task, result.response) : null;
    var details = result && result.details ? result.details.items : null;

    var box = el('div', 'nrm-grid nrm-short is-review');
    var notice = N.demoNotice(task);
    if (notice) box.appendChild(notice);
    if (task.legal) box.appendChild(N.renderLegal(task, {}).node);
    var block = el('section', 'nrm-block');
    var head = el('div', 'nrm-block__head');
    head.appendChild(el('h3', 'nrm-block__title', task.itemsTitle || 'Краткие ответы'));
    if (details) {
      var earned = 0;
      task.items.forEach(function (item) { earned += details[item.id].points; });
      head.appendChild(el('span', 'nrm-block__count' + (earned >= task.items.length ? ' is-done' : ''), N.fmt(earned) + ' из ' + task.items.length));
    }
    block.appendChild(head);
    var list = el('div', 'nrm-rows');
    task.items.forEach(function (item) {
      list.appendChild(itemReview(task, item, answers && answers[item.id], details && details[item.id]));
    });
    block.appendChild(list);
    box.appendChild(block);
    container.textContent = '';
    container.appendChild(box);
  }

  function feedbackSummary(container, task, result) {
    var d = result.details;
    var mistakes = [];
    if (d) {
      task.items.forEach(function (item) {
        if (d.items[item.id].status !== 'ok') mistakes.push({ id: item.id, label: itemShort(task, item) });
      });
    }
    N.summary(container, task, result, mistakes);
  }

  ui.nrmShort = { itemEditor: itemEditor, itemReview: itemReview, recognized: recognized, HINT: 'Ответ вводится в поле. Номер статьи — с частью или без неё, кодекс можно указать сокращённо; число — цифрами или словами; регистр и буква «ё» не учитываются.' };

  ui.views.register('short-answer', {
    hint: function () { return 'Введите краткие ответы в поля: номер статьи, число или термин.'; },
    render: render,
    renderReview: renderReview,
    feedbackSummary: feedbackSummary
  });
})(typeof window !== 'undefined' ? window : globalThis);
