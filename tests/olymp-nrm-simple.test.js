'use strict';

/**
 * Упрощённый тренажёр «Классификация правовых норм» (тема LAW-NKL, страница olympiad-nrm-simple.html):
 * страница собрана генератором; серия 1 — пять норм (35 вопросов), серия 2 — нормы № 6–20
 * (15 норм, 76 вопросов): согласованные ключи, всего 20 норм и 111 баллов,
 * один вопрос — один балл, у каждого варианта есть объяснение, тренажёр не попадает в публикуемый банк
 * и в рабочий банк углублённого практикума LAW-NRM.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadBank, pageScripts } = require('./helpers/olymp.js');
const { build } = require('../scripts/build-demo-page.js');

const root = path.join(__dirname, '..');
const PAGE = 'olympiad-nrm-simple.html';
const simple = () => loadBank(PAGE);
const series = (OLY) => OLY.sortByOrder(OLY.tasks.filter((t) => t.topic === 'LAW-NKL' && t.olympiad === 'PR'));

/** Согласованные ключи: id строки → правильный вариант. */
const KEYS = {
  'PR-LAW-NKL-001': { branch: 'Конституционное право', nature: 'Материальная', method: 'Императивная', means: 'Обязывающая', function: 'Регулятивная', time: 'Постоянная', persons: 'Общая', sphere: 'Федеральная' },
  'PR-LAW-NKL-002': { branch: 'Гражданское право', nature: 'Материальная', method: 'Диспозитивная', means: 'Обязывающая', function: 'Регулятивная', time: 'Постоянная', sphere: 'Федеральная' },
  'PR-LAW-NKL-003': { branch: 'Семейное право', nature: 'Материальная', method: 'Императивная', means: 'Обязывающая', function: 'Регулятивная', time: 'Постоянная', sphere: 'Федеральная' },
  'PR-LAW-NKL-004': { branch: 'Трудовое право', nature: 'Материальная', method: 'Императивная', means: 'Запрещающая', function: 'Регулятивная', time: 'Постоянная', sphere: 'Федеральная' },
  'PR-LAW-NKL-005': { branch: 'Гражданское процессуальное право', nature: 'Процессуальная', means: 'Управомочивающая', function: 'Регулятивная', time: 'Постоянная', sphere: 'Федеральная' },
  // Серия 2 — по утверждённой спецификации proposals/LAW-NKL-SERIES-2-SPEC.md.
  'PR-LAW-NKL-006': { branch: 'Гражданское право', nature: 'Материальная', means: 'Управомочивающая', function: 'Регулятивная', time: 'Постоянная', sphere: 'Федеральная' },
  'PR-LAW-NKL-007': { branch: 'Гражданское право', nature: 'Материальная', method: 'Диспозитивная', function: 'Регулятивная', time: 'Постоянная', sphere: 'Федеральная' },
  'PR-LAW-NKL-008': { branch: 'Гражданское процессуальное право', nature: 'Процессуальная', method: 'Императивная', means: 'Обязывающая', function: 'Регулятивная', time: 'Постоянная', sphere: 'Федеральная' },
  'PR-LAW-NKL-009': { branch: 'Уголовное право', nature: 'Материальная', method: 'Императивная', function: 'Охранительная', time: 'Постоянная', sphere: 'Федеральная' },
  'PR-LAW-NKL-010': { branch: 'Административное право', nature: 'Материальная', method: 'Императивная', function: 'Охранительная', time: 'Постоянная', sphere: 'Федеральная' },
  'PR-LAW-NKL-011': { branch: 'Трудовое право', nature: 'Материальная', method: 'Поощрительная', function: 'Регулятивная', time: 'Постоянная', sphere: 'Федеральная' },
  'PR-LAW-NKL-012': { branch: 'Трудовое право', nature: 'Материальная', method: 'Императивная', means: 'Управомочивающая', function: 'Регулятивная', time: 'Постоянная', sphere: 'Федеральная' },
  'PR-LAW-NKL-013': { function: 'Регулятивная', time: 'Временная', sphere: 'Федеральная' },
  'PR-LAW-NKL-014': { nature: 'Материальная', method: 'Императивная', means: 'Запрещающая', function: 'Регулятивная', time: 'Постоянная', sphere: 'Региональная' },
  'PR-LAW-NKL-015': { nature: 'Материальная', method: 'Императивная', means: 'Обязывающая', function: 'Регулятивная', time: 'Постоянная', sphere: 'Локальная' },
  'PR-LAW-NKL-016': { time: 'Постоянная', sphere: 'Федеральная', role: 'Дефинитивная' },
  'PR-LAW-NKL-017': { branch: 'Конституционное право', time: 'Постоянная', sphere: 'Федеральная', role: 'Декларативная' },
  'PR-LAW-NKL-018': { branch: 'Конституционное право', time: 'Постоянная', sphere: 'Федеральная', role: 'Учредительная' },
  'PR-LAW-NKL-019': { branch: 'Гражданское право', time: 'Постоянная', sphere: 'Федеральная', role: 'Коллизионная' },
  'PR-LAW-NKL-020': { sphere: 'Федеральная', role: 'Оперативная' }
};

