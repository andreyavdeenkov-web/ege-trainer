/**
 * Олимпиады, интерфейс: разметка структуры нормы (тип text-markup).
 *
 * Решение: ученик выбирает инструмент в палитре (закреплена внизу экрана:
 * «Г», «Д», «С»… и «Стереть») и нажимает фрагменты текста нормы. Метка
 * показывается цветом и буквой (не только цветом). Повторное нажатие тем же
 * инструментом снимает метку. Ниже — строки выбора (карта элементов и т. п.).
 * Клавиатура: фрагменты — кнопки (Tab, Enter / Пробел); инструменты — кнопки.
 *
 * Разбор: компактный результат сверху (общий для новых типов), затем текст
 * с переключателем «Мой ответ / Эталон», карточки элементов структуры
 * (краткая причина ошибки сразу, подробное объяснение — раскрывается) и строки.
 */
(function (root) {
  'use strict';

  var OLY = root.OLY || (root.OLY = {});
  var ui = OLY.ui;
  var R = OLY.nrmRows;
  var M = OLY.textMarkup;
  var N = ui.nrm;
  var el = N.el;

  var ERASE = '__erase';
  var MARKUP_ANCHOR = 'markup';

  function paletteIndex(task, label) {
    for (var i = 0; i < task.palette.length; i++) if (task.palette[i].id === label) return i;
    return -1;
  }

  function paletteItem(task, label) {
    return task.palette[paletteIndex(task, label)];
  }

  function copyResponse(task, response) {
    var marks = {};
    M.markable(task).forEach(function (id) {
      marks[id] = response && response.marks && response.marks[id] ? response.marks[id] : null;
    });
    return { marks: marks, rows: N.copyRows(task.sections || [], response && response.rows) };
  }

  /** Метка на фрагменте: класс цвета и буква. */
  function paintMark(task, node, label, fragmentText) {
    for (var i = 0; i < 6; i++) node.classList.remove('nrm-mark--' + i);
    if (label) {
      var p = paletteItem(task, label);
      node.classList.add('nrm-mark--' + paletteIndex(task, label));
      node.dataset.mark = p.short;
      node.setAttribute('aria-label', fragmentText + ' — ' + p.label);
    } else {
      delete node.dataset.mark;
      node.setAttribute('aria-label', fragmentText + ' — не размечено');
    }
  }

  function legend(task) {
    var box = el('div', 'nrm-legend-marks');
    task.palette.forEach(function (p, i) {
      var item = el('span', 'nrm-legend-marks__item');
      var sw = el('span', 'nrm-swatch nrm-mark--' + i, p.short);
      sw.setAttribute('aria-hidden', 'true');
      item.appendChild(sw);
      item.appendChild(document.createTextNode(p.label));
      box.appendChild(item);
    });
    return box;
  }

  /* ---------- Решение ---------- */

  function render(container, task, ctx) {
    var response = copyResponse(task, ctx.response);
    var tool = task.palette[0].id;
    var fragmentsText = {};
    var box = el('div', 'nrm-grid nrm-markup');
    var notice = N.demoNotice(task);
    if (notice) box.appendChild(notice);

    var markBlock = el('section', 'nrm-block');
    markBlock.id = N.anchorId(task, MARKUP_ANCHOR);
    var head = el('div', 'nrm-block__head');
    head.appendChild(el('h3', 'nrm-block__title', task.markupTitle || 'Разметка текста нормы'));
    var count = el('span', 'nrm-block__count');
    head.appendChild(count);
    markBlock.appendChild(head);
    markBlock.appendChild(el('p', 'nrm-block__hint', task.markupHint ||
      'Выберите инструмент внизу экрана и нажимайте фрагменты текста. Если элемента в тексте нет — не размечайте его. Повторное нажатие тем же инструментом снимает метку.'));
    var mains = task.legal.filter(function (b) { return b.role === 'main'; });
    var legal = N.renderLegal(task, { blocks: mains, onFragment: applyTool });
    Object.keys(legal.fragments).forEach(function (id) { fragmentsText[id] = legal.fragments[id].textContent; });
    markBlock.appendChild(legal.node);
    markBlock.appendChild(legend(task));
    var refs = task.legal.filter(function (b) { return b.role === 'reference'; });
    if (refs.length) markBlock.appendChild(N.renderLegal(task, { blocks: refs, refsCollapsed: true }).node);
    box.appendChild(markBlock);

    var sections = N.rowSections(task, task.sections || [], response.rows, changed);
    sections.nodes.forEach(function (n) { box.appendChild(n); });

    // Палитра инструментов закреплена внизу экрана вместе с индикатором заполнения.
    var dock = el('div', 'nrm-dock');
    var tools = el('div', 'nrm-tools');
    tools.setAttribute('role', 'group');
    tools.setAttribute('aria-label', 'Инструмент разметки');
    var toolButtons = {};
    task.palette.concat([{ id: ERASE, label: 'Стереть', short: '⌫', tool: 'стереть' }]).forEach(function (p, i) {
      var b = el('button', 'nrm-tool' + (p.id === ERASE ? ' nrm-tool--erase' : ' nrm-mark--' + i));
      b.type = 'button';
      b.appendChild(el('span', 'nrm-tool__short', p.short));
      // Короткая подпись инструмента (tool) — для узкого экрана, если полное название длинное.
      b.appendChild(el('span', 'nrm-tool__label', p.tool || p.label));
      b.setAttribute('aria-label', p.id === ERASE ? 'Стереть метку' : 'Инструмент: ' + p.label);
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () { tool = p.id; paint(); });
      tools.appendChild(b);
      toolButtons[p.id] = b;
    });
    dock.appendChild(tools);
    var fill = N.fillBar(task);
    dock.appendChild(fill.node);
    box.appendChild(dock);

    function applyTool(id) {
      var current = response.marks[id];
      if (tool === ERASE) response.marks[id] = null;
      else response.marks[id] = current === tool ? null : tool;
      changed();
    }

    function changed() {
      paint();
      ctx.onChange(JSON.parse(JSON.stringify(response)));
    }

    function paint() {
      var marked = 0;
      Object.keys(legal.fragments).forEach(function (id) {
        var label = response.marks[id];
        if (label) marked++;
        paintMark(task, legal.fragments[id], label, fragmentsText[id]);
        legal.fragments[id].setAttribute('aria-pressed', String(!!label));
      });
      Object.keys(toolButtons).forEach(function (id) {
        toolButtons[id].classList.toggle('is-on', id === tool);
        toolButtons[id].setAttribute('aria-pressed', String(id === tool));
      });
      count.textContent = 'размечено ' + marked + ' из ' + Object.keys(legal.fragments).length;
      count.classList.toggle('is-done', marked > 0);
      sections.paint();
      var rows = M.rowsOf(task);
      var filled = (marked > 0 ? 1 : 0);
      var firstEmpty = marked > 0 ? null : MARKUP_ANCHOR;
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
        // Строки читают ответы из того же объекта response.rows — обновляем содержимое, не заменяя объект.
        var fresh = copyResponse(task, next);
        Object.keys(fresh.marks).forEach(function (id) { response.marks[id] = fresh.marks[id]; });
        Object.keys(fresh.rows).forEach(function (id) { response.rows[id] = fresh.rows[id]; });
        paint();
      }
    };
  }

  /* ---------- Разбор ---------- */

  function renderReview(container, task, ctx) {
    var result = ctx.result && ctx.result.verdict !== 'unanswered' ? ctx.result : null;
    var response = result ? copyResponse(task, result.response) : null;
    var details = result && result.details ? result.details : null;
    var correct = OLY.types.get('text-markup').getCorrect(task);

    var box = el('div', 'nrm-grid nrm-markup is-review');
    var notice = N.demoNotice(task);
    if (notice) box.appendChild(notice);

    var block = el('section', 'nrm-block');
    block.id = N.anchorId(task, MARKUP_ANCHOR);
    var head = el('div', 'nrm-block__head');
    head.appendChild(el('h3', 'nrm-block__title', task.markupTitle || 'Разметка текста нормы'));
    if (details) {
      var t = details.components.T;
      head.appendChild(el('span', 'nrm-block__count' + (t.earned >= t.max ? ' is-done' : ''), N.fmt(t.earned) + ' из ' + t.max));
    }
    block.appendChild(head);

    var mains = task.legal.filter(function (b) { return b.role === 'main'; });
    var legal = N.renderLegal(task, { blocks: mains });
    var showMine = !!details;
    var switcher = null;
    if (details) {
      switcher = N.chipGroup(['Мой ответ', 'Эталон'], 'Показать разметку', function (i) { showMine = i === 0; paintText(); }, false);
      switcher.node.classList.add('nrm-switch');
      block.appendChild(switcher.node);
    }
    block.appendChild(legal.node);
    block.appendChild(legend(task));
    var note = el('p', 'nrm-legend');
    block.appendChild(note);

    function paintText() {
      Object.keys(legal.fragments).forEach(function (id) {
        var node = legal.fragments[id];
        var label = showMine ? response.marks[id] : correct.marks[id];
        paintMark(task, node, label, node.textContent);
        var f = details && details.markup.fragments[id];
        node.classList.toggle('is-wrong', !!(showMine && f && f.status !== 'ok'));
        node.classList.toggle('is-alt', !showMine && M.accepted(task, id).length > 1);
      });
      if (switcher) switcher.paint(showMine ? 0 : 1);
      note.textContent = showMine
        ? 'Красной рамкой обведены фрагменты, размеченные неверно или пропущенные.'
        : 'Пунктирной рамкой обведены фрагменты со спорной границей: принимается любая из указанных в разборе меток.';
    }
    paintText();

    var list = el('div', 'nrm-rows');
    task.palette.forEach(function (p, i) {
      list.appendChild(elementReview(task, p, i, details && details.markup.elements[p.id]));
    });
    block.appendChild(list);
    box.appendChild(block);

    N.reviewSections(task, task.sections || [], response && response.rows, details && details.rows)
      .forEach(function (n) { box.appendChild(n); });

    container.textContent = '';
    container.appendChild(box);
  }

  function fragmentsList(task, ids) {
    return ids.map(function (id) { return N.quote(N.fragmentText(task, id)); }).join(', ');
  }

  function paletteLabel(task, id) {
    var item = task.palette.filter(function (p) { return p.id === id; })[0];
    return item ? item.label : id;
  }

  function elementReview(task, p, index, detail) {
    var info = task.markup.elements[p.id];
    var card = el('div', 'nrm-row nrm-rv');
    card.id = N.anchorId(task, 'el-' + p.id);
    var headRow = el('div', 'nrm-row__head');
    var title = el('span', 'nrm-row__label');
    var sw = el('span', 'nrm-swatch nrm-mark--' + index, p.short);
    sw.setAttribute('aria-hidden', 'true');
    title.appendChild(sw);
    title.appendChild(document.createTextNode(' ' + p.label));
    headRow.appendChild(title);
    if (detail) headRow.appendChild(el('span', 'nrm-rv__pts', detail.points + ' из 1'));
    card.appendChild(headRow);

    var keyIds = M.markable(task).filter(function (id) { return M.accepted(task, id).indexOf(p.id) !== -1; });
    var keyLine = keyIds.length ? keyIds.map(function (id) {
      // Спорная граница: фрагмент засчитывается и с другой меткой из списка.
      var others = M.accepted(task, id).filter(function (label) { return label !== p.id; }).map(function (label) {
        return '«' + paletteLabel(task, label) + '»';
      });
      return N.quote(N.fragmentText(task, id)) + (others.length ? ' (спорная граница — засчитывается и ' + others.join(', ') + ')' : '');
    }).join(', ') : 'в тексте нет — не размечается';
    if (detail) {
      card.appendChild(N.answerLine('Разметка: ', detail.status === 'ok' ? 'верно' : 'есть ошибки', detail.status === 'ok' ? 'text-right' : 'text-wrong', detail.status));
      if (detail.status !== 'ok') {
        card.appendChild(N.answerLine('Правильно: ', keyLine, 'text-right'));
        var reason = R.explanation(info.wrong);
        var specifics = [];
        if (detail.missing.length) specifics.push('Не размечено как «' + p.label + '»: ' + fragmentsList(task, detail.missing) + '.');
        if (detail.extra.length) specifics.push('Лишняя метка «' + p.label + '»: ' + fragmentsList(task, detail.extra) + '.');
        card.appendChild(el('p', 'nrm-rv__mistake', specifics.join(' ') + ' ' + reason.short));
        var box = N.more('Подробное объяснение', [reason.full, info.explanation], false);
        if (box) card.appendChild(box);
        card.classList.add('nrm-rv--wrong');
        return card;
      }
      card.classList.add('nrm-rv--ok');
    } else {
      card.appendChild(N.answerLine('Правильно: ', keyLine, 'text-right'));
    }
    var more = N.more('Пояснение', [info.explanation], false);
    if (more) card.appendChild(more);
    return card;
  }

  function feedbackSummary(container, task, result) {
    var d = result.details;
    var mistakes = [];
    if (d) {
      task.palette.forEach(function (p) {
        if (d.markup.elements[p.id].status !== 'ok') mistakes.push({ id: 'el-' + p.id, label: p.label });
      });
      mistakes = mistakes.concat(N.rowMistakes(M.rowsOf(task), d.rows));
    }
    N.summary(container, task, result, mistakes);
  }

  ui.views.register('text-markup', {
    hint: function () {
      return 'Разметьте текст нормы инструментами внизу экрана, затем ответьте на вопросы ниже.';
    },
    render: render,
    renderReview: renderReview,
    feedbackSummary: feedbackSummary
  });
})(typeof window !== 'undefined' ? window : globalThis);
