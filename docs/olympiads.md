# Олимпиады — ядро банка заданий

Отдельное направление платформы для подготовки к олимпиадам по обществознанию (первая — «Высшая проба»). Тренажёр ЕГЭ оно не затрагивает: свой код в `js/olymp/`, своё пространство имён `OLY`, будущие данные — в `data/olympiads/`.

Сейчас готово **ядро без интерфейса** (каталог, типы заданий, проверка ответов, критерии оценивания, попытка) и **пилотные данные** — официальная демоверсия «Высшей пробы» 2026/27, 9 класс, отборочный этап, I тур. Экранов пока нет: `olympiad.html` — заглушка со списком подключаемых скриптов.

## Принципы

- Банк организован по содержанию: **олимпиада → предмет → дисциплина → тема → задания**.
- **Задание не хранит класс, этап, тур и год.** Где оно встречалось (демоверсия, вариант прошлых лет, авторский сборник, номер вопроса, класс, этап, тур, год) — описывает **источник**. Одно задание может входить в несколько источников без дублирования.
- Реестр строит из источников производный **индекс появлений**; по нему работают фильтры класса, этапа, тура и года. Источник истины — ссылки из источников.
- `type` — способ взаимодействия, `scoring` — критерии оценивания. Баллы не выводятся из типа.
- **Критерии могут быть не определены** (`scoring: null`). Тогда ответ проверяется по ключу (верно / неверно), но баллы не начисляются. Правила оценивания не придумываются: в ядре нет ни одного правила, каждое добавляется только по официальным методическим рекомендациям или решению преподавателя.

## Файлы

```
js/olymp/normalize.js       нормализация текстового и числового ответа
js/olymp/types.js           реестр типов заданий и пять типов
js/olymp/scoring-rules.js   реестр правил оценивания (пуст) и проверка критериев
js/olymp/registry.js        предметы, олимпиады, задания, источники, индекс, запросы
js/olymp/grade.js           gradeTask — одна оценка для обоих режимов
js/olymp/attempt.js         попытка: practice и mock
tests/olymp-*.test.js       тесты ядра (на тестовых данных, олимпиада TST)
tests/olymp-bank.test.js    проверка реального банка (загрузка по olympiad.html)
tests/helpers/olymp.js      загрузка ядра и тестовый каталог
olympiad.html               точка входа раздела (пока заглушка) и порядок скриптов

data/olympiads/
  subjects/social.js                      дисциплины и темы обществознания
  hp/olympiad.js                          «Высшая проба»
  hp/social/<дисциплина>/<тема>.js        задания темы (все классы и туры вместе)
  hp/sources/2026-27-demo-9-1.js          демоверсия 2026/27 · 9 класс · отбор · I тур
```

Новый файл данных нужно подключить в `olympiad.html`; `npm test` напомнит, если забыть.

Порядок подключения: `normalize` → `types` → `scoring-rules` → `registry` → `grade` → `attempt`, затем данные: предметы → олимпиады → задания → источники.

## Каталог

```js
OLY.defineSubject({
  id: 'social', title: 'Обществознание',
  disciplines: [
    { id: 'SOC', title: 'Социология', topics: [
      { id: 'SOC-MOB', title: 'Социальная мобильность' }
    ] }
  ]
});

OLY.defineOlympiad({
  id: 'HP', title: 'Высшая проба',
  subjects: ['social'], classes: [9, 10, 11],
  stages: ['qualifying', 'final'],   // необязательно: этапы олимпиады
  rounds: [1, 2]
});
```

Каталог предмета общий для всех олимпиад. Темы добавляются по мере появления заданий; дисциплины и темы без заданий ученику не показываются.

## Задание

```js
OLY.addTasks([{
  id: 'HP-SOC-MOB-001',        // ОЛИМПИАДА-ДИСЦИПЛИНА-ТЕМА-НОМЕР, постоянный
  olympiad: 'HP', subject: 'social', discipline: 'SOC', topic: 'SOC-MOB',
  type: 'multiple-select',
  question: '…',
  options: [{ text: '…', correct: true, explanation: '…' }],
  explanation: '…',            // необязательно
  scoring: null,               // обязательно: null или критерии
  version: 1, retired: false   // необязательно
}]);
```

- ID не зависит от класса, тура, года и позиции в тренировке; начинается с `олимпиада-тема-`. Не меняется и не используется повторно; вместо удаления — `retired: true`.
- Поля `class`, `classes`, `round`, `year`, `source`, `sourceType` в задании запрещены — реестр отклонит такое задание. Этап (`stage`) тоже указывается только в источнике.

### Типы заданий

| type | Поля | Ответ ученика |
|---|---|---|
| `single-select` | `options: [{ text, correct, explanation? }]`, ровно один верный | `2` |
| `multiple-select` | `options`, хотя бы один верный | `[1, 3]` |
| `short-text` | `acceptedAnswers: [...]`, `normalize?: { yo: true }` | `'Эсхатология'` |
| `numeric` | `answer`, `tolerance?` (по умолчанию 0), `unit?` | `'12,5'` |
| `matching` | `items: [{ text, match, explanation? }]`, `options: [...]`, `oneToOne?`, `columns?` | `[2, 1, 3]` (А, Б, В…) |

**short-text.** Всегда нормализуются только технические различия: регистр, пробелы по краям, повторные пробелы. ё = е — только если в задании указано `normalize: { yo: true }`. Засчитываются лишь ответы из `acceptedAnswers` — их задаёт преподаватель.

**numeric.** Принимаются запятая и точка, знак «−», пробелы между разрядами. Нечисловой ввод — неверный ответ.