const TEXTS = {
  'PR-LAW-NKL-001': 'Каждый обязан платить законно установленные налоги и сборы.',
  'PR-LAW-NKL-002': 'Собственник несет бремя содержания принадлежащего ему имущества, если иное не предусмотрено законом или договором.',
  'PR-LAW-NKL-003': 'Родители обязаны содержать своих несовершеннолетних детей.',
  'PR-LAW-NKL-004': 'Запрещается требовать от работника выполнения работы, не обусловленной трудовым договором, за исключением случаев, предусмотренных настоящим Кодексом и иными федеральными законами.',
  'PR-LAW-NKL-005': 'Истец вправе изменить основание или предмет иска […]',
  'PR-LAW-NKL-006': 'Граждане и юридические лица свободны в заключении договора.',
  'PR-LAW-NKL-007': 'Право собственности у приобретателя вещи по договору возникает с момента ее передачи, если иное не предусмотрено законом или договором.',
  'PR-LAW-NKL-008': 'Каждая сторона должна доказать те обстоятельства, на которые она ссылается как на основания своих требований и возражений, если иное не предусмотрено федеральным законом.',
  'PR-LAW-NKL-009': 'Кража, то есть тайное хищение чужого имущества, - наказывается штрафом в размере до восьмидесяти тысяч рублей или в размере заработной платы или иного дохода осужденного за период до шести месяцев, либо обязательными работами на срок до трехсот шестидесяти часов, либо исправительными работами на срок до одного года, либо ограничением свободы на срок до двух лет, либо принудительными работами на срок до двух лет, либо арестом на срок до четырех месяцев, либо лишением свободы на срок до двух лет.',
  'PR-LAW-NKL-010': 'Превышение установленной скорости движения транспортного средства на величину более 20, но не более 40 километров в час - влечет наложение административного штрафа в размере семисот пятидесяти рублей.',
  'PR-LAW-NKL-011': 'Работодатель поощряет работников, добросовестно исполняющих трудовые обязанности (объявляет благодарность, выдает премию, награждает ценным подарком, почетной грамотой, представляет к званию лучшего по профессии).',
  'PR-LAW-NKL-012': 'Трудовой договор может быть расторгнут работодателем в случаях: 1) ликвидации организации либо прекращения деятельности индивидуальным предпринимателем;',
  'PR-LAW-NKL-013': 'Установить, что до 31 декабря 2026 года включительно Правительство Российской Федерации вправе: 1) в дополнение к случаям, предусмотренным частью 11 статьи 24 Федерального закона от 5 апреля 2013 года N 44-ФЗ "О контрактной системе в сфере закупок товаров, работ, услуг для обеспечения государственных и муниципальных нужд", устанавливать иные случаи применения закрытых конкурентных способов определения поставщиков (подрядчиков, исполнителей), при которых проводятся предусмотренные указанным Федеральным законом закрытые электронные процедуры, приглашение принять участие в которых может быть направлено до 31 декабря 2026 года включительно и при проведении которых информация и документы, содержащиеся в реестре контрактов, заключенных заказчиками, не размещаются на официальном сайте',
  'PR-LAW-NKL-014': 'Помимо случаев, указанных в части 1 настоящей статьи, не допускается совершение действий, нарушающих покой граждан и тишину, при проведении переустройства и (или) перепланировки жилого помещения в многоквартирном доме и (или) нежилого помещения, не являющегося общим имуществом собственников помещений в многоквартирном доме, иных ремонтных работ в данных помещениях с 19 часов до 9 часов и с 13 часов до 15 часов, а также в воскресенье и нерабочие праздничные дни (кроме случаев, когда указанные работы осуществляются в течение полутора лет со дня ввода многоквартирного дома в эксплуатацию).',
  'PR-LAW-NKL-015': 'Все работники Университета обязаны: а) соблюдать устав МГУ и настоящие правила внутреннего распорядка',
  'PR-LAW-NKL-016': 'Для целей настоящего Федерального закона применяются следующие основные понятия: 1) образование - единый целенаправленный процесс воспитания и обучения, являющийся общественно значимым благом и осуществляемый в интересах человека, семьи, общества и государства, а также совокупность приобретаемых знаний, умений, навыков, ценностных установок, опыта деятельности и компетенции определенных объема и сложности в целях интеллектуального, духовно-нравственного, творческого, физического и (или) профессионального развития человека, удовлетворения его образовательных потребностей и интересов;',
  'PR-LAW-NKL-017': 'Человек, его права и свободы являются высшей ценностью.',
  'PR-LAW-NKL-018': 'Государственная власть в Российской Федерации осуществляется на основе разделения на законодательную, исполнительную и судебную. Органы законодательной, исполнительной и судебной власти самостоятельны.',
  'PR-LAW-NKL-019': 'В случае противоречия указа Президента Российской Федерации или постановления Правительства Российской Федерации настоящему Кодексу или иному закону применяется настоящий Кодекс или соответствующий закон.',
  'PR-LAW-NKL-020': 'Настоящий Федеральный закон вступает в силу со дня его официального опубликования.'
};

