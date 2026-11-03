/*
 * Карты Таро V2 · Collection and quests
 * Separate, non-monetary feature. Does not alter the original history, dailyCard
 * or consent storage keys. No purchases, rewards or network endpoints.
 */
(function () {
  'use strict';

  const COLLECTION_KEY = 'taro_arcana_collection_v1';
  const REWARD_KEY = 'taro_engagement_v1';
  const element = (id) => document.getElementById(id);
  const isValidId = (n) => Number.isInteger(n) && n >= 0 && n <= 21;
  let bridge = null;
  let cards = [];
  let history = [];
  let collected = new Set();
  let rewardState = {};
  let ready = false;
  let errorMessage = '';
  let queue = Promise.resolve();

  function todayKey() {
    const date = new Date();
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  function parseList(value) {
    if (!value) return [];
    try {
      const data = JSON.parse(value);
      const ids = Array.isArray(data) ? data : data && data.cardIds;
      return Array.isArray(ids) ? [...new Set(ids.filter(isValidId))] : [];
    } catch (_) {
      return [];
    }
  }

  function entryIds(entry) {
    if (!entry || typeof entry !== 'object') return [];
    if (entry.type === 'daily' && isValidId(entry.cardId)) return [entry.cardId];
    if (entry.type === 'spread' && Array.isArray(entry.cards)) {
      return [...new Set(entry.cards.map(item => item && item.cardId).filter(isValidId))];
    }
    return [];
  }

  function idsFromHistory(items) {
    const ids = new Set();
    for (const entry of items) for (const id of entryIds(entry)) ids.add(id);
    return ids;
  }

  function safeHistory(items) {
    return Array.isArray(items) ? items.filter(item => item && typeof item === 'object').slice(0, 100) : [];
  }

  function makeNode(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function renderCollection() {
    const grid = element('arcanaCollection');
    if (!grid) return;
    grid.replaceChildren();
    for (const card of cards) {
      const opened = collected.has(card.id);
      const tile = makeNode('div', 'arcana-tile' + (opened ? ' is-open' : ' is-locked'));
      tile.setAttribute('role', 'listitem');
      tile.setAttribute('aria-label', opened ? 'Открыт аркан ' + card.name : 'Аркан пока не открыт');

      const picture = makeNode('div', 'arcana-picture');
      const glyph = makeNode('span', 'arcana-glyph', opened ? (card.symbol || '✦') : '✧');
      picture.appendChild(glyph);
      if (opened && card.image) {
        const image = makeNode('img', 'arcana-image');
        image.src = card.image;
        image.alt = card.name;
        image.loading = 'lazy';
        image.onerror = () => { image.remove(); };
        picture.appendChild(image);
      }
      tile.appendChild(picture);
      tile.appendChild(makeNode('span', 'arcana-tile-name', opened ? card.name : 'Тайна'));
      grid.appendChild(tile);
    }
    const amount = element('arcanaCount');
    if (amount) amount.textContent = collected.size + ' / ' + cards.length;
    const bar = element('arcanaProgressBar');
    if (bar) {
      const percentage = cards.length ? Math.round(100 * collected.size / cards.length) : 0;
      bar.style.width = percentage + '%';
      bar.parentElement.setAttribute('aria-valuenow', String(percentage));
    }
  }

  function renderMissions() {
    const target = element('arcanaMissions');
    if (!target) return;
    target.replaceChildren();

    const today = todayKey();
    const daily = history.some(item => item.type === 'daily' && item.date === today);
    const spread = history.some(item => item.type === 'spread' && item.date === today);
    const crystal = rewardState && rewardState.lastClaimDate === today;

    const missions = [
      { icon: '🌙', label: 'Откройте карту дня', done: daily },
      { icon: '✦', label: 'Выполните любой расклад', done: spread },
      { icon: '💎', label: 'Получите ежедневные кристаллы', done: crystal }
    ];

    for (const mission of missions) {
      const row = makeNode('div', 'arcana-mission' + (mission.done ? ' is-done' : ''));
      row.appendChild(makeNode('span', 'arcana-mission-icon', mission.icon));
      row.appendChild(makeNode('span', 'arcana-mission-title', mission.label));
      row.appendChild(makeNode('span', 'arcana-mission-status', mission.done ? '✓' : '○'));
      row.setAttribute('aria-label', mission.label + ': ' + (mission.done ? 'выполнено' : 'не выполнено'));
      target.appendChild(row);
    }
    const completed = element('arcanaMissionsDone');
    if (completed) completed.textContent = missions.filter(m => m.done).length + ' / ' + missions.length;
  }

  function renderAchievements() {
    const panel = element('arcanaAchievements');
    if (!panel) return;
    panel.replaceChildren();
    const unique = collected.size;
    const streak = Number.isSafeInteger(rewardState.streak) && rewardState.streak >= 0
      ? rewardState.streak : 0;
    const achievements = [
      { symbol: '✧', label: 'Первый аркан', value: unique, target: 1 },
      { symbol: '✦', label: 'Исследователь', value: unique, target: 5 },
      { symbol: '☽', label: 'Хранитель', value: unique, target: 10 },
      { symbol: '☼', label: 'Полная колода', value: unique, target: 22 },
      { symbol: '◈', label: '3 дня подряд', value: streak, target: 3 },
      { symbol: '◇', label: '7 дней подряд', value: streak, target: 7 }
    ];
    for (const achievement of achievements) {
      const achieved = achievement.value >= achievement.target;
      const badge = makeNode('div', 'arcana-achievement' + (achieved ? ' is-earned' : ''));
      badge.appendChild(makeNode('span', 'arcana-achievement-icon', achievement.symbol));
      const copy = makeNode('div', 'arcana-achievement-copy');
      copy.appendChild(makeNode('strong', '', achievement.label));
      copy.appendChild(makeNode('span', '', Math.min(achievement.value, achievement.target) + ' / ' + achievement.target));
      badge.appendChild(copy);
      badge.setAttribute('aria-label', achievement.label + ': ' + (achieved ? 'получено' : 'не получено'));
      panel.appendChild(badge);
    }
  }

  function render() {
    if (!element('arcanaCollection')) return;
    renderCollection();
    renderMissions();
    renderAchievements();
    const status = element('arcanaStatus');
    if (status) status.textContent = errorMessage ||
      'Коллекция сохраняет открытые арканы отдельно от истории. Достижения не дают платных преимуществ.';
  }

  async function persist() {
    if (!bridge) return;
    const payload = JSON.stringify([...collected].sort((a, b) => a - b));
    try {
      await bridge.storageSet(COLLECTION_KEY, payload);
      const confirmation = parseList(await bridge.storageGet(COLLECTION_KEY));
      if (confirmation.length !== collected.size ||
          confirmation.some(id => !collected.has(id))) {
        throw new Error('Collection storage confirmation failed');
      }
      errorMessage = '';
    } catch (error) {
      errorMessage = 'Коллекцию пока не удалось сохранить. Попробуйте открыть раздел ещё раз.';
      console.warn('Taro collection save failed', error);
    }
    render();
  }

  function saveIfChanged(ids) {
    const before = collected.size;
    for (const id of ids) if (isValidId(id)) collected.add(id);
    render();
    if (collected.size === before) return queue;
    queue = queue.then(() => persist()).catch(error => {
      console.warn('Taro collection queue failed', error);
    });
    return queue;
  }

  async function refresh(nextHistory) {
    if (!bridge) return;
    await queue;
    history = safeHistory(nextHistory);
    const stored = parseList(await bridge.storageGet(COLLECTION_KEY));
    const merged = [...stored, ...idsFromHistory(history)];
    try {
      const raw = await bridge.storageGet(REWARD_KEY);
      rewardState = raw ? JSON.parse(raw) || {} : {};
    } catch (_) {
      rewardState = {};
    }
    await saveIfChanged(merged);
    ready = true;
    render();
  }

  async function init(options) {
    if (!options || !options.bridge || !Array.isArray(options.cards)) return;
    bridge = options.bridge;
    cards = options.cards.filter(card => card && isValidId(card.id)).slice(0, 22);
    await refresh(options.history || []);
  }

  function record(entry) {
    if (!bridge || !ready) return Promise.resolve();
    history.unshift(entry);
    history = safeHistory(history);
    return saveIfChanged(entryIds(entry));
  }

  window.TarotProgression = { init, refresh, record };
}());
