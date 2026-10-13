/**
 * Упрощённый тренажёр «Классификация правовых норм» (трек PR, тема LAW-NKL): общие части всех серий.
 * Подключается к странице olympiad-nrm-simple.html после work/law-nrm/classify.js и до файлов серий.
 *
 * Основания классификации и варианты ответов, сборка строки и задания, стабильное перемешивание
 * вариантов (mixOptions) и общие объяснения ошибок по сфере действия. Тип analysis-grid, строки без
 * доказательств: один правильный ответ — один балл (правило components).
 *
 * Варианты перемешиваются в данных: порядок стабилен и свой для каждого задания и основания,
 * поэтому правильный ответ не стоит систематически на одной позиции. Общий механизм row.shuffle
 * не используется: при двух вариантах он всегда меняет их местами (см. nrm-common.js).
 */
(function (root) {
  'use strict';

  var OLY = root.OLY;
  var branchRow = OLY.nrmClassify.branchRow;

  var CHECKED = '2026-10-12';
  /** Пометка о сверке по умолчанию (серия 1); задание может передать свою verification. */
  var UNVERIFIED = 'Официальные источники недоступны из окружения разработки. Текст приведён по памяти редакций, действующих на дату проверки; требуется сверка с официальным опубликованием (pravo.gov.ru).';

  /* Основания классификации: подпись строки, краткое имя для навигации, варианты. */
  var NATURE = { label: 'По характеру регулируемых отношений', short: 'Отношения', options: ['Материальная', 'Процессуальная'] };
  var METHOD = { label: 'По способу установления правил поведения', short: 'Способ', options: ['Императивная', 'Диспозитивная', 'Поощрительная'] };
  var MEANS = { label: 'По средствам регулирования', short: 'Средства', options: ['Обязывающая', 'Запрещающая', 'Управомочивающая'] };
  var FUNCTION = { label: 'По выполняемым функциям', short: 'Функция', options: ['Регулятивная', 'Охранительная'] };
  var TIME = { label: 'По времени действия', short: 'Время', options: ['Постоянная', 'Временная'] };
  var PERSONS = { label: 'По кругу лиц', short: 'Круг лиц', options: ['Общая', 'Специальная'] };
  var SPHERE = { label: 'По сфере действия', short: 'Сфера', options: ['Федеральная', 'Региональная', 'Местная', 'Локальная'] };
  var SUBJECT_LABEL = 'По предмету регулирования';

  /** Строка основания: id, номер в задании, ключ (текст варианта), объяснения. */
  function row(id, n, basis, key, wrong, explanation) {
    return {
      id: id, short: basis.short, label: n + '. ' + basis.label,
      options: basis.options.slice(), key: [basis.options.indexOf(key)],
      wrong: wrong, explanation: explanation
    };
  }

  function subject(n, opts) {
    opts.id = 'branch';
    opts.label = n + '. ' + SUBJECT_LABEL;
    var r = branchRow(opts);
    r.short = 'Предмет';
    return r;
  }

  /** Стабильное псевдослучайное число из строки (FNV-1a). */
  function hash(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  }

  /**
   * Перемешивает варианты строки (Фишер — Йетс с генератором, засеянным id задания и строки)
   * и пересчитывает номера в key и wrong. Содержание вариантов и объяснений не меняется.
   */
  function mixOptions(taskId, r) {
    var order = r.options.map(function (o, i) { return i; });
    var seed = hash(taskId + '/' + r.id);
    for (var i = order.length - 1; i > 0; i--) {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      var j = (seed >>> 16) % (i + 1);
      var t = order[i]; order[i] = order[j]; order[j] = t;
    }
    var wrong = {};
    order.forEach(function (from, to) { if (r.wrong[from] !== undefined) wrong[to] = r.wrong[from]; });
    r.options = order.map(function (from) { return r.options[from]; });
    r.key = r.key.map(function (k) { return order.indexOf(k); });
    r.wrong = wrong;
    return r;
  }

  function task(fields) {
    var base = {
      olympiad: 'PR', subject: 'social', discipline: 'LAW', section: 'theory', topic: 'LAW-NKL',
      draft: true,
      verification: { status: 'unconfirmed', checked: CHECKED, note: UNVERIFIED },
      type: 'analysis-grid'
    };
    Object.keys(fields).forEach(function (k) { base[k] = fields[k]; });
    var rows = base.sections[0].rows;
    rows.forEach(function (r) { mixOptions(base.id, r); });
    base.scoring = { maxPoints: rows.length, rule: 'components', basis: 'author' };
    return base;
  }

  function sections(rows) {
    return [{
      id: 'classify', title: 'Классификация',
      rows: rows
    }];
  }

  /* Повторяющиеся объяснения ошибок по сфере действия. */
  function sphereWrong(act, extra) {
    var w = {
      1: 'Региональные нормы содержатся в конституциях (уставах), законах и иных актах субъектов РФ и действуют только на их территории. ' + act + ' принят на федеральном уровне.',
      2: 'Местные нормы устанавливают органы местного самоуправления, и действуют они в пределах муниципального образования. ' + act + ' — акт Российской Федерации, а не муниципалитета.',
      3: 'Локальные нормы принимают организации — например, правила внутреннего трудового распорядка работодателя — и действуют они только внутри организации. ' + act + ' обращён ко всем, кто находится на территории России.'
    };
    Object.keys(extra || {}).forEach(function (k) { w[k] = extra[k]; });
    return w;
  }

  /** Основание 9 задаётся только у специализированных норм (серия 2, № 16–20). */
  var ROLE = { label: 'По роли в правовой системе', short: 'Роль', options: ['Учредительная', 'Декларативная', 'Дефинитивная', 'Коллизионная', 'Оперативная', 'Каучуковая'] };

  OLY.nkl = {
    CHECKED: CHECKED,
    NATURE: NATURE, METHOD: METHOD, MEANS: MEANS, FUNCTION: FUNCTION, TIME: TIME,
    PERSONS: PERSONS, SPHERE: SPHERE, ROLE: ROLE,
    row: row, subject: subject, task: task, sections: sections, sphereWrong: sphereWrong,
    mixOptions: mixOptions
  };
})(typeof window !== 'undefined' ? window : globalThis);