const ROLE_OPTIONS = ['Учредительная', 'Декларативная', 'Дефинитивная', 'Коллизионная', 'Оперативная', 'Каучуковая'];

const rowsOf = (task) => task.sections.flatMap((s) => s.rows);

test('olympiad-nrm-simple.html совпадает с результатом scripts/build-demo-page.js', () => {
  const html = fs.readFileSync(path.join(root, PAGE), 'utf8');
  assert.equal(html, build('simple'), 'Запустите node scripts/build-demo-page.js');
});

test('Тренажёр не подключён к основной, демо- и рабочей страницам', () => {
  for (const page of ['olympiad.html', 'olympiad-demo.html', 'olympiad-work.html']) {
    assert.ok(!pageScripts(page).some((s) => s.startsWith('work/law-nrm-simple/')), page);
  }
  assert.equal(loadBank().tasks.filter((t) => t.topic === 'LAW-NKL').length, 0);
  // На странице тренажёра нет заданий углублённого практикума.
  assert.equal(simple().tasks.filter((t) => /^LAW-NR[MA-D]$/.test(t.topic)).length, 0);
});

test('Серии 1–2: 20 норм по порядку, согласованные ключи, 111 вопросов — 111 баллов', () => {
  const OLY = simple();
  const tasks = series(OLY);
  assert.deepEqual(tasks.map((t) => t.id), Object.keys(KEYS));
  // Порядок показа совпадает с номерами спецификации: задание № N стоит N-м и имеет id …-0NN.
  assert.deepEqual(tasks.map((t) => t.order), Array.from({ length: 20 }, (_, i) => i + 1));
  tasks.forEach((t) => assert.equal(Number(t.id.slice(-3)), t.order, t.id));
  let total = 0;
  for (const task of tasks) {
    assert.equal(task.type, 'analysis-grid', task.id);
    assert.equal(task.draft, true, task.id);
    assert.equal(task.verification.status, 'unconfirmed', task.id);
    assert.equal(task.legal[0].fragments.map((f) => f.text).join(''), TEXTS[task.id], task.id);
    assert.ok(task.legal.every((b) => b.verified === false), task.id + ': текст не объявлен сверенным');
    assert.ok(task.verification.note && task.verification.checked, task.id + ': пометка о сверке');
    const rows = rowsOf(task);
    const keys = Object.fromEntries(rows.map((r) => [r.id, r.options[r.key[0]]]));
    assert.deepEqual(keys, KEYS[task.id], task.id);
    rows.forEach((r, i) => {
      assert.equal(r.key.length, 1, task.id + '/' + r.id);
      assert.ok(!r.evidence && !r.followUp && !r.partial && !r.multi, task.id + '/' + r.id + ': только простой выбор');
      assert.ok(r.label.startsWith(i + 1 + '. По '), task.id + '/' + r.id + ': нумерация оснований');
    });
    assert.equal(task.scoring.maxPoints, rows.length, task.id);
    total += task.scoring.maxPoints;
  }
  assert.equal(total, 111);
});

