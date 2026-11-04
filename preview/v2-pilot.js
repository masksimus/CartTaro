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
  // Verified historic, unmodified public-domain Rider–Waite–Smith 1909 scans.
  // Hosted by the user's working GitHub Pages site; never send signed VK
  // parameters, cookies or credentials to the image host.
  const CARD_ASSETS_ORIGIN = 'https://masksimus.github.io/CartTaro/art-preview/classic/';
  const CARD_FILES = Object.freeze(["00_Fool.jpg","01_Magician.jpg","02_High_Priestess.jpg","03_Empress.jpg","04_Emperor.jpg","05_Hierophant.jpg","06_Lovers.jpg","07_Chariot.jpg","08_Strength.jpg","09_Hermit.jpg","10_Wheel_of_Fortune.jpg","11_Justice.jpg","12_Hanged_Man.jpg","13_Death.jpg","14_Temperance.jpg","15_Devil.jpg","16_Tower.jpg","17_Star.jpg","18_Moon.jpg","19_Sun.jpg","20_Judgement.jpg","21_World.jpg"]);
  function cardImage(id, {eager = false, reversed = false} = {}) {
    if (!Number.isInteger(id) || id < 0 || id >= CARD_FILES.length) return null;
    const image = document.createElement('img');
    image.src = CARD_ASSETS_ORIGIN + CARD_FILES[id];
    image.alt = 'Оригинальная карта «' + CARD_NAMES[id] + '» (1909)' +
      (reversed ? ', перевёрнутая' : '');
    image.width = 720;
    image.height = 1200;
    image.loading = eager ? 'eager' : 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.draggable = false;
    if(reversed) image.classList.add('card-reversed');
    image.addEventListener('error', () => {
      // An unavailable image must never block gameplay or reveal private data.
      image.replaceWith(make('span','art-fallback','✧'));
    }, {once: true});
    return image;
  }

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
  let writesEnabled = false;
  let testPin = null;
  let isUnlocked = false;
  let profileId = null;
  let progress = null;
  let loadingProgress = false;
  let checkingPersistence = false;
  let readingBusy = false;
  let currentSpread = null;
  let revealedCards = new Set();

  const setText = (id, value) => { $(id).textContent = String(value); };
  const withTimeout = (task, ms) => {
    let timer;
    return Promise.race([
      Promise.resolve(task),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('bridge_timeout')), ms);
      })
    ]).finally(() => clearTimeout(timer));
  };

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
      if(opened) {
        const picture = cardImage(id);
        if(picture) tile.appendChild(picture);
        tile.appendChild(make('span','name',name));
        tile.title = 'Открытый Аркан: ' + name;
      } else {
        tile.appendChild(make('span', 'symbol', '✧'));
        tile.appendChild(make('span', 'name', 'Тайна'));
      }
      root.appendChild(tile);
    });
    setText('unlocked', unique.size + '/22');
  }

  function drawDailyCard(id) {
    const box = $('dailyCardDisplay');
    if (!Number.isInteger(id) || id < 0 || id >= CARD_FILES.length) {
      box.replaceChildren();
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.replaceChildren();
    const title = make('h3','daily-picture-title','Карта дня — ' + CARD_NAMES[id]);
    const image = cardImage(id,{eager:true});
    const help = make('p','daily-picture-note','Сохранена на сервере. При повторном входе показывается тот же Аркан.');
    box.append(title,image,help);
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
    drawDailyCard(data.dailyCardId);
    drawMissions(data.missions);
    drawAchievements(data.achievements);
    $('claimButton').disabled = !active || !writesEnabled || !isUnlocked || busy || data.claimedToday === true;
    $('drawButton').disabled = !active || !writesEnabled || !isUnlocked || busy || data.dailyCardDrawn === true;
  }

  async function request(endpoint, method = 'GET') {
    if (!bearer) throw new Error('missing_launch');
    // Same-origin API only: the VK signed launch cannot be sent to a domain
    // chosen via user query, form input, or localStorage.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 14000);
    let response;
    try {
      response = await fetch(api + endpoint, {
        method,
        headers: {
          Authorization: 'Bearer ' + bearer,
          ...(method === 'POST' && testPin ? { 'X-Taro-Test-Pin': testPin } : {})
        },
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('server_timeout');
      throw error;
    } finally {
      clearTimeout(timer);
    }
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
    if (e?.message === 'server_timeout') return 'Сервер не ответил за 14 секунд. Проверьте подключение Neon и откройте приложение через ВК заново.';
    if (e?.status === 403) return 'Код тестировщика не принят. Проверьте код и попробуйте снова.';
    if (e?.status === 503) return 'Тестовая база данных не подключена или временно недоступна. Прогресс не меняется.';
    if (e?.message === 'invalid_response') return 'Сервер вернул данные неверного формата.';
    return 'Нет связи с сервером. Проверьте подключение и повторно откройте тестовую страницу.';
  }

  function stop(message) {
    active = false;
    busy = false;
    writesEnabled = false;
    isUnlocked = false;
    testPin = null;
    $('pilotPin').value = '';
    $('pilotAccess').hidden = true;
    $('pilotUnlockButton').disabled = true;
    $('retryProgressButton').hidden = true;
    $('retryProgressButton').disabled = true;
    $('verifyPersistenceButton').hidden = true;
    $('verifyPersistenceButton').disabled = true;
    bearer = null;
    readingControlsBusy(true);
    $('claimButton').disabled = true;
    $('drawButton').disabled = true;
    setStatus(message, 'bad');
    setChip('authStatus', 'Сервер: не подтверждён', 'bad');
  }

  async function action(which) {
    if (!active || !writesEnabled || !isUnlocked || busy || !bearer || !progress) return;
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
        // Server owns the selected card; never generate a replacement locally.
        drawDailyCard(result.cardId);
        setStatus('Карта дня подтверждена сервером.', 'good');
      }
      showProgress(result.progress);
    } catch (e) {
      if (e.status === 401) return stop(messageForError(e));
      if (e.status === 403) {
        testPin = null;
        isUnlocked = false;
        $('pilotAccess').hidden = false;
        $('pilotPin').value = '';
        $('pilotUnlockButton').disabled = false;
      }
      setStatus(messageForError(e), 'bad');
    } finally {
      busy = false;
      if (active && progress) showProgress(progress);
    }
  }


  function setReadingStatus(message, error = false) {
    const node = $('readingStatus');
    node.textContent = message;
    node.className = 'reading-status' + (error ? ' bad' : '');
  }

  function readingControlsBusy(value) {
    $('spreadOneButton').disabled = value || !bearer;
    $('spreadThreeButton').disabled = value || !bearer;
  }

  function asRoman(n) {
    const vals = [[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
    if(n === 0) return '0';
    let s = '';
    for(const [value,symbol] of vals) {
      while(n >= value) { s += symbol; n -= value; }
    }
    return s;
  }

  function validSpread(spread, count) {
    if (!spread || spread.kind !== (count === 1 ? 'one' : 'three') ||
      !Array.isArray(spread.cards) || spread.cards.length !== count ||
      typeof spread.summary !== 'string' || spread.summary.length > 350) return false;
    const unique = new Set();
    for(const card of spread.cards) {
      if (!card || !Number.isInteger(card.id) || card.id < 0 || card.id > 21 ||
        unique.has(card.id) || typeof card.reversed !== 'boolean' ||
        !['name','title','sigil','position','meaning','advice'].every(key =>
          typeof card[key] === 'string' && card[key].length > 0 && card[key].length <= 350)) {
        return false;
      }
      unique.add(card.id);
    }
    return true;
  }

  function renderReadingCard(card, index) {
    const slot = make('div','reading-card-slot');
    slot.setAttribute('role','listitem');
    slot.appendChild(make('div','reading-position',card.position));
    const button = make('button','reading-card');
    button.type='button';
    button.setAttribute('aria-label','Перевернуть карту ' + (index + 1) + ': ' + card.position);
    const frame = make('span','reading-card-frame');
    const back = make('span','reading-card-side reading-card-back');
    back.appendChild(make('span','reading-back-sigil','✧'));
    back.appendChild(make('span','reading-back-bottom','ARCANA'));
    const front = make('span','reading-card-side reading-card-front');
    const picture = cardImage(card.id,{eager:true,reversed:card.reversed});
    if(picture) front.appendChild(picture);
    if(card.reversed) front.appendChild(make('span','reading-direction','ПЕРЕВЁРНУТАЯ'));
    frame.append(back,front);
    button.appendChild(frame);
    button.addEventListener('click',()=>{
      if(revealedCards.has(index))return;
      revealedCards.add(index);
      button.classList.add('revealed');
      button.disabled=true;
      button.setAttribute('aria-label',card.name + (card.reversed ? ', обратная карта' : ', прямая карта'));
      const detail=make('article','reading-meaning');
      detail.appendChild(make('p','reading-role',card.position + (card.reversed ? ' · обратное положение' : ' · прямое положение')));
      detail.appendChild(make('h3','',card.name + ' — ' + card.title));
      detail.appendChild(make('p','',card.meaning));
      detail.appendChild(make('p','reading-guidance','Для размышления: ' + card.advice));
      $('readingInterpretations').appendChild(detail);
      if(revealedCards.size === currentSpread.cards.length) {
        $('readingInterpretations').appendChild(make('p','reading-summary',currentSpread.summary));
        setReadingStatus('Расклад открыт. Вы можете выбрать другой вариант.');
      } else {
        setReadingStatus('Открыто карт: ' + revealedCards.size + ' из ' + currentSpread.cards.length);
      }
    });
    slot.appendChild(button);
    return slot;
  }

  async function requestSpread(count) {
    if(readingBusy || !bearer || (count !== 1 && count !== 3))return;
    readingBusy=true;
    readingControlsBusy(true);
    currentSpread=null;
    revealedCards=new Set();
    $('readingDeck').replaceChildren();
    $('readingInterpretations').replaceChildren();
    $('spreadOneButton').setAttribute('aria-pressed',String(count === 1));
    $('spreadThreeButton').setAttribute('aria-pressed',String(count === 3));
    setReadingStatus('Сервер перемешивает колоду…');
    const controller = new AbortController();
    const timer=setTimeout(()=>controller.abort(),14000);
    try {
      const path = count === 1 ? 'one' : 'three';
      const response = await fetch(api + '/spreads/' + path, {
        method:'GET',
        headers:{Authorization:'Bearer ' + bearer},
        cache:'no-store',
        credentials:'omit',
        redirect:'error',
        referrerPolicy:'no-referrer',
        signal:controller.signal
      });
      if(response.status === 401) {
        bearer=null;
        throw new Error('Сессия ВК истекла. Зайдите в приложение заново.');
      }
      if(!response.ok)throw new Error('Сервер раскладов временно не отвечает. Попробуйте позже.');
      const data=await response.json();
      if(!validSpread(data,count))throw new Error('Получены некорректные данные расклада.');
      currentSpread=data;
      const deck=$('readingDeck');
      deck.className='reading-deck' + (count === 1 ? ' single':'');
      deck.style.setProperty('--deck-columns',String(count));
      data.cards.forEach((card,i)=>deck.appendChild(renderReadingCard(card,i)));
      setReadingStatus(count === 1 ?
        'Карта перед вами. Нажмите на рубашку, чтобы открыть толкование.' :
        'Три карты перед вами. Переверните их по очереди.');
    } catch(error) {
      setReadingStatus(error.name === 'AbortError' ?
        'Сервер не ответил за 14 секунд. Выберите расклад ещё раз.' :
        (error.message || 'Нет связи с сервером.'), true);
    } finally {
      clearTimeout(timer);
      readingBusy=false;
      readingControlsBusy(false);
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
      setStatus('Проверяем VK Bridge…');
      await withTimeout(window.vkBridge.send('VKWebAppInit'), 10000);
      const user = await withTimeout(window.vkBridge.send('VKWebAppGetUserInfo'), 10000);
      if (!user || String(user.id) !== credentials.userId) {
        throw new Error('identity_mismatch');
      }
      profileId = String(user.id);
      setChip('bridgeStatus', 'VK Bridge: подключён', 'good');
    } catch (error) {
      stop(error?.message === 'bridge_timeout'
        ? 'VK Bridge не отвечает более 10 секунд. Полностью закройте приложение ВК и откройте заново.'
        : 'Не удалось подтвердить пользователя через VK Bridge. Откройте проверку внутри VK.');
      setChip('bridgeStatus', 'VK Bridge: ошибка', 'bad');
      return;
    }
    bearer = credentials.launch;
    readingControlsBusy(false);
    setReadingStatus('Выберите расклад. Карты будут выбраны на сервере.');
    await loadProgress();
  }

  // Preserve the signed launch in memory ONLY for a temporary retry.
  // No browser storage or URL token; no rewards on transient read errors.
  async function loadProgress() {
    if (!bearer || loadingProgress) return;
    loadingProgress = true;
    $('verifyPersistenceButton').disabled = true;
    $('retryProgressButton').hidden = true;
    $('retryProgressButton').disabled = true;
    setStatus('Подключаем сохранённый прогресс из Neon…');
    setChip('authStatus', 'Сервер: подключение…');
    try {
      let data;
      try {
        data = await request('/progress');
      } catch (firstError) {
        // One safe retry handles a suspended Neon compute or a cold Vercel
        // instance. Both attempts are GET; neither changes progress.
        if (firstError.message !== 'server_timeout' &&
            firstError.status !== 503 && firstError.status !== 504) {
          throw firstError;
        }
        setStatus('Сервер отвечает медленно. Повторяем безопасное чтение прогресса…');
        await new Promise(resolve => setTimeout(resolve, 500));
        data = await request('/progress');
      }
      writesEnabled = false;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        const statusResponse = await fetch(api + '/status', {
          cache: 'no-store', credentials: 'omit', redirect: 'error',
          referrerPolicy: 'no-referrer', signal: controller.signal
        });
        if (statusResponse.ok) {
          const readiness = await statusResponse.json();
          writesEnabled = readiness?.service === 'tarot-v2-postgres' &&
            readiness?.appId === 54582199 &&
            readiness?.storageConfigured === true &&
            readiness?.rewardsEnabled === true &&
            readiness?.mode === 'developer_pilot';
        }
      } catch (_) { /* Read-only is the only fallback. */ }
      finally { clearTimeout(timer); }
      active = true;
      showProgress(data);
      $('verifyPersistenceButton').hidden = false;
      $('verifyPersistenceButton').disabled = false;
      $('persistenceStatus').textContent = '';
      setChip('authStatus', 'Сервер: подпись проверена', 'good');
      $('pilotAccess').hidden = !writesEnabled;
      $('pilotUnlockButton').disabled = !writesEnabled;
      setStatus(writesEnabled ?
        'Вход подтверждён. Для тестовых наград введите код тестировщика ниже.' :
        'Вход подтверждён. Прогресс доступен только для чтения; начисления отключены.', 'good');
    } catch (error) {
      if (error?.status === 401) {
        stop(messageForError(error));
        return;
      }
      active = false;
      writesEnabled = false;
      isUnlocked = false;
      $('verifyPersistenceButton').disabled = true;
      $('verifyPersistenceButton').hidden = true;
      testPin = null;
      $('pilotPin').value = '';
      $('pilotAccess').hidden = true;
      $('claimButton').disabled = true;
      $('drawButton').disabled = true;
      setChip('authStatus', 'Сервер: подключение не удалось', 'bad');
      setStatus(messageForError(error) +
        ' Нажмите «Повторить соединение», не меняя настройки ВК.', 'bad');
      $('retryProgressButton').hidden = false;
    } finally {
      loadingProgress = false;
      $('retryProgressButton').disabled = !bearer;
    }
  }

  // GET-only verification for real Android VK WebView UAT. The signed VK launch
  // remains in memory; this never draws a new card or claims any rewards.
  async function verifyPersistence() {
    if (!active || !bearer || !progress || checkingPersistence || busy || loadingProgress) return;
    checkingPersistence = true;
    const button = $('verifyPersistenceButton');
    const status = $('persistenceStatus');
    const previous = progress;
    button.disabled = true;
    status.className = 'persist-status';
    status.textContent = 'Повторно читаем сохранение из Neon…';
    try {
      const remote = await request('/progress');
      if (!remote || !Array.isArray(remote.arcana) ||
          typeof remote.dayUtc !== 'string' ||
          !/^\\d{4}-\\d{2}-\\d{2}$/.test(remote.dayUtc) ||
          (remote.dailyCardId !== null &&
           (!Number.isInteger(remote.dailyCardId) || remote.dailyCardId < 0 || remote.dailyCardId > 21)) ||
          (remote.dailyCardDrawn === true) !== (remote.dailyCardId !== null)) {
        throw new Error('invalid_response');
      }
      const cardSame = remote.dailyCardId === previous.dailyCardId;
      const crystalsSame = remote.crystals === previous.crystals;
      const collectionSame = JSON.stringify([...remote.arcana].sort((a,b)=>a-b)) ===
        JSON.stringify([...previous.arcana].sort((a,b)=>a-b));
      const daySame = remote.dayUtc === previous.dayUtc;
      showProgress(remote);
      status.className = 'persist-status good';
      if (daySame && cardSame && crystalsSame && collectionSame) {
        status.textContent = 'Сохранение подтверждено сервером: карта дня, кристаллы и коллекция совпадают. Данные не изменялись.';
      } else if (!daySame) {
        status.textContent = 'На сервере начались новые сутки UTC. Загружено актуальное состояние без повторного начисления.';
      } else {
        status.textContent = 'Сервер вернул обновлённый прогресс. Данные на экране синхронизированы; начислений не было.';
      }
    } catch (error) {
      if (error?.status === 401) {
        stop(messageForError(error));
        return;
      }
      status.className = 'persist-status bad';
      status.textContent = 'Не удалось проверить сохранение. Прежние данные на экране сохранены, повторите проверку.';
    } finally {
      checkingPersistence = false;
      button.disabled = !active;
    }
  }

  async function unlockTester() {
    if (!active || !writesEnabled || busy || !bearer || isUnlocked) return;
    const candidate = $('pilotPin').value.trim();
    if (!/^[a-fA-F0-9]{32}$/.test(candidate)) {
      setStatus('Код тестировщика должен содержать 32 символа.', 'bad');
      return;
    }
    busy = true;
    testPin = candidate;
    $('pilotUnlockButton').disabled = true;
    setStatus('Проверяем код тестировщика…');
    try {
      const response = await request('/access', 'POST');
      if (response?.authorized !== true) throw new Error('invalid_response');
      isUnlocked = true;
      $('pilotPin').value = '';
      $('pilotAccess').hidden = true;
      setStatus('Тестовый доступ подтверждён. Можно получить одну награду и одну карту за сутки.', 'good');
    } catch (e) {
      testPin = null;
      isUnlocked = false;
      if (e.status === 401) return stop(messageForError(e));
      $('pilotPin').value = '';
      setStatus(messageForError(e), 'bad');
    } finally {
      busy = false;
      $('pilotUnlockButton').disabled = !active || !writesEnabled || isUnlocked;
      if (active && progress) showProgress(progress);
    }
  }
  $('spreadOneButton').addEventListener('click', () => { void requestSpread(1); });
  $('spreadThreeButton').addEventListener('click', () => { void requestSpread(3); });
  $('pilotUnlockButton').addEventListener('click', () => { void unlockTester(); });
  $('retryProgressButton').addEventListener('click', () => { void loadProgress(); });
  $('verifyPersistenceButton').addEventListener('click', () => { void verifyPersistence(); });
  $('claimButton').addEventListener('click', () => { void action('claim'); });
  $('drawButton').addEventListener('click', () => { void action('draw'); });
  void boot();
})();