Новый тип добавляется через `OLY.types.register(name, { validateTask, emptyResponse, isEmpty, isComplete, cleanResponse, check, getCorrect, formatResponse })` — ядро менять не нужно.

## Источник

```js
OLY.addSource({
  id: 'HP-2026-27-DEMO-9-1',
  olympiad: 'HP', subject: 'social',
  kind: 'demo',                   // 'demo' | 'past' | 'author-set'
  year: '2026/27', classes: [9], round: 1,   // обязательны для demo и past
  stage: 'qualifying',            // обязателен для demo и past, если у олимпиады есть stages
  title: 'Демоверсия 2026/27 · 9 класс · отборочный этап · I тур',
  answersBasis: 'official',       // 'official' | 'author'
  playable: true,                 // можно пройти как пробный тур
  items: [
    { number: 1, taskId: 'HP-…-001' },
    { number: 2, taskId: 'HP-…-001', scoring: { … } }  // критерии этого варианта, если отличаются
  ]
});
```

Номера позиций идут подряд с 1. В пробный тур нельзя включить снятое с выдачи задание. `stage` проверяется по списку `stages` олимпиады; у олимпиады без этапов источник этап не указывает.

## Критерии оценивания

```js
scoring: null   // критерии неизвестны — только вердикт, без баллов

scoring: {
  maxPoints: 3,
  rule: 'имя-правила',            // из OLY.scoringRules
  params: { … },                  // необязательно
  basis: 'official',              // 'official' | 'author'
  ref: 'Методические рекомендации 2026/27, с. 4'   // обязательно для official
}
```

Если у позиции источника есть поле `scoring` (в том числе `null`), в пробном туре оно заменяет `task.scoring`.

Правило регистрируется так (сейчас правил нет):

```js
OLY.scoringRules.register('имя-правила', {
  supports: ['multiple-select'],             // или '*'
  validateParams: function (params) { return []; },
  score: function (result, maxPoints, params, task) { /* result = { verdict, details } */ }
});
```

## Запросы

```js
OLY.query({ olympiad: 'HP', subject: 'social', discipline: 'SOC', topic: 'SOC-MOB',
            class: 'all' | 9 | 10 | 11, stage: 'all' | 'qualifying' | 'final',
            round: 'all' | 1 | 2, year?, type? });
OLY.getAvailableDisciplines({ olympiad, subject, class?, stage?, round? });
OLY.getAvailableTopics({ olympiad, subject, discipline, class?, stage?, round? });
OLY.getPlayableSources({ olympiad, subject?, class?, stage?, round? });
OLY.getAppearances(taskId);  OLY.getTaskFacets(taskId);
```

Класс, этап, тур и год проверяются **по одному появлению**: фильтр «9 класс, II тур» находит задание, только если оно было во II туре 9 класса. Задание без источников находится только без этих фильтров. `query` возвращает задания в порядке регистрации; порядок пробного тура — `getSourceTaskIds(sourceId)` (по номерам источника).

## Попытка

```js
var A = OLY.attempt;
var p = A.createAttempt({ mode: 'practice', olympiad: 'HP', subject: 'social',
  settings: { discipline: 'SOC', topic: 'SOC-MOB', filters: { class: 'all', round: 'all' } },
  taskIds: [...] });
A.setResponse(p, taskId, value);   // черновик, можно менять
A.check(p, taskId);                // «Проверить»: ответ засчитан, дальше read-only
A.finish(p);

var m = A.createAttempt({ mode: 'mock', settings: { sourceId: 'HP-2026-27-DEMO-9-1' } });
A.setResponse(m, taskId, value);   // ответы меняются до завершения
A.finish(m);                       // оценка всех заданий сразу
A.summary(m);  // { total, correct, incorrect, skipped, points, maxPoints, scoredCount, unscoredCount }
```

- **practice** — свободная навигация и пропуск заданий; ответ засчитывается только по `check`.
- **mock** — набор и порядок из источника; до `finish` ничего не оценивается.
- `points` / `maxPoints` в итогах — только по заданиям с определёнными критериями; `unscoredCount` — сколько результатов без критериев.
- Попытка — JSON из примитивов и ID; точки расширения `OLY.attemptStore.onCheck` / `onFinish` пока ничего не делают.

## Пилотные данные

Официальная демоверсия «Высшая проба», обществознание, 9 класс, отборочный этап, I тур, 2026/27 (`HP-2026-27-DEMO-9-1`, `answersBasis: 'official'`, `playable: true`):

| № | ID | Дисциплина · тема | Тип | Официальный ключ |
|---|---|---|---|---|
| 1 | `HP-PHI-RUS-001` | Философия · Русская философия | multiple-select | 1, 2, 3, 4 |
| 2 | `HP-SOC-CAR-001` | Социология · Образование и профессиональная деятельность | single-select | 2 |
| 3 | `HP-POL-RAT-001` | Политология · Рационализация и бюрократия | single-select | 1 |
| 4 | `HP-ECO-INE-001` | Экономика · Неравенство и распределение доходов | multiple-select | 1, 2, 4 |
| 5 | `HP-LAW-FAM-001` | Право · Семейное право | multiple-select | 1, 3, 4 |

- Формулировки и варианты перенесены дословно, нумерация вариантов — как в документе. Переносы строк из исходного документа заменены пробелами; орфография («ведет», «слоев»), пунктуация и отсутствие точек в конце отдельных вариантов сохранены.
- Критерии оценивания в документе не указаны — у всех заданий `scoring: null`.
- Объяснений в источнике нет — поля `explanation` не добавлены; педагогические разборы появятся отдельно.

## Тесты

```bash
npm test
```
