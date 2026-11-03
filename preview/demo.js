/* Visual review ONLY. No VK Bridge, API, cookies, localStorage or real data. */
(() => {
  'use strict';
  const names = [
    'Дурак', 'Маг', 'Жрица', 'Императрица', 'Император', 'Иерофант',
    'Влюблённые', 'Колесница', 'Сила', 'Отшельник', 'Колесо Фортуны',
    'Справедливость', 'Повешенный', 'Преображение', 'Умеренность',
    'Искушение', 'Башня', 'Звезда', 'Луна', 'Солнце', 'Суд', 'Мир'
  ];
  const found = new Set([0, 6, 17]);
  let claimed = false;
  let drawn = false;
  const $ = id => document.getElementById(id);
  const el = (tag, css, text) => {
    const item = document.createElement(tag);
    item.className = css;
    if (text !== undefined) item.textContent = text;
    return item;
  };
  function render() {
    $('crystals').textContent = claimed ? '35' : '25';
    $('streak').textContent = '2';
    $('unlocked').textContent = found.size + '/22';
    $('claimButton').disabled = claimed;
    $('drawButton').disabled = drawn;
    const list = $('collection');
    list.replaceChildren();
    names.forEach((name, id) => {
      const open = found.has(id);
      const tile = el('div', 'arcana' + (open ? ' open' : ''));
      tile.setAttribute('role', 'listitem');
      tile.setAttribute('aria-label', open ? 'Открыт аркан ' + name : 'Закрытый аркан');
      tile.append(el('span', 'symbol', open ? '✦' : '✧'));
      tile.append(el('span', 'name', open ? name : 'Тайна'));
      list.append(tile);
    });
    const mission = $('missions');
    mission.replaceChildren();
    [
      { label: '🌙 Карта дня', done: drawn },
      { label: '✦ Получить кристаллы', done: claimed }
    ].forEach(item => {
      const row = el('div','mission'+(item.done ? ' done':''));
      row.append(el('span','',item.label));
      row.append(el('span','',item.done ? 'Выполнено ✓' : 'Не выполнено'));
      mission.append(row);
    });
    const achievements = $('achievements');
    achievements.replaceChildren();
    [
      ['✧ Первый аркан', found.size >= 1],
      ['✦ Пять арканов', found.size >= 5],
      ['☽ Десять арканов', found.size >= 10],
      ['☼ Вся колода', found.size >= 22],
      ['◇ Три дня подряд', false],
      ['◈ Семь дней подряд', false]
    ].forEach(([label, achieved]) => {
      achievements.append(el('div', 'achievement'+(achieved ? ' done' : ''),
        label+(achieved ? ' · ✓' : ' · ○')));
    });
  }
  $('claimButton').addEventListener('click', () => {
    if (claimed) return;
    claimed = true;
    $('status').textContent = 'Демонстрация: +10 условных кристаллов. На сервер ничего не отправлено.';
    $('status').className = 'status demo';
    render();
  });
  $('drawButton').addEventListener('click', () => {
    if (drawn) return;
    drawn = true;
    found.add(18);
    $('drawResult').textContent = '✦ Луна · открыта в демонстрации';
    $('status').textContent = 'Демонстрация: карта добавлена только на этот экран.';
    $('status').className = 'status demo';
    render();
  });
  render();
})();
