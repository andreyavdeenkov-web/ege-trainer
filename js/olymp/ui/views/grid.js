/**
 * Олимпиады, интерфейс: классификационная карта (тип analysis-grid).
 *
 * Решение:
 *   • нормативный текст вверху — для чтения;
 *   • строки сгруппированы в смысловые блоки (разделы задания) со счётчиком
 *     заполнения у каждого блока;
 *   • закреплённый внизу индикатор «Заполнено: N из M» с переходом
 *     к первой незаполненной строке;
 *   • доказательство отмечается прямо в строке: кнопка «Отметить в тексте»
 *     раскрывает под строкой текст нормы и справочных норм с нажимаемыми
 *     фрагментами — без прокрутки к началу задания.
 *
 * Разбор и компактный результат — общие для новых типов (views/nrm-common.js).
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var ui = OLY.ui;
  var R = OLY.nrmRows;
  var N = ui.nrm;
  var el = N.el;

  function rowsOf(task) {
    return R.rowsOf(task.sections);
  }

  function copyResponse(task, response) {
    var base = {};
    rowsOf(task).forEach(function (row) {
      var a = response && response[row.id];
      base[row.id] = a ? { c: a.c === undefined ? null : a.c, f: (a.f || []).slice(), e: (a.e || []).slice() } : R.emptyRow();
    });
    return base;
  }

  /* ---------- Решение ---------- */

  function render(container, task, ctx) {
    var response = copyResponse(task, ctx.response);
    var rows = rowsOf(task);
    var parts = {};
    var sectionParts = [];
    var openEvidence = null;

    var box = el('div', 'nrm-grid');
    var notice = N.demoNotice(task);
    if (notice) box.appendChild(notice);
    box.appendChild(N.renderLegal(task, { refsCollapsed: true }).node);

    task.sections.forEach(function (section) {
      var block = el('section', 'nrm-block');
      var head = el('div', 'nrm-block__head');
      head.appendChild(el('h3', 'nrm-block__title', section.title));
      var count = el('span', 'nrm-block__count');
      head.appendChild(count);
      block.appendChild(head);
      if (section.hint) block.appendChild(el('p', 'nrm-block__hint', section.hint));
      var list = el('div', 'nrm-rows');
      section.rows.forEach(function (row) { list.appendChild(renderRow(row)); });
      block.appendChild(list);
      box.appendChild(block);
      sectionParts.push({ section: section, count: count });
    });

    var fill = N.fillBar(task);
    fill.node.classList.add('nrm-fillbar--sticky');
    box.appendChild(fill.node);

    function renderRow(row) {
      var card = el('div', 'nrm-row');
      card.id = N.anchorId(task, row.id);
      var head = el('div', 'nrm-row__head');
      head.appendChild(el('span', 'nrm-row__label', row.label));
      if (row.evidence) {
        var badge = el('span', 'nrm-row__badge', '¶');
        badge.title = 'Нужно доказательство из текста';
        badge.setAttribute('aria-label', 'Нужно доказательство из текста');
        head.appendChild(badge);
      }
      card.appendChild(head);
      if (row.note) card.appendChild(el('p', 'nrm-row__note', row.note));

      var choice = N.chipGroup(row.options, row.label, function (i) {
        var a = response[row.id];
        a.c = a.c === i ? null : i;
        if (!R.needsFollowUp(row, a)) a.f = [];
        changed();
      }, false);
      card.appendChild(choice.node);

      var follow = null;
      if (row.followUp) {
        follow = { wrap: el('div', 'nrm-follow') };
        follow.wrap.appendChild(el('p', 'nrm-follow__label', row.followUp.label));
        follow.group = N.chipGroup(row.followUp.options, row.followUp.label, function (j) {
          var a = response[row.id];
          a.f = a.f.indexOf(j) === -1 ? a.f.concat(j).sort(function (x, y) { return x - y; }) : a.f.filter(function (x) { return x !== j; });
          changed();
        }, true);
        follow.wrap.appendChild(follow.group.node);
        card.appendChild(follow.wrap);
      }

      var ev = null;
      if (row.evidence) {
        ev = { wrap: el('div', 'nrm-ev'), btn: el('button', 'btn btn--ghost btn--sm nrm-ev__btn'), list: el('div', 'nrm-ev__list'), panel: null };
        ev.btn.type = 'button';
        ev.btn.setAttribute('aria-expanded', 'false');
        ev.btn.addEventListener('click', function () { toggleEvidence(row); });
        ev.wrap.appendChild(ev.btn);
        ev.wrap.appendChild(ev.list);
        card.appendChild(ev.wrap);
      }
      parts[row.id] = { card: card, choice: choice, follow: follow, ev: ev };
      return card;
    }

    /** Раскрывает под строкой текст норм с нажимаемыми фрагментами. */
    function toggleEvidence(row) {
      var previous = openEvidence;
      if (previous) closeEvidence(previous);
      if (previous === row) { paint(); return; }
      var p = parts[row.id];
      var panel = el('div', 'nrm-ev__panel');
      var max = row.evidence.max || R.DEFAULT_EVIDENCE_MAX;
      panel.appendChild(el('p', 'nrm-ev__hint', 'Нажмите фрагменты, на которых основан вывод (не больше ' + max + '). Повторное нажатие снимает отметку.'));
      var legal = N.renderLegal(task, { onFragment: function (id) { toggleFragment(row, id); } });
      panel.appendChild(legal.node);
      var status = el('p', 'nrm-ev__status');
      status.setAttribute('aria-live', 'polite');
      panel.appendChild(status);
      var done = el('button', 'btn btn--primary btn--sm', 'Готово');
      done.type = 'button';
      done.addEventListener('click', function () {
        closeEvidence(row);
        paint();
        p.ev.btn.focus({ preventScroll: true });
      });
      panel.appendChild(done);
      p.ev.wrap.appendChild(panel);
      p.ev.panel = { node: panel, fragments: legal.fragments, status: status };
      openEvidence = row;
      paint();
    }

    function closeEvidence(row) {
      var p = parts[row.id];
      if (p.ev.panel) p.ev.panel.node.remove();
      p.ev.panel = null;
      if (openEvidence === row) openEvidence = null;
    }

    function toggleFragment(row, id) {
      var a = response[row.id];
      var max = row.evidence.max || R.DEFAULT_EVIDENCE_MAX;
      var panel = parts[row.id].ev.panel;
      if (a.e.indexOf(id) !== -1) a.e = a.e.filter(function (x) { return x !== id; });
      else if (a.e.length < max) a.e = a.e.concat(id);
      else {
        if (panel) panel.status.textContent = 'Можно отметить не больше ' + max + ' фрагментов. Снимите лишний.';
        return;
      }
      changed();
    }

    function changed() {
      paint();
      ctx.onChange(JSON.parse(JSON.stringify(response)));
    }

    function paint() {
      var filled = 0;
      var firstEmpty = null;
      rows.forEach(function (row) {
        var a = response[row.id];
        var p = parts[row.id];
        var complete = R.rowIsComplete(row, a);
        if (complete) filled++;
        else if (!firstEmpty) firstEmpty = row.id;
        p.card.classList.toggle('is-filled', complete);
        p.card.classList.toggle('is-active', openEvidence === row);
        p.choice.paint(a.c);
        if (p.follow) {
          p.follow.wrap.hidden = !R.needsFollowUp(row, a);
          p.follow.group.paint(a.f);
        }
        if (p.ev) {
          var max = row.evidence.max || R.DEFAULT_EVIDENCE_MAX;
          var open = openEvidence === row;
          p.ev.btn.textContent = open ? 'Свернуть текст' : (a.e.length ? 'Изменить доказательство (' + a.e.length + ' из ' + max + ')' : 'Отметить в тексте');
          p.ev.btn.setAttribute('aria-expanded', String(open));
          p.ev.list.textContent = '';
          a.e.forEach(function (id) { p.ev.list.appendChild(el('span', 'nrm-ev__tag', N.quote(N.fragmentText(task, id)))); });
          if (p.ev.panel) {
            Object.keys(p.ev.panel.fragments).forEach(function (id) {
              var on = a.e.indexOf(id) !== -1;
              p.ev.panel.fragments[id].classList.toggle('is-ev', on);
              p.ev.panel.fragments[id].setAttribute('aria-pressed', String(on));
            });
            p.ev.panel.status.textContent = 'Отмечено: ' + a.e.length + ' из ' + max + '.';
          }
        }
      });
      sectionParts.forEach(function (s) {
        var done = s.section.rows.filter(function (row) { return R.rowIsComplete(row, response[row.id]); }).length;
        s.count.textContent = done + ' из ' + s.section.rows.length;
        s.count.classList.toggle('is-done', done === s.section.rows.length);
      });
      fill.update(filled, rows.length, firstEmpty);
    }

    container.textContent = '';
    container.appendChild(box);
    paint();

    return {
      set: function (next) {
        response = copyResponse(task, next);
        paint();
      }
    };
  }

  /* ---------- Разбор ---------- */

  function renderReview(container, task, ctx) {
    var result = ctx.result && ctx.result.verdict !== 'unanswered' ? ctx.result : null;
    var response = result ? copyResponse(task, result.response) : null;
    var details = result && result.details ? result.details.rows : null;

    var box = el('div', 'nrm-grid is-review');
    var notice = N.demoNotice(task);
    if (notice) box.appendChild(notice);

    var legal = N.renderLegal(task, { refsCollapsed: true });
    rowsOf(task).forEach(function (row) {
      if (!row.evidence) return;
      row.evidence.key.forEach(function (id) {
        if (legal.fragments[id]) legal.fragments[id].classList.add('is-key');
      });
    });
    box.appendChild(legal.node);
    box.appendChild(el('p', 'nrm-legend', 'Подчёркнуты фрагменты, которые служат доказательством в эталоне.'));

    task.sections.forEach(function (section) {
      var block = el('section', 'nrm-block');
      var head = el('div', 'nrm-block__head');
      head.appendChild(el('h3', 'nrm-block__title', section.title));
      if (details) {
        var earned = 0;
        var max = 0;
        section.rows.forEach(function (row) {
          var d = details[row.id];
          earned += d.choicePoints + (d.evidencePoints || 0);
          max += 1 + (row.evidence ? 1 : 0);
        });
        head.appendChild(el('span', 'nrm-block__count' + (earned >= max ? ' is-done' : ''), N.fmt(earned) + ' из ' + max));
      }
      block.appendChild(head);
      var list = el('div', 'nrm-rows');
      section.rows.forEach(function (row) {
        list.appendChild(N.rowReview(task, row, response && response[row.id], details && details[row.id]));
      });
      block.appendChild(list);
      box.appendChild(block);
    });

    container.textContent = '';
    container.appendChild(box);
  }

  /** Компактный результат над разбором. */
  function feedbackSummary(container, task, result) {
    var details = result.details ? result.details.rows : null;
    N.summary(container, task, result, N.rowMistakes(rowsOf(task), details));
  }

  ui.views.register('analysis-grid', {
    hint: function () {
      return 'Выберите значение в каждой строке. В строках со значком ¶ нажмите «Отметить в тексте» и выберите фрагменты нормы.';
    },
    render: render,
    renderReview: renderReview,
    feedbackSummary: feedbackSummary
  });
})(typeof window !== 'undefined' ? window : globalThis);
