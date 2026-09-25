/**
 * Учебник, блоки с выбором ответа: predict (предположение), assemble (сборка
 * определения), classify (классификация ситуаций), quiz (проверка).
 * Каждый блок перерисовывает себя целиком после ответа — состояние берётся из
 * прогресса (ctx), черновик выбора живёт в замыкании.
 */
(function (root) {
  'use strict';

  var TXT = root.TXT;
  var d = TXT.ui.dom;
  var el = d.el;
  var register = TXT.ui.blocks.register;

  /**
   * Список вариантов. cfg:
   *   items       — [{ text, note?, status?, tag? }]; status: 'selected' | 'right' | 'wrong' | 'missed' | 'neutral'
   *   multi       — флажки вместо переключателей (вид отметки)
   *   locked      — ответ засчитан, выбор недоступен
   *   onPick(i)   — выбор варианта
   */
  function optionList(cfg) {
    var list = el('ul', 'tb-options' + (cfg.locked ? ' is-locked' : ''));
    cfg.items.forEach(function (item, i) {
      var li = el('li', 'tb-option' + (item.status ? ' is-' + item.status : ''));
      var btn = d.button('tb-option__btn');
      btn.setAttribute('aria-pressed', String(item.status === 'selected' || item.chosen === true));
      btn.appendChild(el('span', 'tb-option__mark' + (cfg.multi ? '' : ' tb-option__mark--radio')));
      btn.appendChild(d.rich('span', 'tb-option__text', item.text));
      if (cfg.locked) btn.disabled = true;
      else btn.addEventListener('click', function () { cfg.onPick(i); });
      li.appendChild(btn);
      if (item.tag || item.note) {
        var note = el('div', 'tb-option__note');
        if (item.tag) note.appendChild(el('span', 'tb-option__tag', item.tag));
        if (item.note) d.paras(note, item.note);
        li.appendChild(note);
      }
      list.appendChild(li);
    });
    return list;
  }

  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    var sa = a.slice().sort();
    var sb = b.slice().sort();
    return sa.every(function (x, i) { return x === sb[i]; });
  }

  function toggle(list, i) {
    var pos = list.indexOf(i);
    if (pos === -1) list.push(i);
    else list.splice(pos, 1);
  }

  function verdict(correct, rightText, wrongText) {
    var p = el('p', 'tb-verdict ' + (correct ? 'is-right' : 'is-wrong'), correct ? rightText : wrongText);
    p.setAttribute('role', 'status');
    return p;
  }

  /* ---------- predict: предположение без верного ответа ---------- */

  register('predict', function (b, ctx) {
    var node = el('div', 'tb-task tb-predict');

    function draw() {
      node.textContent = '';
      var answer = ctx.getAnswer('');
      node.appendChild(d.taskLabel('Ваша версия'));
      node.appendChild(d.rich('p', 'tb-task__prompt', b.prompt));
      if (!answer) node.appendChild(el('p', 'tb-task__hint', 'Выберите вариант, который кажется вам главным. Здесь нет неправильных ответов — после выбора вы увидите разбор каждого.'));
      node.appendChild(optionList({
        locked: !!answer,
        items: b.options.map(function (o, i) {
          var chosen = !!answer && answer.value === i;
          return {
            text: o.text,
            status: answer ? (chosen ? 'chosen' : 'neutral') : null,
            chosen: chosen,
            tag: chosen ? 'Ваш вариант' : null,
            note: answer ? o.response : null
          };
        }),
        onPick: function (i) {
          ctx.answer('', i, null);
          draw();
          d.focus(node.querySelector('.tb-option.is-chosen'));
        }
      }));
      if (answer && b.after) node.appendChild(d.paras(el('div', 'tb-after'), b.after));
    }

    draw();
    return node;
  });

  /* ---------- assemble: сборка определения из фрагментов ---------- */

  register('assemble', function (b, ctx) {
    var node = el('div', 'tb-task tb-assemble');
    var draft = [];

    function draw() {
      node.textContent = '';
      var answer = ctx.getAnswer('');
      node.appendChild(d.taskLabel('Соберите понятие'));
      node.appendChild(d.rich('p', 'tb-task__prompt', b.prompt));

      var chosen = answer ? answer.value : draft;
      node.appendChild(optionList({
        multi: true,
        locked: !!answer,
        items: b.fragments.map(function (f, i) {
          var picked = chosen.indexOf(i) !== -1;
          if (!answer) return { text: f.text, status: picked ? 'selected' : null };
          var status = picked ? (f.belongs ? 'right' : 'wrong') : (f.belongs ? 'missed' : 'neutral');
          var tags = { right: 'Входит', wrong: 'Лишнее — вы отметили', missed: 'Входит — вы пропустили', neutral: 'Не входит' };
          return { text: f.text, status: status, chosen: picked, tag: tags[status], note: f.explanation };
        }),
        onPick: function (i) { toggle(draft, i); draw(); }
      }));

      if (!answer) {
        var check = d.button('btn btn--primary tb-task__submit', 'Проверить');
        check.disabled = draft.length === 0;
        check.addEventListener('click', function () {
          var key = [];
          b.fragments.forEach(function (f, i) { if (f.belongs) key.push(i); });
          ctx.answer('', draft.slice().sort(), sameSet(draft, key));
          draw();
          d.focus(node.querySelector('.tb-verdict'));
        });
        node.appendChild(check);
        return;
      }

      node.appendChild(verdict(answer.correct, 'Определение собрано точно.', 'Есть неточности — посмотрите разбор фрагментов выше.'));
      var result = el('div', 'tb-definition tb-definition--result');
      result.appendChild(el('p', 'tb-definition__label', 'Итоговое определение'));
      var p = el('p', 'tb-definition__text');
      p.appendChild(el('dfn', 'tb-definition__term', b.result.term));
      p.appendChild(document.createTextNode(' — '));
      d.appendRich(p, b.result.text);
      result.appendChild(p);
      node.appendChild(result);
    }

    draw();
    return node;
  });

  /* ---------- classify: ситуации по одной ---------- */

  register('classify', function (b, ctx) {
    var node = el('div', 'tb-task tb-classify');
    var justAnswered = null;   // после ответа — пауза, чтобы прочитать объяснение

    function draw() {
      node.textContent = '';
      node.appendChild(d.taskLabel('Классифицируйте'));
      node.appendChild(d.rich('p', 'tb-task__prompt', b.prompt));

      var done = el('ol', 'tb-classify__done');
      var current = null;
      var right = 0;
      var answered = 0;
      b.items.forEach(function (item, i) {
        var a = ctx.getAnswer(item.id);
        if (!a) { if (current === null) current = i; return; }
        answered += 1;
        if (a.correct) right += 1;
        var li = el('li', 'tb-case ' + (a.correct ? 'is-right' : 'is-wrong'));
        li.setAttribute('data-item', item.id);
        li.appendChild(el('p', 'tb-case__num', 'Ситуация ' + (i + 1)));
        li.appendChild(d.rich('p', 'tb-case__text', item.text));
        var res = el('p', 'tb-case__verdict');
        res.appendChild(el('strong', null, a.correct ? 'Верно: ' : 'Неверно: '));
        res.appendChild(document.createTextNode(
          a.correct ? b.options[item.answer].toLowerCase() + '.'
                    : 'вы выбрали «' + b.options[a.value] + '», правильный ответ — «' + b.options[item.answer] + '».'));
        li.appendChild(res);
        li.appendChild(d.rich('p', 'tb-case__explanation', item.explanation));
        done.appendChild(li);
      });
      if (answered) node.appendChild(done);

      if (current !== null && justAnswered !== null) {
        var more = d.button('btn btn--ghost tb-classify__next', 'Следующая ситуация →', function () {
          justAnswered = null;
          draw();
          d.focus(node.querySelector('.tb-classify__current .tb-case__text'));
        });
        node.appendChild(more);
        return;
      }

      if (current !== null) {
        var item = b.items[current];
        var box = el('div', 'tb-case tb-classify__current');
        box.appendChild(el('p', 'tb-case__num', 'Ситуация ' + (current + 1) + ' из ' + b.items.length));
        box.appendChild(d.rich('p', 'tb-case__text', item.text));
        var choices = el('div', 'tb-classify__choices');
        choices.setAttribute('role', 'group');
        choices.setAttribute('aria-label', 'Ваш ответ');
        b.options.forEach(function (label, j) {
          choices.appendChild(d.button('btn btn--ghost tb-choice', label, function () {
            ctx.answer(item.id, j, j === item.answer);
            justAnswered = item.id;
            draw();
            d.focus(node.querySelector('[data-item="' + item.id + '"] .tb-case__verdict'));
          }));
        });
        box.appendChild(choices);
        node.appendChild(box);
        return;
      }

      var total = el('p', 'tb-score', 'Верно: ' + right + ' из ' + b.items.length);
      total.setAttribute('role', 'status');
      node.appendChild(total);
    }

    draw();
    return node;
  });

  /* ---------- quiz: мини-проверка и финальная проверка ---------- */

  register('quiz', function (b, ctx) {
    var node = el('div', 'tb-quiz tb-quiz--' + b.mode);
    var drafts = {};

    function questionNode(q, index) {
      var li = el('li', 'tb-question');
      li.setAttribute('data-question', q.id);
      var answer = ctx.getAnswer(q.id);
      var multi = q.type === 'multiple';
      var draft = drafts[q.id] || (drafts[q.id] = []);

      li.appendChild(el('p', 'tb-question__num', 'Вопрос ' + (index + 1) + ' из ' + b.questions.length));
      li.appendChild(d.rich('p', 'tb-question__text', q.text));
      if (!answer) li.appendChild(el('p', 'tb-task__hint', multi ? 'Выберите все верные ответы.' : 'Выберите один ответ.'));

      var chosen = answer ? answer.value : draft;
      li.appendChild(optionList({
        multi: multi,
        locked: !!answer,
        items: q.options.map(function (o, i) {
          var picked = chosen.indexOf(i) !== -1;
          if (!answer) return { text: o.text, status: picked ? 'selected' : null };
          var status = picked ? (o.correct ? 'right' : 'wrong') : (o.correct ? 'missed' : 'neutral');
          var tags = {
            right: 'Ваш ответ · верно',
            wrong: 'Ваш ответ · неверно',
            missed: multi ? 'Верный вариант — вы его не выбрали' : 'Правильный ответ',
            neutral: null
          };
          return { text: o.text, status: status, chosen: picked, tag: tags[status], note: o.explanation || null };
        }),
        onPick: function (i) {
          if (multi) toggle(draft, i);
          else drafts[q.id] = [i];
          draw();
          d.focus(node.querySelector('[data-question="' + q.id + '"] .tb-option:nth-child(' + (i + 1) + ') .tb-option__btn'));
        }
      }));

      if (!answer) {
        var check = d.button('btn btn--primary tb-task__submit', 'Проверить');
        check.disabled = draft.length === 0;
        check.addEventListener('click', function () {
          var key = [];
          q.options.forEach(function (o, i) { if (o.correct) key.push(i); });
          ctx.answer(q.id, draft.slice().sort(), sameSet(draft, key));
          draw();
          d.focus(node.querySelector('[data-question="' + q.id + '"] .tb-verdict'));
        });
        li.appendChild(check);
        return li;
      }

      li.appendChild(verdict(answer.correct, 'Верно', 'Неверно'));
      li.appendChild(d.paras(el('div', 'tb-question__explanation'), q.explanation));
      if (!answer.correct && q.ref && q.ref !== ctx.section.id) {
        var link = el('a', 'tb-review-link', 'Повторить раздел «' + ctx.sectionTitle(q.ref) + '» →');
        link.href = ctx.sectionHref(q.ref);
        li.appendChild(link);
      }
      return li;
    }

    function draw() {
      node.textContent = '';
      var head = el('div', 'tb-quiz__head');
      head.appendChild(d.taskLabel(b.title || (b.mode === 'final' ? 'Финальная проверка' : 'Мини-проверка')));
      node.appendChild(head);

      var list = el('ol', 'tb-quiz__list');
      b.questions.forEach(function (q, i) { list.appendChild(questionNode(q, i)); });
      node.appendChild(list);

      var answered = 0;
      var right = 0;
      b.questions.forEach(function (q) {
        var a = ctx.getAnswer(q.id);
        if (a) { answered += 1; if (a.correct) right += 1; }
      });
      head.appendChild(el('p', 'tb-quiz__count', 'Отвечено ' + answered + ' из ' + b.questions.length));

      if (answered === b.questions.length) {
        var foot = el('div', 'tb-quiz__foot');
        var score = el('p', 'tb-score', 'Верно: ' + right + ' из ' + b.questions.length);
        score.setAttribute('role', 'status');
        foot.appendChild(score);
        foot.appendChild(d.button('btn btn--ghost btn--sm', 'Пройти заново', function () {
          ctx.clear(b.questions.map(function (q) { return q.id; }));
          drafts = {};
          draw();
          d.focus(node.querySelector('.tb-question__text'));
        }));
        node.appendChild(foot);
      }
    }

    draw();
    return node;
  });

  TXT.ui.optionList = optionList;
})(typeof window !== 'undefined' ? window : globalThis);
