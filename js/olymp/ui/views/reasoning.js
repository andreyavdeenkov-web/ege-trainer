/**
 * Олимпиады, интерфейс: поиск ошибок в юридическом рассуждении (тип reasoning-check).
 *
 * Решение:
 *   • положение (если есть) — для чтения;
 *   • карточки шагов рассуждения; кнопка «Ошибка в шаге» раскрывает в карточке
 *     выбор происхождения ошибки, шага с исходной ошибкой и содержательного типа;
 *   • памятка «Как выбрать тип ошибки» (упорядоченное правило Т1–Т6) — одна на блок;
 *   • строки выбора и закреплённый индикатор заполнения — как в классификационной карте.
 *
 * Разбор: по каждому шагу — ответ ученика, правильный ответ и краткая причина ошибки;
 * подробное объяснение раскрывается.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var ui = OLY.ui;
  var R = OLY.nrmRows;
  var C = OLY.reasoningCheck;
  var N = ui.nrm;
  var el = N.el;

  var STEPS_ANCHOR = 'steps';

  function typeCode(id) {
    return 'Т' + id.slice(1);   // T5 → Т5 (кириллица в интерфейсе)
  }

  function typeInfo(id) {
    return C.ERROR_TYPES.filter(function (t) { return t.id === id; })[0];
  }

  function typeText(id) {
    var t = typeInfo(id);
    return t ? typeCode(t.id) + ' — ' + t.label : '';
  }

  function originText(task, origin, from) {
    var n = from ? C.stepNumber(task, from) : null;
    if (origin === 'own') return 'самостоятельная';
    if (origin === 'inherited') return 'только унаследована' + (n ? ' от шага ' + n : '');
    if (origin === 'mixed') return 'унаследована' + (n ? ' от шага ' + n : '') + ' + собственная';
    return 'не указано';
  }

  function copyResponse(task, response) {
    var steps = {};
    task.steps.forEach(function (s) {
      var a = response && response.steps && response.steps[s.id];
      steps[s.id] = a
        ? { flag: a.flag === true, origin: a.origin || null, from: a.from || null, type: a.type || null }
        : { flag: false, origin: null, from: null, type: null };
    });
    return { steps: steps, rows: N.copyRows(task.sections || [], response && response.rows) };
  }

  function originHelp() {
    var d = el('details', 'nrm-more nrm-types-help');
    d.appendChild(el('summary', null, 'Как определить происхождение ошибки'));
    [
      'Самостоятельная — шаг ошибочен, даже если все предыдущие шаги верны.',
      'Только унаследована — шаг рассуждает правильно, но опирается на ошибочный шаг; если бы тот шаг был верен, верен был бы и этот. Тип не указывается.',
      'Унаследована + собственная — шаг опирается на ошибочный шаг и добавляет свою ошибку.',
      'Проверка подстановкой: допустите, что предыдущий шаг верен. Если вывод шага всё равно неверен — ошибка собственная. Слова «следовательно», «значит» сами по себе не делают ошибку унаследованной.',
      'Унаследовать можно только от шага, который сам ошибочен в этом задании.'
    ].forEach(function (t) { d.appendChild(el('p', 'nrm-more__text', t)); });
    return d;
  }

  function typeHelp() {
    var d = el('details', 'nrm-more nrm-types-help');
    d.appendChild(el('summary', null, 'Как выбрать тип ошибки'));
    d.appendChild(el('p', 'nrm-more__text', 'Идите по списку сверху вниз и выберите первый подходящий тип — даже если шаг подходит и под следующий.'));
    var ol = el('ol', 'nrm-types-help__list');
    C.ERROR_TYPES.forEach(function (t) {
      var li = el('li');
      li.appendChild(el('strong', null, typeCode(t.id) + ' — ' + t.label + '. '));
      li.appendChild(document.createTextNode('Признак: ' + t.test + '.'));
      ol.appendChild(li);
    });
    d.appendChild(ol);
    return d;
  }

  /** Подписи кнопок — короткие; полное название — для чтения с экрана и во всплывающей подсказке. */
  function labelButtons(group, full) {
    group.buttons.forEach(function (b, i) {
      b.setAttribute('aria-label', full[i]);
      b.title = full[i];
    });
  }

  function stepHead(task, step, index) {
    var head = el('div', 'nrm-step__head');
    head.appendChild(el('span', 'nrm-step__num', String(index + 1)));
    head.appendChild(el('p', 'nrm-step__text', step.text));
    return head;
  }

  /* ---------- Решение ---------- */

  function render(container, task, ctx) {
    var response = copyResponse(task, ctx.response);
    var parts = {};

    var box = el('div', 'nrm-grid nrm-reasoning');
    var notice = N.demoNotice(task);
    if (notice) box.appendChild(notice);
    if (task.legal) box.appendChild(N.renderLegal(task, {}).node);

    var block = el('section', 'nrm-block');
    block.id = N.anchorId(task, STEPS_ANCHOR);
    var head = el('div', 'nrm-block__head');
    head.appendChild(el('h3', 'nrm-block__title', 'А. ' + (task.intro || 'Рассуждение')));
    var count = el('span', 'nrm-block__count');
    head.appendChild(count);
    block.appendChild(head);
    block.appendChild(el('p', 'nrm-block__hint', task.markHint || 'Отметьте ошибочные шаги. Для каждого отмеченного шага укажите происхождение и содержательный тип ошибки.'));
    var helps = el('div', 'nrm-helps');
    helps.appendChild(originHelp());
    helps.appendChild(typeHelp());
    block.appendChild(helps);

    var list = el('ol', 'nrm-rows nrm-steps');
    task.steps.forEach(function (step, i) { list.appendChild(renderStep(step, i)); });
    block.appendChild(list);
    box.appendChild(block);

    var sections = N.rowSections(task, task.sections || [], response.rows, changed);
    sections.nodes.forEach(function (n) { box.appendChild(n); });

    var fill = N.fillBar(task);
    fill.node.classList.add('nrm-fillbar--sticky');
    box.appendChild(fill.node);

    function renderStep(step, i) {
      var card = el('li', 'nrm-row nrm-step');
      card.id = N.anchorId(task, step.id);
      card.appendChild(stepHead(task, step, i));

      var flag = el('button', 'nrm-flag');
      flag.type = 'button';
      flag.setAttribute('aria-pressed', 'false');
      flag.setAttribute('aria-label', 'Шаг ' + (i + 1) + ': ошибка в шаге');
      flag.appendChild(el('span', 'nrm-flag__box', ''));
      flag.appendChild(el('span', null, 'Ошибка в шаге'));
      flag.addEventListener('click', function () {
        var a = response.steps[step.id];
        parts[step.id].collapsed = false;
        if (a.flag) {
          response.steps[step.id] = { flag: false, origin: null, from: null, type: null };
          // Шаги, унаследовавшие ошибку от снятого шага, теряют ссылку на него.
          task.steps.forEach(function (s) { if (response.steps[s.id].from === step.id) response.steps[s.id].from = null; });
        } else a.flag = true;
        changed();
      });
      card.appendChild(flag);

      var more = el('div', 'nrm-follow nrm-step__more');
      more.appendChild(el('p', 'nrm-follow__label', 'Происхождение ошибки'));
      var origin = N.chipGroup(C.ORIGINS.map(function (o) { return o.short; }), 'Шаг ' + (i + 1) + ': происхождение ошибки', function (j) {
        var a = response.steps[step.id];
        var id = C.ORIGINS[j].id;
        a.origin = a.origin === id ? null : id;
        if (!C.needsFrom(a.origin)) a.from = null;
        if (!C.needsType(a.origin)) a.type = null;
        choose(step);
      }, false);
      labelButtons(origin, C.ORIGINS.map(function (o) { return 'Шаг ' + (i + 1) + ': ' + o.label; }));
      origin.node.classList.add('nrm-chips--grid3');
      more.appendChild(origin.node);

      var fromWrap = el('div', 'nrm-step__sub');
      fromWrap.appendChild(el('p', 'nrm-follow__label', 'От шага с исходной ошибкой'));
      var fromEmpty = el('p', 'nrm-step__empty', 'Сначала отметьте предыдущий шаг, в котором возникла исходная ошибка.');
      fromWrap.appendChild(fromEmpty);
      var earlier = task.steps.slice(0, i);
      var from = N.chipGroup(earlier.map(function (s, k) { return 'Шаг ' + (k + 1); }), 'Шаг ' + (i + 1) + ': шаг с исходной ошибкой', function (k) {
        var a = response.steps[step.id];
        var id = earlier[k].id;
        a.from = a.from === id ? null : id;
        choose(step);
      }, false);
      fromWrap.appendChild(from.node);
      more.appendChild(fromWrap);

      var typeWrap = el('div', 'nrm-step__sub');
      typeWrap.appendChild(el('p', 'nrm-follow__label', 'Содержательный тип (первый подходящий по порядку)'));
      var type = N.chipGroup(C.ERROR_TYPES.map(function (t) { return typeCode(t.id) + ' ' + t.short; }), 'Шаг ' + (i + 1) + ': тип ошибки', function (k) {
        var a = response.steps[step.id];
        var id = C.ERROR_TYPES[k].id;
        a.type = a.type === id ? null : id;
        choose(step);
      }, false);
      labelButtons(type, C.ERROR_TYPES.map(function (t) { return typeCode(t.id) + ' — ' + t.label; }));
      type.node.classList.add('nrm-chips--grid2');
      typeWrap.appendChild(type.node);
      more.appendChild(typeWrap);
      card.appendChild(more);

      // Заполненный шаг сворачивается в одну строку, чтобы на смартфоне не листать выбор заново.
      var done = el('div', 'nrm-step__done');
      var doneText = el('span', 'nrm-step__done-text');
      var edit = el('button', 'btn btn--ghost btn--sm', 'Изменить');
      edit.type = 'button';
      edit.setAttribute('aria-label', 'Шаг ' + (i + 1) + ': изменить происхождение и тип ошибки');
      edit.addEventListener('click', function () {
        parts[step.id].collapsed = false;
        paint();
        origin.buttons[0].focus({ preventScroll: true });
      });
      done.appendChild(doneText);
      done.appendChild(edit);
      card.appendChild(done);

      parts[step.id] = { card: card, flag: flag, more: more, origin: origin, fromWrap: fromWrap, fromEmpty: fromEmpty, from: from, earlier: earlier, typeWrap: typeWrap, type: type, done: done, doneText: doneText, edit: edit, collapsed: false };
      return card;
    }

    /** После выбора: если шаг заполнен — свернуть его и перевести фокус на «Изменить». */
    function choose(step) {
      var p = parts[step.id];
      var complete = C.stepIsComplete(response.steps[step.id]);
      p.collapsed = complete;
      changed();
      if (complete) p.edit.focus({ preventScroll: true });
    }

    function doneSummary(a) {
      var text = originText(task, a.origin, a.from);
      text = text.charAt(0).toUpperCase() + text.slice(1);
      if (C.needsType(a.origin) && a.type) text += ' · ' + typeCode(a.type) + ' ' + typeInfo(a.type).short;
      return text;
    }

    function changed() {
      paint();
      ctx.onChange(JSON.parse(JSON.stringify(response)));
    }

    function paint() {
      var flagged = 0;
      var firstIncomplete = null;
      task.steps.forEach(function (step) {
        var a = response.steps[step.id];
        var p = parts[step.id];
        if (a.flag) flagged++;
        var complete = C.stepIsComplete(a);
        if (!complete && !firstIncomplete) firstIncomplete = step.id;
        p.card.classList.toggle('is-flagged', a.flag);
        p.card.classList.toggle('is-filled', a.flag && complete);
        p.flag.setAttribute('aria-pressed', String(a.flag));
        p.flag.classList.toggle('is-on', a.flag);
        if (!a.flag || !complete) p.collapsed = false;
        p.more.hidden = !a.flag || p.collapsed;
        p.done.hidden = !(a.flag && p.collapsed);
        if (!p.done.hidden) p.doneText.textContent = doneSummary(a);
        p.origin.paint(C.ORIGINS.map(function (o) { return o.id; }).indexOf(a.origin));
        p.fromWrap.hidden = !C.needsFrom(a.origin);
        // Унаследовать можно только от шага, отмеченного как ошибочный.
        var available = 0;
        p.earlier.forEach(function (s, k) {
          var on = response.steps[s.id].flag;
          p.from.buttons[k].hidden = !on;
          if (on) available++;
        });
        p.fromEmpty.hidden = available > 0;
        p.from.paint(p.earlier.map(function (s) { return s.id; }).indexOf(a.from));
        p.typeWrap.hidden = !C.needsType(a.origin);
        p.type.paint(C.ERROR_TYPES.map(function (t) { return t.id; }).indexOf(a.type));
      });
      var stepsDone = flagged > 0 && !firstIncomplete;
      count.textContent = flagged ? 'отмечено шагов: ' + flagged : 'шаги не отмечены';
      count.classList.toggle('is-done', stepsDone);
      sections.paint();
      var rows = C.rowsOf(task);
      var filled = stepsDone ? 1 : 0;
      var firstEmpty = stepsDone ? null : (flagged ? firstIncomplete : STEPS_ANCHOR);
      rows.forEach(function (row) {
        if (R.rowIsComplete(row, response.rows[row.id])) filled++;
        else if (!firstEmpty) firstEmpty = row.id;
      });
      fill.update(filled, rows.length + 1, firstEmpty);
    }

    container.textContent = '';
    container.appendChild(box);
    paint();
    return {
      set: function (next) {
        var fresh = copyResponse(task, next);
        Object.keys(fresh.steps).forEach(function (id) { response.steps[id] = fresh.steps[id]; });
        Object.keys(fresh.rows).forEach(function (id) { response.rows[id] = fresh.rows[id]; });
        paint();
      }
    };
  }

  /* ---------- Разбор ---------- */

  function originReason(task, step, a, detail) {
    if (detail.origin === 'from') {
      if (R.isExplanation(step.fromWrong)) return R.explanation(step.fromWrong);
      return { short: 'Укажите шаг, в котором возникла исходная ошибка, — шаг ' + C.stepNumber(task, step.key.from) + '.', full: null };
    }
    var own = step.originWrong && step.originWrong[a.origin];
    if (R.isExplanation(own)) return R.explanation(own);
    return { short: 'Происхождение ошибки — ' + originText(task, step.key.origin, step.key.from) + '.', full: null };
  }

  function typeReason(step, a) {
    var own = step.typeWrong && step.typeWrong[a.type];
    if (R.isExplanation(own)) return R.explanation(own);
    var key = typeInfo(step.key.type);
    return {
      short: 'По упорядоченному правилу подходит ' + typeText(step.key.type) + ': ' + key.test + '.',
      full: null
    };
  }

  function stepReview(task, step, index, a, detail) {
    var card = el('li', 'nrm-row nrm-rv nrm-step');
    card.id = N.anchorId(task, step.id);
    var head = stepHead(task, step, index);
    if (detail && step.key.error) head.appendChild(el('span', 'nrm-rv__pts', N.fmt(detail.points) + ' из ' + detail.max));
    card.appendChild(head);

    var reasons = [];
    var fulls = [];
    function add(reason) {
      if (!reason) return;
      reasons.push(reason.short);
      if (reason.full) fulls.push(reason.full);
    }
    var keyVerdict = step.key.error ? 'ошибочный шаг' : 'верный шаг';
    var wrong = false;

    if (detail) {
      card.appendChild(N.answerLine('Ваш ответ: ', a.flag ? 'отмечен как ошибочный' : 'не отмечен', detail.flagStatus === 'ok' ? 'text-right' : 'text-wrong', detail.flagStatus));
      if (detail.flagStatus !== 'ok') {
        wrong = true;
        card.appendChild(N.answerLine('Правильно: ', keyVerdict, 'text-right'));
        add(R.explanation(step.key.error ? step.missed : step.wrong));
      }
    } else {
      card.appendChild(N.answerLine('Правильно: ', keyVerdict, 'text-right'));
    }

    if (step.key.error) {
      var keyOrigin = originText(task, step.key.origin, step.key.from);
      if (detail && a.flag) {
        var originOk = detail.origin === 'ok';
        card.appendChild(N.answerLine('Происхождение: ', originText(task, a.origin, a.from), originOk ? 'text-right' : 'text-wrong', originOk ? 'ok' : 'wrong'));
        if (!originOk) {
          wrong = true;
          card.appendChild(N.answerLine('Правильно: ', keyOrigin, 'text-right'));
          add(originReason(task, step, a, detail));
        }
        if (C.needsType(step.key.origin)) {
          var typeOk = detail.type === 'ok';
          card.appendChild(N.answerLine('Тип: ', a.type ? typeText(a.type) : 'не указан', typeOk ? 'text-right' : 'text-wrong', typeOk ? 'ok' : (a.type ? 'wrong' : 'empty')));
          if (!typeOk) {
            wrong = true;
            card.appendChild(N.answerLine('Правильно: ', typeText(step.key.type), 'text-right'));
            if (a.type) add(typeReason(step, a));
            else add({ short: 'Ошибка этого шага собственная, поэтому нужно указать и её содержательный тип.', full: null });
          }
        }
      } else {
        card.appendChild(N.answerLine('Происхождение: ', keyOrigin, 'text-right'));
        if (C.needsType(step.key.origin)) card.appendChild(N.answerLine('Тип: ', typeText(step.key.type), 'text-right'));
      }
    }

    if (wrong) {
      card.classList.add('nrm-rv--wrong');
      if (reasons.length) card.appendChild(el('p', 'nrm-rv__mistake', reasons.join(' ')));
      var box = N.more('Подробное объяснение', fulls.concat(step.explanation), false);
      if (box) card.appendChild(box);
    } else {
      if (detail) card.classList.add('nrm-rv--ok');
      var more = N.more('Пояснение', [step.explanation], false);
      if (more) card.appendChild(more);
    }
    return card;
  }

  /** Сводка баллов за отметку шагов. */
  function flagsReview(task, flags) {
    var card = el('div', 'nrm-row nrm-rv nrm-flags');
    var all = flags.first.points + flags.clean.points + (flags.rest ? flags.rest.points : 0);
    var max = flags.first.max + flags.clean.max + (flags.rest ? flags.rest.max : 0);
    var head = el('div', 'nrm-row__head');
    head.appendChild(el('span', 'nrm-row__label', 'Отметка шагов'));
    head.appendChild(el('span', 'nrm-rv__pts', N.fmt(all) + ' из ' + max));
    card.appendChild(head);
    var n = function (id) { return C.stepNumber(task, id); };
    card.appendChild(N.answerLine('Первый ошибочный шаг (' + n(flags.first.step) + '): ', flags.first.status === 'ok' ? 'отмечен' : 'не отмечен', flags.first.status === 'ok' ? 'text-right' : 'text-wrong', flags.first.status));
    if (flags.rest) {
      card.appendChild(N.answerLine('Остальные ошибочные шаги: ', flags.rest.status === 'ok' ? 'отмечены' : 'не отмечены: ' + flags.rest.missed.map(n).join(', '), flags.rest.status === 'ok' ? 'text-right' : 'text-wrong', flags.rest.status));
    }
    card.appendChild(N.answerLine('Верные шаги: ', flags.clean.status === 'ok' ? 'не отмечены' : 'отмечены лишние: ' + flags.clean.falsePositives.map(n).join(', '), flags.clean.status === 'ok' ? 'text-right' : 'text-wrong', flags.clean.status));
    card.classList.add(all >= max ? 'nrm-rv--ok' : 'nrm-rv--wrong');
    return card;
  }

  function renderReview(container, task, ctx) {
    var result = ctx.result && ctx.result.verdict !== 'unanswered' ? ctx.result : null;
    var response = result ? copyResponse(task, result.response) : null;
    var details = result && result.details ? result.details : null;
    var reasoning = details && details.reasoning;

    var box = el('div', 'nrm-grid nrm-reasoning is-review');
    var notice = N.demoNotice(task);
    if (notice) box.appendChild(notice);
    if (task.legal) box.appendChild(N.renderLegal(task, {}).node);

    var block = el('section', 'nrm-block');
    block.id = N.anchorId(task, STEPS_ANCHOR);
    var head = el('div', 'nrm-block__head');
    head.appendChild(el('h3', 'nrm-block__title', 'А. ' + (task.intro || 'Рассуждение')));
    if (reasoning) {
      var earned = 0;
      var max = 0;
      var f = reasoning.flags;
      [f.first, f.rest, f.clean].forEach(function (x) { if (x) { earned += x.points; max += x.max; } });
      task.steps.forEach(function (s) { earned += reasoning.steps[s.id].points; max += reasoning.steps[s.id].max; });
      head.appendChild(el('span', 'nrm-block__count' + (earned >= max ? ' is-done' : ''), N.fmt(earned) + ' из ' + max));
    }
    block.appendChild(head);
    if (reasoning) block.appendChild(flagsReview(task, reasoning.flags));
    var list = el('ol', 'nrm-rows nrm-steps');
    task.steps.forEach(function (step, i) {
      list.appendChild(stepReview(task, step, i, response && response.steps[step.id], reasoning && reasoning.steps[step.id]));
    });
    block.appendChild(list);
    var helps = el('div', 'nrm-helps');
    helps.appendChild(originHelp());
    helps.appendChild(typeHelp());
    block.appendChild(helps);
    box.appendChild(block);

    N.reviewSections(task, task.sections || [], response && response.rows, details && details.rows)
      .forEach(function (n) { box.appendChild(n); });

    container.textContent = '';
    container.appendChild(box);
  }

  function feedbackSummary(container, task, result) {
    var d = result.details;
    var mistakes = [];
    if (d) {
      task.steps.forEach(function (s, i) {
        var x = d.reasoning.steps[s.id];
        if (x.flagStatus !== 'ok' || x.points < x.max) mistakes.push({ id: s.id, label: 'Шаг ' + (i + 1) });
      });
      mistakes = mistakes.concat(N.rowMistakes(C.rowsOf(task), d.rows));
    }
    N.summary(container, task, result, mistakes);
  }

  ui.views.register('reasoning-check', {
    hint: function () {
      return 'Отметьте ошибочные шаги и для каждого укажите происхождение и тип ошибки, затем ответьте на вопросы ниже.';
    },
    render: render,
    renderReview: renderReview,
    feedbackSummary: feedbackSummary
  });
})(typeof window !== 'undefined' ? window : globalThis);
