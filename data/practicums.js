/*
 * Реестр практикумов: раздел → тема → практикум → задания.
 *
 * Практикум — фиксированный набор заданий одной темы. Ученик видит его как
 * «Практикум № 1», «Практикум № 2»… Состав каждого практикума задаётся здесь
 * явно (taskIds) и не формируется случайной выборкой из банка. Сами задания
 * хранятся в data/tasks/** и регистрируются раньше этого файла.
 *
 * Правила (проверяет js/registry.js и tests/practicums.test.js):
 *   - id постоянный: id темы + '-P' + номер (OBS-COG-P01); не меняется и не
 *     используется повторно — по нему хранится незавершённая попытка;
 *   - status: 'published' — ученик видит практикум; 'draft' — готовится, не виден;
 *     'retired' — прежний набор: виден, только чтобы продолжить начатую попытку;
 *   - тема видна ученику, только если в ней есть опубликованный практикум;
 *   - пустые практикумы и практикумы «для заполнения интерфейса» не создаются;
 *   - задания «Общих вопросов» (*-GEN) в практикумы не включаются.
 *
 * Чтобы изменить состав опубликованного практикума, лучше создать следующий
 * практикум темы: попытка, начатая в прежнем составе, не продолжится
 * («состав заданий с тех пор изменился»).
 */
