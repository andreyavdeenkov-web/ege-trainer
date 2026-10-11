/**
 * Олимпиады, интерфейс: составное задание по юридической ситуации (тип compound).
 *
 * Решение:
 *   • ситуация и тексты норм вверху; тексты, относящиеся к следующим частям, появляются
 *     вместе с этими частями;
 *   • полоса этапов «А → Б → В»: зафиксированные части, текущая, закрытые;
 *   • в текущей части — её вопросы; кнопка «Зафиксировать и открыть часть …» доступна,
 *     когда часть заполнена. Зафиксированную часть изменить нельзя — поэтому условие
 *     поздних частей не может подсказать ответ на ранние;
 *   • названия и вопросы закрытых частей не показываются.
 * Разбор: все части с баллами, ответом ученика, эталоном и объяснениями.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var ui = OLY.ui;
  var R = OLY.nrmRows;
  var C = OLY.compound;
  var AC = OLY.argumentCheck;
  var N = ui.nrm;
  var el = N.el;

  var LETTERS = 'АБВГДЕ';

  function letter(i) { return LETTERS[i] || String(i + 1); }

  function copy(task, response) {
    var parts = {};
    task.parts.forEach(function (p) {
      var a = response && response.parts && response.parts[p.id];
      if (p.kind === 'choice') parts[p.id] = N.copyRows([{ rows: p.rows }], a);
      else if (p.kind === 'short') {
        parts[p.id] = {};
        p.items.forEach(function (item) { parts[p.id][item.id] = a && typeof a[item.id] === 'string' ? a[item.id] : ''; });
      } else parts[p.id] = ui.nrmArgs.copy(p.arguments, a);
    });
    return { stage: C.stageOf(task, response), parts: parts };
  }

  function situationBlock(task) {
    var s = el('section', 'nrm-block nrm-context');
    s.appendChild(el('h3', 'nrm-block__title', 'Ситуация'));
    task.situation.forEach(function (p) { s.appendChild(el('p', 'nrm-context__p', p)); });
    return s;
  }

  function legalBlock(task, blocks) {
    if (!blocks.length) return null;
    return N.renderLegal({ id: task.id, legal: blocks }, { blocks: blocks }).node;
  }

  function stages(task, stage, reviewMode) {
    var ol = el('ol', 'nrm-stages');
    ol.setAttribute('aria-label', 'Части задания');
    task.parts.forEach(function (p, i) {
      var state = reviewMode || i < stage ? 'done' : (i === stage ? 'current' : 'closed');
      var li = el('li', 'nrm-stage is-' + state);
      li.appendChild(el('span', 'nrm-stage__code', letter(i)));
      li.appendChild(el('span', 'nrm-stage__text', state === 'done' ? (reviewMode ? 'часть ' + letter(i) : 'зафиксирована') : (state === 'current' ? 'сейчас' : 'закрыта')));
      if (state === 'current') li.setAttribute('aria-current', 'step');
      ol.appendChild(li);
    });
    return ol;
  }

  /** Краткая сводка зафиксированной части (без оценки). */
  function lockedSummary(task, part, i, answers) {
    var box = el('section', 'nrm-block nrm-locked');
    var head = el('div', 'nrm-block__head');
    head.appendChild(el('h3', 'nrm-block__title', part.title));
    head.appendChild(el('span', 'nrm-block__count is-done', 'зафиксировано'));
    box.appendChild(head);
    var lines = [];
    if (part.kind === 'choice') {
      part.rows.forEach(function (row) {
        var a = answers[row.id];
        lines.push(N.shortLabel(row) + ': ' + N.chosenText(row, a));
      });
    } else if (part.kind === 'short') {
      part.items.forEach(function (item) { lines.push((item.short || item.id) + ': ' + (answers[item.id] || '—')); });
    } else {
      part.arguments.forEach(function (arg, k) {
        var a = answers[arg.id];
        lines.push('Довод ' + (k + 1) + ': ' + (a.t === null ? '—' : AC.TRUTH[a.t].short) + ' · ' + (a.l === null ? '—' : AC.LINK[a.l].short));
      });
    }
    var ul = el('ul', 'nrm-locked__list');
    lines.forEach(function (t) { ul.appendChild(el('li', null, t)); });
    box.appendChild(ul);
    return box;
  }

  /* ---------- Решение ---------- */

  function render(container, task, ctx) {
    var state = copy(task, ctx.response);
    var editors = [];
    var fill = null;
    var lockBtn = null;
    var count = null;

    function build(focusTitle) {
      editors = [];
      var stage = state.stage;
      var part = task.parts[stage];
      var answers = state.parts[part.id];
      var box = el('div', 'nrm-grid nrm-compound');
      var notice = N.demoNotice(task);
      if (notice) box.appendChild(notice);
      box.appendChild(situationBlock(task));
      var legal = legalBlock(task, C.visibleLegal(task, stage));
      if (legal) box.appendChild(legal);
      box.appendChild(stages(task, stage, false));
      for (var i = 0; i < stage; i++) box.appendChild(lockedSummary(task, task.parts[i], i, state.parts[task.parts[i].id]));

      var block = el('section', 'nrm-block nrm-part');
      block.id = N.anchorId(task, 'part-' + part.id);
      var head = el('div', 'nrm-block__head');
      var title = el('h3', 'nrm-block__title', part.title);
      title.tabIndex = -1;
      head.appendChild(title);
      count = el('span', 'nrm-block__count');
      head.appendChild(count);
      block.appendChild(head);
      if (part.intro) block.appendChild(el('p', 'nrm-block__hint', part.intro));
      if (part.kind === 'short') block.appendChild(el('p', 'nrm-block__hint', ui.nrmShort.HINT));
      if (part.kind === 'arguments') {
        block.appendChild(ui.nrmArgs.issueBox(part.issue, part.conclusion));
        block.appendChild(ui.nrmArgs.help());
      }
      var list = el('div', 'nrm-rows');
      if (part.kind === 'choice') {
        part.rows.forEach(function (row) {
          var e = N.rowEditor(task, row, answers, changed);
          list.appendChild(e.card);
          editors.push({ paint: e.paint });
        });
      } else if (part.kind === 'short') {
        part.items.forEach(function (item) {
          var e = ui.nrmShort.itemEditor(task, item, answers, changed);
          list.appendChild(e.card);
          editors.push({ paint: function () {
            if (e.input.value !== answers[item.id]) e.input.value = answers[item.id];
            e.hint.textContent = ui.nrmShort.recognized(item, answers[item.id]);
            e.card.classList.toggle('is-filled', !!answers[item.id].trim());
          } });
        });
      } else {
        part.arguments.forEach(function (arg, k) {
          var e = ui.nrmArgs.editor(task, arg, k, answers, changed);
          list.appendChild(e.card);
          editors.push({ paint: e.paint });
        });
      }
      block.appendChild(list);

      lockBtn = null;
      if (stage < task.parts.length - 1) {
        var lockBox = el('div', 'nrm-lock');
        lockBox.appendChild(el('p', 'nrm-lock__note', 'После фиксации ответ на часть ' + letter(stage) + ' изменить нельзя. Следующая часть откроется сразу.'));
        lockBtn = el('button', 'btn btn--primary', 'Зафиксировать и открыть часть ' + letter(stage + 1));
        lockBtn.type = 'button';
        lockBtn.addEventListener('click', function () {
          if (!C.partIsComplete(task, state, state.stage)) return;
          state.stage += 1;
          ctx.onChange(JSON.parse(JSON.stringify(state)));
          build(true);
        });
        lockBox.appendChild(lockBtn);
        block.appendChild(lockBox);
      } else {
        block.appendChild(el('p', 'nrm-lock__note', 'Это последняя часть. Когда ответите, нажмите «Проверить» — баллы и разбор появятся по всем частям.'));
      }
      box.appendChild(block);

      for (var j = stage + 1; j < task.parts.length; j++) {
        var closed = el('p', 'nrm-closed', 'Часть ' + letter(j) + ' откроется после фиксации части ' + letter(j - 1) + '.');
        box.appendChild(closed);
      }

      fill = N.fillBar(task);
      fill.node.classList.add('nrm-fillbar--sticky');
      box.appendChild(fill.node);

      container.textContent = '';
      container.appendChild(box);
      paint();
      if (focusTitle) {
        block.scrollIntoView({ block: 'start' });
        title.focus({ preventScroll: true });
      }
    }

    function changed() {
      paint();
      ctx.onChange(JSON.parse(JSON.stringify(state)));
    }

    function paint() {
      var part = task.parts[state.stage];
      var answers = state.parts[part.id];
      editors.forEach(function (e) { e.paint(); });
      var ids;
      var done;
      if (part.kind === 'choice') {
        ids = part.rows.map(function (r) { return r.id; });
        done = part.rows.map(function (r) { return R.rowIsComplete(r, answers[r.id]); });
      } else if (part.kind === 'short') {
        ids = part.items.map(function (it) { return it.id; });
        done = part.items.map(function (it) { return !!answers[it.id].trim(); });
      } else {
        ids = part.arguments.map(function (a) { return a.id; });
        done = part.arguments.map(function (a) { return AC.argIsComplete(answers[a.id]); });
      }
      var filled = done.filter(Boolean).length;
      var firstEmpty = null;
      done.forEach(function (d, k) { if (!d && !firstEmpty) firstEmpty = ids[k]; });
      count.textContent = filled + ' из ' + ids.length;
      count.classList.toggle('is-done', filled === ids.length);
      fill.update(filled, ids.length, firstEmpty);
      if (lockBtn) lockBtn.disabled = filled !== ids.length;
    }

    build(false);
    return {
      set: function (next) {
        state = copy(task, next);
        build(false);
      }
    };
  }

  /* ---------- Разбор ---------- */

  function renderReview(container, task, ctx) {
    var result = ctx.result && ctx.result.verdict !== 'unanswered' ? ctx.result : null;
    var state = result ? copy(task, result.response) : null;
    var details = result && result.details ? result.details.parts : null;
    var box = el('div', 'nrm-grid nrm-compound is-review');
    var notice = N.demoNotice(task);
    if (notice) box.appendChild(notice);
    box.appendChild(situationBlock(task));
    var legal = legalBlock(task, C.allLegal(task));
    if (legal) box.appendChild(legal);
    box.appendChild(stages(task, task.parts.length - 1, true));
    task.parts.forEach(function (part) {
      var d = details && details[part.id];
      var answers = state && state.parts[part.id];
      var block = el('section', 'nrm-block nrm-part');
      block.id = N.anchorId(task, 'part-' + part.id);
      var head = el('div', 'nrm-block__head');
      head.appendChild(el('h3', 'nrm-block__title', part.title));
      if (d) head.appendChild(el('span', 'nrm-block__count' + (d.earned >= d.max ? ' is-done' : ''), N.fmt(d.earned) + ' из ' + d.max));
      block.appendChild(head);
      if (part.intro) block.appendChild(el('p', 'nrm-block__hint', part.intro));
      if (part.kind === 'arguments') block.appendChild(ui.nrmArgs.issueBox(part.issue, part.conclusion));
      var list = el('div', 'nrm-rows');
      if (part.kind === 'choice') {
        part.rows.forEach(function (row) { list.appendChild(N.rowReview(task, row, answers && answers[row.id], d && d.rows[row.id])); });
      } else if (part.kind === 'short') {
        part.items.forEach(function (item) { list.appendChild(ui.nrmShort.itemReview(task, item, answers && answers[item.id], d && d.items[item.id])); });
      } else {
        part.arguments.forEach(function (arg, k) { list.appendChild(ui.nrmArgs.review(task, arg, k, answers && answers[arg.id], d && d.arguments[arg.id])); });
      }
      block.appendChild(list);
      if (part.kind === 'arguments') block.appendChild(ui.nrmArgs.help());
      box.appendChild(block);
    });
    container.textContent = '';
    container.appendChild(box);
  }

  function feedbackSummary(container, task, result) {
    var d = result.details;
    var mistakes = [];
    if (d) {
      task.parts.forEach(function (part, i) {
        var pd = d.parts[part.id];
        var prefix = letter(i) + ': ';
        if (part.kind === 'choice') {
          N.rowMistakes(part.rows, pd.rows).forEach(function (m) { mistakes.push({ id: m.id, label: prefix + m.label }); });
        } else if (part.kind === 'short') {
          part.items.forEach(function (item) {
            if (pd.items[item.id].status !== 'ok') mistakes.push({ id: item.id, label: prefix + (item.short || item.id) });
          });
        } else {
          ui.nrmArgs.mistakes(part.arguments, pd.arguments).forEach(function (m) { mistakes.push({ id: m.id, label: prefix + m.label }); });
        }
      });
    }
    N.summary(container, task, result, mistakes);
  }

  ui.views.register('compound', {
    hint: function () { return 'Ответьте на части задания по очереди: следующая часть открывается после фиксации предыдущей. «Проверить» станет доступна в последней части.'; },
    canCheck: function (task, response) { return C.stageOf(task, response) === task.parts.length - 1; },
    render: render,
    renderReview: renderReview,
    feedbackSummary: feedbackSummary
  });

})(typeof window !== 'undefined' ? window : globalThis);