test('Проверка: эталон — полный балл, каждая ошибка стоит ровно один балл', () => {
  const OLY = simple();
  for (const task of series(OLY)) {
    const type = OLY.types.get(task.type);
    const correct = type.getCorrect(task);
    const full = OLY.grade.gradeTask(task, type.cleanResponse(task, correct));
    assert.equal(full.verdict, 'correct', task.id);
    assert.equal(full.points, task.scoring.maxPoints, task.id);
    for (const r of rowsOf(task)) {
      const wrong = structuredClone(correct);
      wrong[r.id].c = r.key[0] === 0 ? 1 : 0;
      const g = OLY.grade.gradeTask(task, type.cleanResponse(task, wrong));
      assert.equal(g.points, task.scoring.maxPoints - 1, task.id + '/' + r.id);
      assert.equal(g.verdict, 'partial', task.id + '/' + r.id);
    }
  }
});

test('Объяснения: у правильного ответа и у каждого неверного варианта', () => {
  const OLY = simple();
  for (const task of series(OLY)) {
    assert.ok(task.explanation.length > 100 && task.typicalMistake, task.id);
    for (const r of rowsOf(task)) {
      assert.ok(r.explanation.length >= 200, task.id + '/' + r.id + ': объяснение слишком короткое');
      r.options.forEach((option, i) => {
        if (r.key.includes(i)) return;
        assert.ok(OLY.nrmRows.explanation(r.wrong[i]), task.id + '/' + r.id + ': нет объяснения для «' + option + '»');
      });
    }
  }
});

test('Основание «По способу установления правил поведения»: три варианта, включая «Поощрительная»', () => {
  for (const task of series(simple())) {
    const method = rowsOf(task).find((r) => r.id === 'method');
    if (method) assert.deepEqual([...method.options].sort(), ['Диспозитивная', 'Императивная', 'Поощрительная'], task.id);
  }
});

test('Ст. 80 СК: вопрос «По кругу лиц» вне автоматической проверки, строка сохранена в резерве', () => {
  const OLY = simple();
  const task = OLY.getTask('PR-LAW-NKL-003');
  assert.ok(!rowsOf(task).some((r) => r.id === 'persons'));
  const deferred = OLY.nrmSimpleDeferred['PR-LAW-NKL-003'];
  assert.equal(deferred.length, 1);
  assert.equal(deferred[0].options[deferred[0].key[0]], 'Специальная');
});

test('Перемешивание: правильный ответ не стоит систематически на одной позиции', () => {
  const OLY = simple();
  const positions = [];
  const positions2 = [];
  for (const task of series(OLY)) {
    const own = rowsOf(task).map((r) => OLY.ui.nrm.displayOrder(task, r).indexOf(r.key[0]));
    // Двухвариантные строки: правильный ответ встречается и первым, и вторым.
    positions2.push(...rowsOf(task).filter((r) => r.options.length === 2).map((r) => r.key[0]));
    // В задании правильные ответы не все на одной и той же позиции.
    assert.ok(new Set(own).size > 1, task.id + ': ' + own.join(','));
    positions.push(...own);
  }
  // По серии ни одна позиция не занимает больше половины правильных ответов.
  const counts = {};
  positions.forEach((p) => { counts[p] = (counts[p] || 0) + 1; });
  assert.ok(Math.max(...Object.values(counts)) <= positions.length / 2, JSON.stringify(counts));
  const first = positions2.filter((p) => p === 0).length;
  assert.ok(first >= positions2.length / 3 && first <= positions2.length * 2 / 3, 'двухвариантные: первым ' + first + ' из ' + positions2.length);
});

test('Тема: своё описание на старте и свёрнутые комментарии; у других тем настройки нет', () => {
  const OLY = simple();
  const topic = OLY.getTopic('social', 'LAW-NKL');
  assert.equal(topic.description, 'В каждом задании вам предстоит классифицировать правовую норму по нескольким основаниям. После проверки вы получите подробный разбор каждого ответа. В заданиях используется единая учебная классификация правовых норм. В юридической литературе отдельные нормы могут относиться к разным категориям в зависимости от принятого подхода. В таких случаях объяснения раскрывают логику классификации, используемой в практикуме.');
  assert.equal(topic.collapsedFeedback, true);
  for (const id of ['LAW-CPT', 'LAW-NRM', 'LAW-NRA', 'LAW-NRB', 'LAW-NRC', 'LAW-NRD']) {
    const other = OLY.getTopic('social', id);
    assert.equal(other.collapsedFeedback, undefined, id);
    assert.equal(other.description, undefined, id);
  }
});

test('Ст. 57: постоянный характер объяснён отсутствием срока, без довода о бюджете', () => {
  const time = rowsOf(simple().getTask('PR-LAW-NKL-001')).find((r) => r.id === 'time');
  assert.ok(!/бюджет/.test(time.explanation));
  assert.match(time.explanation, /срок её действия заранее не ограничен/);
});

