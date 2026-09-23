/**
 * Отрисовка задания: суждения (для выбора или с разбором) и блок с баллами.
 * Используется и на экране задания, и на экране итогов.
 */
(function () {
  'use strict';

  var EGE = window.EGE;
  var scoring = EGE.scoring;

  var STATUS_LABELS = {
    hit: 'Верное — вы выбрали',
    missed: 'Верное — вы пропустили',
    wrong: 'Неверное — выбрано лишнее',
    skip: 'Неверное — вы не выбрали'
  };

  var POINTS_CAPTIONS = [
    'Две ошибки и больше',
    'Одна ошибка',
    'Ответ полностью верный'
  ];

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  /** Подпись темы задания: «Раздел · Тема». */
  function topicLabel(task) {
    var section = EGE.getSection(task.section);
    var topic = EGE.getTopic(task.topic);
    return section.title + ' · ' + topic.title;
  }

  /** Цветной ярлык темы задания. */
  function topicChip(task, small) {
    var chip = el('span', small ? 'chip chip--sm' : 'chip', topicLabel(task));
    chip.style.setProperty('--topic-color', EGE.getSection(task.section).color);
    return chip;
  }

  function statusOf(statement, isChosen) {
    if (statement.correct) return isChosen ? 'hit' : 'missed';
    return isChosen ? 'wrong' : 'skip';
  }

  /**
   * Заполняет список суждений.
   * options.answer — засчитанный ответ: суждения показываются с разбором, выбор недоступен.
   * Иначе суждения — кнопки-флажки: options.selected — отмеченные номера,
   * options.onToggle(number) — обработчик нажатия.
   */
  function renderStatements(list, task, options) {
    var answer = options.answer || null;
    var chosen = new Set(answer ? answer.selected : options.selected || []);

    list.textContent = '';
    list.classList.toggle('is-answered', !!answer);

    task.statements.forEach(function (statement, i) {
      var number = i + 1;
      var isChosen = chosen.has(number);
      var li = el('li', 'statement');
      li.dataset.number = String(number);

      var btn = el('button', 'statement__btn');
      btn.type = 'button';
      btn.appendChild(el('span', 'statement__num', String(number)));
      btn.appendChild(el('span', 'statement__text', statement.text));
      btn.appendChild(el('span', 'statement__check'));
      li.appendChild(btn);

      if (answer) {
        var status = statusOf(statement, isChosen);
        btn.disabled = true;
        btn.setAttribute('aria-label', number + '. ' + statement.text + ' — ' + STATUS_LABELS[status]);
        li.classList.add('status-' + status);

        var details = el('div', 'statement__details');
        details.appendChild(el('span', 'statement__tag', STATUS_LABELS[status]));
        details.appendChild(el('p', 'statement__explanation', statement.explanation));
        li.appendChild(details);
      } else {
        btn.setAttribute('role', 'checkbox');
        btn.setAttribute('aria-checked', String(isChosen));
        li.classList.toggle('is-selected', isChosen);
        if (options.onToggle) {
          btn.addEventListener('click', function () { options.onToggle(number); });
        }
      }

      list.appendChild(li);
    });
  }

  /** Отмечает или снимает отметку с суждения в режиме выбора. */
  function setStatementSelected(list, number, isOn) {
    var li = list.querySelector('[data-number="' + number + '"]');
    if (!li) return;
    li.classList.toggle('is-selected', isOn);
    li.querySelector('.statement__btn').setAttribute('aria-checked', String(isOn));
  }

  /** Заполняет блок «баллы + правильный ответ + ответ ученика». */
  function renderFeedback(parts, answer) {
    parts.points.textContent = '';
    parts.points.className = 'points points--' + answer.points;
    parts.points.appendChild(el('span', 'points__value', answer.points + ' ' + scoring.pluralPoints(answer.points)));
    parts.points.appendChild(el('span', 'points__caption', POINTS_CAPTIONS[answer.points]));
    parts.correct.textContent = scoring.formatAnswer(answer.correct);
    parts.user.textContent = scoring.formatAnswer(answer.selected);
  }

  /** Создаёт новый блок с баллами (для экрана итогов). */
  function createFeedback(answer) {
    var box = el('div', 'feedback feedback--static');
    var head = el('div', 'feedback__head');
    var points = el('div', 'points');
    var answers = el('div', 'feedback__answers');

    var rowCorrect = el('div');
    rowCorrect.appendChild(el('span', 'muted', 'Правильный ответ: '));
    var correct = el('strong');
    rowCorrect.appendChild(correct);

    var rowUser = el('div');
    rowUser.appendChild(el('span', 'muted', 'Ваш ответ: '));
    var user = el('strong');
    rowUser.appendChild(user);

    answers.appendChild(rowCorrect);
    answers.appendChild(rowUser);
    head.appendChild(points);
    head.appendChild(answers);
    box.appendChild(head);

    renderFeedback({ points: points, correct: correct, user: user }, answer);
    return box;
  }

  EGE.taskView = {
    el: el,
    topicLabel: topicLabel,
    topicChip: topicChip,
    renderStatements: renderStatements,
    setStatementSelected: setStatementSelected,
    renderFeedback: renderFeedback,
    createFeedback: createFeedback
  };
})();
