/* Safe, read-only VK login verification for the isolated developer URL.
 * Credentials are ephemeral and posted exclusively to the same-origin HMAC API.
 * No local/session storage, user profile display, analytics or game mutations. */
(() => {
  'use strict';

  const APP_ID = '54582199';
  const $ = id => document.getElementById(id);
  const state = $('state');
  const bridge = $('bridge');
  const signature = $('signature');
  const hint = $('hint');
  const button = $('retry');
  let busy = false;
  let credentials = null;

  function show(message, kind) {
    state.textContent = message;
    state.className = 'status' + (kind ? ' ' + kind : '');
  }
  function chip(node, message, kind) {
    node.textContent = message;
    node.className = 'chip' + (kind ? ' ' + kind : '');
  }

  function collectLaunch() {
    // VK Bridge's library was imported before this script and can see the
    // original launch URL. Remove signed parameters immediately afterwards.
    const params = new URLSearchParams(window.location.search);
    const signed = new URLSearchParams();
    const seen = new Set();
    let valid = true;
    for (const [key, value] of params) {
      if (key.startsWith('vk_') || key === 'sign') {
        if (seen.has(key)) valid = false;
        seen.add(key);
        signed.append(key, value);
      }
    }
    const raw = signed.toString();
    try {
      window.history.replaceState(null, '', window.location.pathname);
    } catch {
      // The original URL is still controlled by VK; never echo it into UI.
    }
    if (!valid || params.get('vk_app_id') !== APP_ID ||
        !/^[1-9]\d{0,15}$/.test(params.get('vk_user_id') || '') ||
        !/^\d{9,12}$/.test(params.get('vk_ts') || '') ||
        !/^[a-zA-Z0-9_-]{43}$/.test(params.get('sign') || '') ||
        raw.length > 8192 || raw.length < 20) {
      return null;
    }
    return { raw, userId: params.get('vk_user_id') };
  }

  async function check() {
    if (busy) return;
    if (!credentials) {
      chip(bridge, 'VK Bridge: не проверен', 'bad');
      chip(signature, 'Подпись: отсутствует', 'bad');
      show('Для теста откройте страницу из настроек разработчика VK Mini Apps, не обычной ссылкой в браузере.', 'bad');
      hint.textContent = 'Настоящий запуск VK добавит подписанные параметры. Не копируйте ссылку с ними и не отправляйте их никому.';
      return;
    }
    busy = true;
    button.disabled = true;
    show('Проверяем VK Bridge и подпись запуска…');
    chip(bridge, 'VK Bridge: проверяется');
    chip(signature, 'Подпись: ожидается');
    try {
      if (!window.vkBridge || typeof window.vkBridge.send !== 'function') {
        throw new Error('bridge_missing');
      }
      await window.vkBridge.send('VKWebAppInit');
      const user = await window.vkBridge.send('VKWebAppGetUserInfo');
      if (String(user?.id) !== credentials.userId) {
        throw new Error('identity_mismatch');
      }
      chip(bridge, 'VK Bridge: подтверждён', 'good');

      // Never put signed launch data in query, body, cookies, logs or external origins.
      const response = await fetch('/api/vk/verify', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + credentials.raw },
        cache: 'no-store',
        redirect: 'error',
        credentials: 'omit',
        referrerPolicy: 'no-referrer'
      });
      if (response.status === 401) throw new Error('invalid_signature');
      if (response.status === 503) throw new Error('not_configured');
      if (!response.ok) throw new Error('unavailable');
      const result = await response.json();
      if (result?.verified !== true || result?.appId !== 54582199 ||
          Object.keys(result).length !== 2) throw new Error('bad_response');

      show('Успех: VK Bridge и серверная HMAC-подпись подтверждены. Никакие данные игры не изменены.', 'good');
      chip(signature, 'Подпись: действительна', 'good');
      hint.textContent = 'Это только тест подлинного входа. Сохранение прогресса, карты, награды и платежи отключены.';
    } catch (err) {
      chip(signature, 'Подпись: не подтверждена', 'bad');
      const reason = err?.message;
      if (reason === 'bridge_missing') {
        show('VK Bridge недоступен. Откройте страницу через клиент ВК и проверьте загрузку библиотеки.', 'bad');
      } else if (reason === 'identity_mismatch') {
        show('Не совпадает пользователь ВК. Проверка остановлена.', 'bad');
      } else if (reason === 'invalid_signature') {
        show('Подпись запуска неверна или истекла. Запустите тест заново внутри ВК.', 'bad');
      } else if (reason === 'not_configured') {
        show('Сервер ещё не получил защищённый ключ Preview. Нужно новое тестовое развёртывание.', 'bad');
      } else {
        show('Не удалось проверить запуск. Проверьте вход в ВК и доступность защищённого API.', 'bad');
      }
      hint.textContent = 'На этом экране не показываются идентификаторы пользователя, параметры подписи и секреты.';
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  credentials = collectLaunch();
  button.addEventListener('click', () => { void check(); });
  void check();
})();