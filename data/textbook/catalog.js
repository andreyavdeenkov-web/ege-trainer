/*
 * Учебник: каталог курса — разделы кодификатора и главы в них.
 *
 * Глава, для которой ещё нет файла данных, показывается как «скоро».
 * id глав постоянные: на них ссылаются адреса (#/power) и сохранённый прогресс.
 * color — цвет раздела (та же палитра, что у разделов тренажёра ЕГЭ).
 */
TXT.defineCatalog({
  areas: [
    {
      id: 'OBS',
      title: 'Человек и общество',
      color: '#6366f1',
      chapters: [
        { id: 'activity', title: 'Деятельность' },
        { id: 'cognition', title: 'Познание' },
        { id: 'culture', title: 'Культура' }
      ]
    },
    {
      id: 'ECO',
      title: 'Экономика',
      color: '#0ea5e9',
      chapters: [
        { id: 'economy', title: 'Экономика и экономическая наука' }
      ]
    },
    {
      id: 'SOC',
      title: 'Социальные отношения',
      color: '#10b981',
      chapters: [
        { id: 'stratification', title: 'Социальная стратификация' },
        { id: 'mobility', title: 'Социальная мобильность' }
      ]
    },
    {
      id: 'POL',
      title: 'Политика',
      color: '#f59e0b',
      chapters: [
        { id: 'power', title: 'Власть' },
        { id: 'political-system', title: 'Политическая система' },
        { id: 'state', title: 'Государство' },
        { id: 'regimes', title: 'Политические режимы' },
        { id: 'democracy', title: 'Демократия' },
        { id: 'elections', title: 'Выборы' },
        { id: 'parties', title: 'Политические партии' }
      ]
    },
    {
      id: 'LAW',
      title: 'Право',
      color: '#ef4444',
      chapters: [
        { id: 'law', title: 'Право в системе социальных норм' }
      ]
    }
  ]
});
