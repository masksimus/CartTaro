/* Карты Таро · отдельный VK pilot, не подключённый к опубликованному приложению.
   Авторизация ТОЛЬКО по подписанным параметрам запуска, проверенным backend.
   Ни одного секретного ключа или пользовательского баланса в исходном коде. */
(() => {
  'use strict';

  const APP_ID = '54582199';
  const CARD_NAMES = [
    'Дурак', 'Маг', 'Жрица', 'Императрица', 'Император', 'Иерофант',
    'Влюблённые', 'Колесница', 'Сила', 'Отшельник', 'Колесо Фортуны',
    'Справедливость', 'Повешенный', 'Преображение', 'Умеренность',
    'Искушение', 'Башня', 'Звезда', 'Луна', 'Солнце', 'Суд', 'Мир'
  ];
  const ACHIEVEMENTS = [
    ['firstArcana', '✧ Первый аркан'],
    ['fiveArcana', '✦ Пять арканов'],
    ['tenArcana', '☽ Десять арканов'],
    ['completeArcana', '☼ Вся колода'],
    ['threeDayStreak', '◇ Три дня подряд'],
    ['sevenDayStreak', '◈ Семь дней подряд']
  ];
  const $ = id => document.getElementById(id);
  const api = window.location.origin + '/api/v2';
  let bearer = null;
  let active = false;
  let busy = false;
  let profileId = null;
  let progress = null;

  const setText = (id, value) => { $(id).textContent = String(value); };

  function setStatus(message, style) {
    const element = $('status');
    element.className = 'status' + (style ? ' ' + style : '');
    element.textContent = message;
  }

  function setChip(id, message, style) {
    const el = $(id);
    el.className = 'chip' + (style ? ' ' + style : '');
    el.textContent = message;
  }

  function getSignedLaunch() {
    const raw = new URLSearchParams(window.location.search);
    const signed = new URLSearchParams();
    const seen = new Set();
    let duplicate = false;
    for (const [key, value] of raw) {
      if (key.startsWith('vk_') || key === 'sign') {
        if (seen.has(key)) duplicate = true;
        seen.add(key);
        signed.append(key, value);
      }
    }
    // The signed launch values must not remain in the address bar or referrers.
    // Do not call replaceState before importing vk-bridge: it detects platform
    // from launch URL on load.
    const launch = signed.toString();
    window.history.replaceState(null, '', window.location.pathname);
    if (duplicate || raw.get('vk_app_id') !== APP_ID ||
        !/^[1-9]\d{0,15}$/.test(raw.get('vk_user_id') || '') ||
        !/^\d{9,12}$/.test(raw.get('vk_ts') || '') ||
        !/^[A-Za-z0-9_-]{43}$/.test(raw.get('sign') || '') ||
        launch.length > 8192) return null;

    return { launch, userId: raw.get('vk_user_id') };
  }

  function make(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  }

  function drawCollection(ids) {
    const unique = new Set(Array.isArray(ids) ? ids.filter(id =>
      Number.isInteger(id) && id >= 0 && id < CARD_NAMES.length) : []);
    const root = $('collection');
    root.replaceChildren();
    CARD_NAMES.forEach((name, id) => {
      const opened = unique.has(id);
      const tile = make('div', 'arcana' + (opened ? ' open' : ''));
      tile.setAttribute('role', 'listitem');
      tile.setAttribute('aria-label', opened ? 'Открыто: ' + name : 'Аркан ещё не открыт');
      tile.appendChild(make('span', 'symbol', opened ? '✦' : '✧'));
      tile.appendChild(make('span', 'name', opened ? name : 'Тайна'));
      root.appendChild(tile);
    });
    setText('unlocked', unique.size + '/22');
  }

  function drawMissions(data) {
    const root = $('missions');
    root.replaceChildren();
    const items = [
      ['🌙 Карта дня', Boolean(data?.dailyCard)],
      ['✦ Награда дня', Boolean(data?.dailyClaim)]
    ];
    for (const [name, done] of items) {
      const row = make('div', 'mission' + (done ? ' done' : ''));
      row.appendChild(make('span', '', name));
      row.appendChild(make('span', '', done ? 'Выполнено ✓' : 'Не выполнено'));
      root.appendChild(row);
    }
  }

  function drawAchievements(data) {
    const root = $('achievements');
    root.replaceChildren();
    for (const [key, title] of ACHIEVEMENTS) {
      const earned = data && data[key] === true;
      const tile = make('div', 'achievement' + (earned ? ' done' : ''), title + (earned ? ' · ✓' : ' · ○'));
      root.appendChild(tile);
    }
  }

  function showProgress(data) {
    if (!data || !Number.isSafeInteger(data.crystals) || data.crystals < 0 ||
        !Number.isSafeInteger(data.streak) || data.streak < 0 ||
        !Array.isArray(data.arcana) || !data.missions || !data.achievements) {
      throw new Error('invalid_response');
    }
    progress = data;
    setText('crystals', data.crystals);
    setText('streak', data.streak);
    drawCollection(data.arcana);
    drawMissions(data.missions);
    drawAchievements(data.achievements);
    $('claimButton').disabled = !active || busy || data.claimedToday === true;
    $('drawButton').disabled = !active || busy || data.dailyCardDrawn === true;
  }

  async function request(endpoint, method = 'GET') {
    if (!bearer) throw new Error('missing_launch');
    // Same-origin API only: the VK signed launch cannot be sent to a domain
    // chosen via user query, form input, or localStorage.
    const response = await fetch(api + endpoint, {
      method,
      headers: { Authorization: 'Bearer ' + bearer },
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    });
    if (!response.ok) {
      const error = new Error(response.status === 401 ? 'expired_or_invalid' :
        response.status === 429 ? 'rate_limited' : 'network_or_server');
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  function messageForError(e) {
    if (e?.message === 'expired_or_invalid') return 'Сессия ВК не подтверждена или истекла. Откройте тестовую страницу заново внутри ВК.';
    if (e?.message === 'rate_limited') return 'Слишком много запросов. Повторите попытку позже.';
    if (e?.status === 503) return 'Тестовая база данных не подключена или временно недоступна. Прогресс не меняется.';
    if (e?.message === 'invalid_response') return 'Сервер вернул данные неверного формата.';
    return 'Нет связи с сервером. Проверьте подключение и повторно откройте тестовую страницу.';
  }

  function stop(message) {
    active = false;
    busy = false;
    bearer = null;
    $('claimButton').disabled = true;
    $('drawButton').disabled = true;
    setStatus(message, 'bad');
    setChip('authStatus', 'Сервер: не подтверждён', 'bad');
  }

  async function action(which) {
    if (!active || busy || !bearer || !progress) return;
    if ((which === 'claim' && progress.claimedToday) ||
        (which === 'draw' && progress.dailyCardDrawn)) return;
    busy = true;
    $('claimButton').disabled = true;
    $('drawButton').disabled = true;
    try {
      const result = await request(which === 'claim' ? '/daily/claim' : '/daily/draw', 'POST');
      if (!result.progress) throw new Error('invalid_response');
      if (which === 'claim') {
        setStatus(result.granted ? 'Награда начислена сервером: +' + result.reward + ' ✦' :
          'Награда за сегодня уже получена.', 'good');
      } else {
        if (!Number.isInteger(result.cardId) || result.cardId < 0 || result.cardId > 21) throw new Error('invalid_response');
        setText('drawResult', '✦ ' + CARD_NAMES[result.cardId] + ' · ' +
          (result.isNew ? 'карта сохранена' : 'сегодня уже открыта'));
        setStatus('Карта дня подтверждена сервером.', 'good');
      }
      showProgress(result.progress);
    } catch (e) {
      if (e.status === 401) return stop(messageForError(e));
      setStatus(messageForError(e), 'bad');
    } finally {
      busy = false;
      if (active && progress) showProgress(progress);
    }
  }

  async function boot() {
    drawCollection([]);
    drawMissions({});
    drawAchievements({});
    const credentials = getSignedLaunch();
    if (!credentials) {
      stop('Откройте тестовую страницу через настройки разработчика приложения ВК. Без подписанных параметров доступ закрыт.');
      setChip('bridgeStatus', 'VK Bridge: не проверен', 'bad');
      return;
    }
    if (!window.vkBridge || typeof window.vkBridge.send !== 'function') {
      stop('Не удалось загрузить VK Bridge. Ничего не изменено. Откройте страницу в клиенте VK.');
      setChip('bridgeStatus', 'VK Bridge: недоступен', 'bad');
      return;
    }
    try {
      await window.vkBridge.send('VKWebAppInit');
      const user = await window.vkBridge.send('VKWebAppGetUserInfo');
      if (!user || String(user.id) !== credentials.userId) {
        throw new Error('identity_mismatch');
      }
      profileId = String(user.id);
      setChip('bridgeStatus', 'VK Bridge: подключён', 'good');
    } catch (_) {
      stop('Не удалось подтвердить пользователя через VK Bridge. Откройте проверку внутри VK.');
      setChip('bridgeStatus', 'VK Bridge: ошибка', 'bad');
      return;
    }
    bearer = credentials.launch;
    try {
      const data = await request('/progress');
      // Server verifies HMAC + application ID + timestamp independently.
      active = true;
      showProgress(data);
      setChip('authStatus', 'Сервер: подпись проверена', 'good');
      setStatus('Проверка пользователя и серверного прогресса успешна.', 'good');
      // Signed parameters remain only in memory during this short-lived session.
    } catch (e) {
      stop(messageForError(e));
    }
  }

  $('claimButton').addEventListener('click', () => { void action('claim'); });
  $('drawButton').addEventListener('click', () => { void action('draw'); });
  void boot();
})();
