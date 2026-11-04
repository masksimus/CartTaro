/* Readiness only. Never reads VK signed launch data or stores identities. */
(() => {
  'use strict';
  const state = document.getElementById('state');
  const hint = document.getElementById('hint');
  const retry = document.getElementById('retry');
  let busy = false;
  async function check() {
    if (busy) return;
    busy = true;
    retry.disabled = true;
    state.textContent = 'Проверяем состояние API…';
    try {
      const res = await fetch('/api/vk/status', {
        cache: 'no-store', credentials: 'omit', redirect: 'error',
        referrerPolicy: 'no-referrer'
      });
      if (!res.ok) throw new Error('status_unavailable');
      const data = await res.json();
      if (data?.service !== 'tarot-vk-auth-probe' ||
          data?.appId !== 54582199 || data?.rewardsEnabled !== false ||
          data?.persistentStorageConnected !== false ||
          data?.mode !== 'read_only' || typeof data?.configured !== 'boolean') {
        throw new Error('unexpected_response');
      }
      if (data.configured) {
        state.textContent = 'Серверная проверка подписи подготовлена. Начисления выключены.';
        hint.textContent = 'Это ещё не подтверждение входа в настоящем клиенте ВК. Нужен отдельный тестовый адрес VK Mini Apps и проверка подписанного запуска.';
      } else {
        state.textContent = 'Сервис доступен. Секрет VK на тестовом сервере пока не настроен.';
        hint.textContent = 'Установите VK_PROTECTED_KEY в Preview Environment проекта Vercel через закрытое поле, не отправляя его в чат, а затем создайте новое preview-развёртывание.';
      }
    } catch {
      state.textContent = 'Не получилось связаться с серверной функцией.';
      hint.textContent = 'Проверьте, что открыта ссылка тестовой версии, где опубликованы /api/vk/status и /api/vk/verify.';
    } finally {
      busy = false;
      retry.disabled = false;
    }
  }
  retry.addEventListener('click', () => { void check(); });
  void check();
})();