EGE.addPracticums([
  {
    // Все 16 заданий темы «Деятельность» из основного каталога.
    id: 'OBS-ACT-P01',
    topic: 'OBS-ACT',
    number: 1,
    status: 'published',
    shuffle: true,
    legacyTopicAttempts: true,
    taskIds: [
      'OBS-ACT-001', 'OBS-ACT-002', 'OBS-ACT-003', 'OBS-ACT-004',
      'OBS-ACT-005', 'OBS-ACT-006', 'OBS-ACT-007', 'OBS-ACT-008',
      'OBS-ACT-009', 'OBS-ACT-010', 'OBS-ACT-011', 'OBS-ACT-012',
      'OBS-ACT-013', 'OBS-ACT-014', 'OBS-ACT-015', 'OBS-ACT-016'
    ]
  },
  {
    // Утверждённый набор из 19 заданий (страница предпросмотра preview-poznanie.html,
    // набор poznanie-19): тот же состав и тематический порядок, максимум 33 балла.
    // Познавательная деятельность → чувственное → рациональное познание → знание →
    // познаваемость мира → истина.
    id: 'OBS-COG-P01',
    topic: 'OBS-COG',
    number: 1,
    status: 'published',
    taskIds: [
      'OBS-COG-031', 'OBS-COG-002',
      'OBS-COG-032', 'OBS-COG-008', 'OBS-COG-033',
      'OBS-COG-003', 'OBS-COG-034', 'OBS-COG-035', 'OBS-COG-039', 'OBS-COG-019',
      'OBS-COG-016', 'OBS-COG-017',
      'OBS-COG-036',
      'OBS-COG-037', 'OBS-COG-025', 'OBS-COG-026', 'OBS-COG-006', 'OBS-COG-038', 'OBS-COG-028'
    ]
  },
  {
    // «Научное познание», Практикум № 1 и № 2 — все 50 заданий темы без повторов,
    // по 25 в каждом (максимум по 39 баллов). Каждый охватывает тему целиком:
    // наука и другие виды познания → уровни научного познания → формы научного
    // знания → методы → классификация наук → функции и роль науки. В каждом все
    // четыре формата части 1 (два лишних, суждения, соответствие, выбор по ситуации)
    // и задания всех уровней сложности; одного формата подряд — не больше двух.
    // Близкие задания разведены по разным практикумам (например, 32 и 33, 19 и 20,
    // 24 и 25, 28 и 29, 30 и 43, 31 и 44, 41 и 42). Порядок постоянный.
    id: 'OBS-SCK-P01',
    topic: 'OBS-SCK',
    number: 1,
    status: 'published',
    taskIds: [
      'OBS-SCK-034', 'OBS-SCK-017', 'OBS-SCK-021', 'OBS-SCK-022', 'OBS-SCK-001',
      'OBS-SCK-013', 'OBS-SCK-019', 'OBS-SCK-035', 'OBS-SCK-015', 'OBS-SCK-025',
      'OBS-SCK-033', 'OBS-SCK-028', 'OBS-SCK-040', 'OBS-SCK-003', 'OBS-SCK-011',
      'OBS-SCK-007', 'OBS-SCK-045', 'OBS-SCK-041', 'OBS-SCK-010', 'OBS-SCK-027',
      'OBS-SCK-009', 'OBS-SCK-043', 'OBS-SCK-039', 'OBS-SCK-031', 'OBS-SCK-050'
    ]
  },
  {
    id: 'OBS-SCK-P02',
    topic: 'OBS-SCK',
    number: 2,
    status: 'published',
    taskIds: [
      'OBS-SCK-002', 'OBS-SCK-004', 'OBS-SCK-026', 'OBS-SCK-023', 'OBS-SCK-005',
      'OBS-SCK-020', 'OBS-SCK-012', 'OBS-SCK-032', 'OBS-SCK-024', 'OBS-SCK-036',
      'OBS-SCK-029', 'OBS-SCK-008', 'OBS-SCK-037', 'OBS-SCK-014', 'OBS-SCK-049',
      'OBS-SCK-038', 'OBS-SCK-006', 'OBS-SCK-042', 'OBS-SCK-016', 'OBS-SCK-030',
      'OBS-SCK-048', 'OBS-SCK-046', 'OBS-SCK-047', 'OBS-SCK-044', 'OBS-SCK-018'
    ]
  },
  {
    // «Общество как система. Социальные институты» (темы 1.6–1.7), Практикум № 1 и № 2 —
    // по 18 заданий в порядке, утверждённом методической экспертизой:
    // общество как система → динамичность → общество и природа → сферы и связи →
    // общественные отношения → потребности → социальные институты. Максимум — 32 и 31 балл.
    // Порядок постоянный.
    id: 'OBS-SYS-P01',
    topic: 'OBS-SYS',
    number: 1,
    status: 'published',
    taskIds: [
      'OBS-SYS-001', 'OBS-SYS-002', 'OBS-SYS-003', 'OBS-SYS-004', 'OBS-SYS-005', 'OBS-SYS-006',
      'OBS-SYS-007', 'OBS-SYS-008', 'OBS-SYS-009', 'OBS-SYS-010', 'OBS-SYS-011', 'OBS-SYS-012',
      'OBS-SYS-013', 'OBS-SYS-014', 'OBS-SYS-015', 'OBS-SYS-016', 'OBS-SYS-017', 'OBS-SYS-018'
    ]
  },
  {
    id: 'OBS-SYS-P02',
    topic: 'OBS-SYS',
    number: 2,
    status: 'published',
    taskIds: [
      'OBS-SYS-019', 'OBS-SYS-020', 'OBS-SYS-021', 'OBS-SYS-022', 'OBS-SYS-023', 'OBS-SYS-024',
      'OBS-SYS-025', 'OBS-SYS-026', 'OBS-SYS-027', 'OBS-SYS-028', 'OBS-SYS-029', 'OBS-SYS-030',
      'OBS-SYS-031', 'OBS-SYS-032', 'OBS-SYS-033', 'OBS-SYS-034', 'OBS-SYS-035', 'OBS-SYS-036'
    ]
  },
  {
    // «Типы обществ», Практикум № 1 и № 2 — тренировочные (проверка после каждого задания):
    // задания документов преподавателя «Типы обществ тест 1» и «тест 2» в их порядке.
    id: 'OBS-TYP-P01',
    topic: 'OBS-TYP',
    number: 1,
    status: 'published',
    taskIds: [
      'OBS-TYP-026', 'OBS-TYP-027', 'OBS-TYP-028', 'OBS-TYP-029', 'OBS-TYP-030',
      'OBS-TYP-031', 'OBS-TYP-032', 'OBS-TYP-033', 'OBS-TYP-034', 'OBS-TYP-035',
      'OBS-TYP-036', 'OBS-TYP-037', 'OBS-TYP-038', 'OBS-TYP-039', 'OBS-TYP-040'
    ]
  },
  {
    id: 'OBS-TYP-P02',
    topic: 'OBS-TYP',
    number: 2,
    status: 'published',
    taskIds: [
      'OBS-TYP-041', 'OBS-TYP-042', 'OBS-TYP-043', 'OBS-TYP-044', 'OBS-TYP-045',
      'OBS-TYP-046', 'OBS-TYP-047', 'OBS-TYP-048', 'OBS-TYP-049', 'OBS-TYP-050',
      'OBS-TYP-051', 'OBS-TYP-052', 'OBS-TYP-053', 'OBS-TYP-054', 'OBS-TYP-055'
    ]
  },
  {
    // «Итоговый практикум — Типы обществ»: 25 заданий утверждённого банка преподавателя в его
    // порядке (OBS-TYP-001…025 = № 1–25). Итоговая работа (kind: 'final', js/final-session.js):
    // все задания без проверки, ответы можно менять и пропускать; балл, разбор и аналитика —
    // после завершения. criteria — шесть критериев сравнения обществ для аналитики.
    id: 'OBS-TYP-F01',
    topic: 'OBS-TYP',
    number: 1,
    kind: 'final',
    status: 'published',
    criteria: [
      { id: 'nature', title: 'Отношение к природе' },
      { id: 'factor', title: 'Основной фактор производства' },
      { id: 'economy', title: 'Экономика' },
      { id: 'social', title: 'Социальная структура' },
      { id: 'politics', title: 'Политическая жизнь' },
      { id: 'spiritual', title: 'Духовная жизнь' }
    ],
    taskIds: [
      'OBS-TYP-001', 'OBS-TYP-002', 'OBS-TYP-003', 'OBS-TYP-004', 'OBS-TYP-005',
      'OBS-TYP-006', 'OBS-TYP-007', 'OBS-TYP-008', 'OBS-TYP-009', 'OBS-TYP-010',
      'OBS-TYP-011', 'OBS-TYP-012', 'OBS-TYP-013', 'OBS-TYP-014', 'OBS-TYP-015',
      'OBS-TYP-016', 'OBS-TYP-017', 'OBS-TYP-018', 'OBS-TYP-019', 'OBS-TYP-020',
      'OBS-TYP-021', 'OBS-TYP-022', 'OBS-TYP-023', 'OBS-TYP-024', 'OBS-TYP-025'
    ]
  },
  {
    // «Семья и брак», Практикум № 1 и № 2 — самостоятельные наборы из 31 задания темы
    // без повторов. Каждый охватывает тему целиком: семья как институт и группа,
    // функции, типы, брак, тенденции, социализация, роли и контроль, проблемы
    // и поддержка семьи; в каждом — все три формата и задания разной сложности.
    id: 'SOC-FAM-P01',
    topic: 'SOC-FAM',
    number: 1,
    status: 'published',
    shuffle: true,
    taskIds: [
      'SOC-FAM-001', 'SOC-FAM-004', 'SOC-FAM-005', 'SOC-FAM-012', 'SOC-FAM-014',
      'SOC-FAM-017', 'SOC-FAM-019', 'SOC-FAM-022', 'SOC-FAM-024', 'SOC-FAM-031',
      'SOC-FAM-032', 'SOC-FAM-034', 'SOC-FAM-037', 'SOC-FAM-038', 'SOC-FAM-041',
      'SOC-FAM-042'
    ]
  },
  {
    id: 'SOC-FAM-P02',
    topic: 'SOC-FAM',
    number: 2,
    status: 'published',
    shuffle: true,
    taskIds: [
      'SOC-FAM-002', 'SOC-FAM-003', 'SOC-FAM-006', 'SOC-FAM-007', 'SOC-FAM-016',
      'SOC-FAM-018', 'SOC-FAM-021', 'SOC-FAM-023', 'SOC-FAM-025', 'SOC-FAM-026',
      'SOC-FAM-033', 'SOC-FAM-035', 'SOC-FAM-036', 'SOC-FAM-039', 'SOC-FAM-040'
    ]
  },
  {
    // Прежний набор: все 31 задание темы — так тема выдавалась до разделения на
    // два практикума. Новым ученикам не предлагается. Карточка «Прежний набор
    // (31 задание)» появляется, только если у ученика есть сохранённая незавершённая
    // попытка этого набора (в том числе перенесённая из записи темы целиком,
    // ege/SOC/SOC-FAM); после завершения попытки карточка исчезает.
    id: 'SOC-FAM-R01',
    topic: 'SOC-FAM',
    number: 1,
    status: 'retired',
    title: 'Прежний набор (31 задание)',
    shuffle: true,
    legacyTopicAttempts: true,
    taskIds: [
      'SOC-FAM-001', 'SOC-FAM-002', 'SOC-FAM-003', 'SOC-FAM-004', 'SOC-FAM-005',
      'SOC-FAM-006', 'SOC-FAM-007', 'SOC-FAM-012', 'SOC-FAM-014', 'SOC-FAM-016',
      'SOC-FAM-017', 'SOC-FAM-018', 'SOC-FAM-019', 'SOC-FAM-021', 'SOC-FAM-022',
      'SOC-FAM-023', 'SOC-FAM-024', 'SOC-FAM-025', 'SOC-FAM-026', 'SOC-FAM-031',
      'SOC-FAM-032', 'SOC-FAM-033', 'SOC-FAM-034', 'SOC-FAM-035', 'SOC-FAM-036',
      'SOC-FAM-037', 'SOC-FAM-038', 'SOC-FAM-039', 'SOC-FAM-040', 'SOC-FAM-041',
      'SOC-FAM-042'
    ]
  }
]);
