# Интерактивный учебник

Третье направление платформы: теория, в которой ученик постоянно действует. Сценарий главы: **проблема → попытка ответа → объяснение → интерактив → проверка → углубление → практика**.

Тренажёры не затронуты: свой код в `js/textbook/`, пространство имён `TXT`, содержание в `data/textbook/`, стили `css/textbook.css` поверх `css/styles.css`. Страница `textbook.html` пока ниоткуда не ссылается.

## Запуск

```bash
npm start      # затем http://localhost:8080/textbook.html
```

Или открыть `textbook.html` двойным щелчком. Глава «Власть» — `textbook.html#/power`, её разделы — `#/power/<id раздела>`, например `#/power/deeper`.

## Файлы

```
textbook.html                     точка входа и порядок скриптов
css/textbook.css                  токены и компоненты учебника
js/textbook/inline.js             разметка в текстах: **выделение**, [[термин|пояснение]]
js/textbook/schema.js             типы блоков: поля, проверка, какие элементы требуют ответа
js/textbook/registry.js           каталог, главы, проверка главы целиком
js/textbook/progress.js           прогресс ученика (чистые функции) и хранение в localStorage
js/textbook/router.js             адреса экранов
js/textbook/ui/dom.js             помощники DOM
js/textbook/ui/blocks.js          реестр отрисовки блоков
js/textbook/ui/blocks/*.js        отрисовка: text, choice, explore, match, ladder, summary
js/textbook/app.js                экраны и события (единственный файл, работающий с DOM при загрузке)
data/textbook/catalog.js          разделы курса и главы (ненаписанные — «скоро»)
data/textbook/politics/power.js   глава «Власть»
tests/textbook-*.test.js          тесты ядра, прогресса и содержания
```

Порядок подключения: ядро → каталог → главы → интерфейс → `app.js`. `npm test` напомнит, если файл главы не подключён.

## Как добавить главу

1. Убедиться, что глава есть в `data/textbook/catalog.js` (id латиницей: `democracy`).
2. Создать `data/textbook/<раздел>/<глава>.js` и подключить его в `textbook.html` после каталога.
3. Описать главу данными — компоненты писать не нужно:

```js
TXT.defineChapter({
  id: 'democracy', area: 'POL', title: 'Демократия',
  description: 'Одна-две фразы о главе.',
  goals: ['…'],                                  // «После главы вы сможете»
  practice: [                                    // кнопки перехода к тренажёрам (первая — главная)
    { kind: 'olympiad', title: '…', text: '…', label: 'Перейти к олимпиадному тренажёру',
      href: 'olympiad.html#/hp/POL/POL-DEM' }
    // { kind: 'ege', title: '…', label: 'Перейти к тренажёру ЕГЭ', href: 'index.html' }
  ],
  sections: [
    { id: 'intro', title: '…', blocks: [ … ] },
    { id: 'deeper', title: '…', level: 'olympiad', blocks: [ … ] },   // олимпиадный уровень
    { id: 'final', title: 'Финальная проверка', blocks: [{ type: 'quiz', id: 'final', mode: 'final', questions: [ … ] }] },
    { id: 'result', title: 'Итоги главы', progress: false, blocks: [{ type: 'summary' }, { type: 'practice' }] }
  ]
});
```

Глава проверяется при загрузке: неизвестный тип блока, лишнее поле (опечатка), сломанная разметка, вопрос без верного ответа или без объяснения, ссылка на несуществующий раздел — ошибка с путём к месту (`chapter.sections[3].blocks[1].items[0].answer: …`).

id разделов, блоков и элементов после публикации лучше не менять: прогресс хранится по ключам `раздел/блок/элемент`.

## Блоки

Тексты поддерживают `**ключевые слова**` и `[[термин|пояснение]]` (пояснение раскрывается по нажатию). Поле с пометкой «абзацы» принимает строку или массив строк.

| type | Назначение | Поля |
|---|---|---|
| `heading` | подзаголовок | `text` |
| `lead` | крупная фраза-проблема | `kicker?`, `text` |
| `text` | абзацы | `text` (абзацы) |
| `callout` | врезка | `variant`: `example` · `trap` · `note` · `key` · `quote`; `title?`, `text?` (абзацы), `items?`, `source?` |
| `definition` | определение | `term`, `text`, `source?` |
| `reveal` | раскрывающиеся пояснения | `title?`, `items: [{ title, text }]` |
| `think` | «Подумайте»: разбор по кнопке | `id`, `prompt`, `answer` (абзацы) |
| `compare` | сравнение понятий (на телефоне — карточки) | `caption?`, `corner?`, `columns`, `rows: [{ label, cells }]` |
| `predict` | версия ученика, без верного ответа | `id`, `prompt`, `options: [{ text, response }]`, `after?` |
| `assemble` | собрать определение из фрагментов | `id`, `prompt`, `fragments: [{ text, belongs, explanation }]`, `result: { term, text }` |
| `classify` | ситуации по одной, объяснение сразу | `id`, `prompt`, `options`, `items: [{ id, text, answer, explanation }]` |
| `match` | соотнести позиции с вариантами | `id`, `prompt`, `situation?`, `options`, `items: [{ text, match, explanation }]` |
| `flow` | интерактивная схема-цепочка | `id`, `caption?`, `nodes: [{ id, label, hint?, text, example? }]` |
| `cards` | карточки, раскрываются по шагам | `id`, `caption?`, `items: [{ id, title, summary?, steps: [{ label, text, kind? }] }]`; `kind`: `example` · `sign` · `trap` |
| `quiz` | мини- или финальная проверка | `id`, `mode`: `mini` · `final`, `questions: [{ id, type: single · multiple, text, options: [{ text, correct, explanation? }], explanation, ref? }]` |
| `ladder` | «лестница моделей»: теории по очереди смотрят на один сюжет | `id`, `steps: [{ id, author, meta?, ring, diffuse?, formula, text, case?, question: { text, options }, blindspot? }]`, `outro?` |
| `summary` | итоги главы по финальной проверке | — |
| `practice` | кнопки из `chapter.practice` | `text?` |

`answer` и `match` — номер варианта с нуля. В финальной проверке у каждого вопроса обязателен `ref` — раздел, который стоит повторить при ошибке.

**Новый тип блока**: схема в `js/textbook/schema.js` (`TXT.schema.register`) и отрисовка в `js/textbook/ui/blocks/` (`TXT.ui.blocks.register`). Тест проверяет, что у каждого типа есть и то и другое.

## Прогресс

Хранится в `localStorage` (`textbook:progress:v1`), без аккаунтов и сервера.

- Раздел **изучен**, если на все его задания дан ответ (верный или нет); раздел без заданий — когда ученик нажал «Дальше».
- Основной процент — по разделам без `level: 'olympiad'` и без `progress: false`. Олимпиадный уровень показывается отдельно, чтобы можно было пройти главу на 100% без него.
- Ответ засчитывается один раз; проверки (`quiz`) можно пройти заново.
- Итоги: «что освоено» — разделы, по которым все вопросы финальной проверки решены верно; «где были ошибки» — вопросы с ошибкой; «что повторить» — их разделы (`ref`).
- Точка расширения для будущей синхронизации: `TXT.progressStore.onChange(state, chapterId)`.

## Оформление

Все цвета и размеры — токены в начале `css/textbook.css`: шрифт заголовков и текста, ширина колонки, акценты, врезки, олимпиадный акцент (`--tb-olymp*`), рамки заданий. Тёмная тема — по настройке системы или `data-theme="dark"`, как во всей платформе. Олимпиадный раздел переопределяет акцент на бирюзовый — тот же, что у раздела олимпиад.
