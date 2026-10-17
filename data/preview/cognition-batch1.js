/*
 * ПРЕДПРОСМОТР — подключается только на странице preview-cognition.html.
 *
 * Партия 1 (20 заданий) тем «Познание» (OBS-COG) и «Наука и научное познание» (OBS-SCI).
 * Сами задания — в основном банке: data/tasks/society/cognition.js и
 * data/tasks/society/science.js (страница подключает оба файла); здесь только набор.
 *
 * Порядок показа фиксирован (EGE.preview.taskIds), задания не перемешиваются.
 */
EGE.preview = {
  id: 'cognition-batch1',
  title: 'Познание и научное познание — партия 1',
  taskIds: [
    "OBS-COG-002",
    "OBS-COG-003",
    "OBS-COG-006",
    "OBS-COG-008",
    "OBS-COG-016",
    "OBS-COG-017",
    "OBS-COG-019",
    "OBS-COG-025",
    "OBS-COG-026",
    "OBS-COG-028",
    "OBS-SCI-004",
    "OBS-SCI-007",
    "OBS-SCI-010",
    "OBS-SCI-013",
    "OBS-SCI-016",
    "OBS-SCI-017",
    "OBS-SCI-025",
    "OBS-SCI-027",
    "OBS-SCI-029",
    "OBS-SCI-030"
  ]
};