test('Серия 2: основание 9 — только в № 16–20, шесть вариантов, «Каучуковая» не бывает ключом', () => {
  for (const task of series(simple())) {
    const role = rowsOf(task).find((r) => r.id === 'role');
    const n = Number(task.id.slice(-3));
    if (n < 16) { assert.equal(role, undefined, task.id); continue; }
    assert.deepEqual([...role.options].sort(), [...ROLE_OPTIONS].sort(), task.id);
    assert.notEqual(role.options[role.key[0]], 'Каучуковая', task.id);
    assert.ok(OLY_explanation(role, 'Каучуковая'), task.id + ': объяснение для «Каучуковая»');
  }
});

/** Объяснение неверного варианта по его тексту. */
function OLY_explanation(row, option) {
  const w = row.wrong[row.options.indexOf(option)];
  return typeof w === 'string' ? w : w && w.short;
}

test('Серия 2: основание «По кругу лиц» не задаётся; № 13 помечен для повторной проверки в 2027 году', () => {
  const tasks = series(simple());
  for (const task of tasks.filter((t) => Number(t.id.slice(-3)) >= 6)) {
    assert.ok(!rowsOf(task).some((r) => r.id === 'persons'), task.id);
  }
  const n13 = tasks.find((t) => t.id === 'PR-LAW-NKL-013');
  assert.match(n13.verification.note, /2027/);
  for (const t of tasks.filter((x) => /-01[34]$/.test(x.id))) {
    assert.match(t.verification.note, /передан преподавателем/, t.id);
    assert.match(t.verification.note, /официальное опубликование не проверено/, t.id);
  }
});

test('Ученический интерфейс: без плашки и пометок о сверке, текст нормы вместо заголовка; статус сверки сохранён в данных', () => {
  const html = fs.readFileSync(path.join(root, PAGE), 'utf8');
  assert.ok(!html.includes('nrm-demo-banner') && !html.includes('nrm-demo-reset'), 'плашки нет');
  // Страницы углублённого практикума — с прежними плашками.
  for (const page of ['olympiad-work.html', 'olympiad-demo.html']) {
    assert.ok(fs.readFileSync(path.join(root, page), 'utf8').includes('nrm-demo-banner'), page);
  }
  const OLY = simple();
  const topic = OLY.getTopic('social', 'LAW-NKL');
  assert.equal(topic.hideVerificationNotes, true);
  assert.equal(topic.normAsHeading, true);
  for (const id of ['LAW-CPT', 'LAW-NRM', 'LAW-NRA', 'LAW-NRB', 'LAW-NRC', 'LAW-NRD']) {
    const other = OLY.getTopic('social', id);
    assert.equal(other.hideVerificationNotes, undefined, id);
    assert.equal(other.normAsHeading, undefined, id);
  }
  // Удаление пометок не означает завершённой сверки: данные о статусе остаются в каждом задании.
  for (const task of series(OLY)) {
    assert.equal(task.verification.status, 'unconfirmed', task.id);
    assert.ok(task.legal.every((b) => b.verified === false), task.id);
    // Общая инструкция — на стартовом экране, в задании её нет.
    assert.ok(task.sections.every((s) => s.hint === undefined), task.id);
  }
  assert.match(topic.description, /классифицировать правовую норму по нескольким основаниям/);
});

test('Подсказка о клавишах: часть про 1–9 — отдельный элемент, на всех страницах; ввод цифрами есть у старых типов', () => {
  for (const page of ['olympiad.html', 'olympiad-demo.html', 'olympiad-work.html', PAGE]) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /Клавиши <span id="kbd-hint-digits"><kbd>1<\/kbd>–<kbd>9<\/kbd> выбирают варианты, <\/span><kbd>Enter<\/kbd>/, page);
  }
  const OLY = simple();
  // Задания LAW-CPT (single-select, multiple-select, matching) — с вводом цифрами, подсказка показывается.
  for (const type of ['single-select', 'multiple-select', 'matching']) {
    assert.equal(typeof OLY.ui.views.get(type).keyInput, 'function', type);
  }
  // Классификационная карта ввода цифрами не имеет — часть подсказки про 1–9 скрывается.
  assert.equal(OLY.ui.views.get('analysis-grid').keyInput, undefined);
  // Заголовок задания для экранных чтецов: класс визуального скрытия определён.
  assert.match(fs.readFileSync(path.join(root, 'css/olymp.css'), 'utf8'), /\.visually-hidden \{/);
});
