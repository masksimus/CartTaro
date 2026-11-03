/* Taro V2: optional daily engagement module.
   No purchases or redeemable currency: crystals currently represent progress only. */
(function () {
  'use strict';

  const KEY = 'taro_engagement_v1';
  const REWARDS = [10, 15, 20, 25, 30, 35, 50];
  const emptyState = () => ({ balance: 0, streak: 0, totalClaims: 0, lastClaimDate: '' });
  const element = (id) => document.getElementById(id);
  let adapter = null;
  let state = emptyState();
  let ready = false;
  let saving = false;
  let lastError = '';

  function dateKey(date = new Date()) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  function dayIndex(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    const parts = key.split('-').map(Number);
    const utc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
    const check = new Date(utc);
    if (check.getUTCFullYear() !== parts[0] ||
        check.getUTCMonth() !== parts[1] - 1 ||
        check.getUTCDate() !== parts[2]) return null;
    return Math.floor(utc / 86400000);
  }

  function normalize(raw) {
    if (!raw) return emptyState();
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyState();
      const asCount = (n) => Number.isSafeInteger(n) && n >= 0 ? Math.min(n, 999999) : 0;
      return {
        balance: asCount(value.balance),
        streak: asCount(value.streak),
        totalClaims: asCount(value.totalClaims),
        lastClaimDate: dayIndex(value.lastClaimDate) === null ? '' : value.lastClaimDate
      };
    } catch (_) {
      return emptyState();
    }
  }

  function consecutiveToday(model, today) {
    const current = dayIndex(today);
    const previous = dayIndex(model.lastClaimDate);
    if (previous === null || current === null) return 0;
    const gap = current - previous;
    return gap >= 0 && gap <= 1 ? model.streak : 0;
  }

  function nextStreak(model, today) {
    return consecutiveToday(model, today) + 1;
  }

  function rewardFor(streak) {
    return REWARDS[(Math.max(streak, 1) - 1) % REWARDS.length];
  }

  function render() {
    if (!element('rewardClaimButton')) return;
    const today = dateKey();
    const claimed = state.lastClaimDate === today;
    const futureDate = dayIndex(state.lastClaimDate) !== null &&
                       dayIndex(state.lastClaimDate) > dayIndex(today);
    const upcoming = nextStreak(state, today);
    const activeStreak = consecutiveToday(state, today);
    element('rewardBalance').textContent = String(state.balance);
    element('rewardStreak').textContent = String(activeStreak);
    element('rewardClaimButton').disabled = !ready || saving || claimed || futureDate;
    element('rewardClaimButton').textContent =
      saving ? 'Сохраняем награду…' :
      claimed ? 'Награда за сегодня получена' :
      futureDate ? 'Проверьте дату устройства' :
      'Получить +' + rewardFor(upcoming) + ' ✦';
    element('rewardMessage').textContent = lastError ||
      (claimed ? 'Возвращайтесь завтра за следующей наградой.' :
       'Заходите ежедневно, чтобы увеличивать серию посещений.');

    const track = element('rewardWeek');
    track.replaceChildren();
    const step = (claimed ? state.streak : upcoming - 1) % 7 + 1;
    for (let i = 1; i <= REWARDS.length; i++) {
      const day = document.createElement('span');
      day.className = 'reward-day' +
        (i === step ? ' reward-day-current' : '');
      day.textContent = String(i) + ' · ' + String(REWARDS[i - 1]);
      day.setAttribute('aria-label', 'День ' + i + ': ' + REWARDS[i - 1] + ' кристаллов');
      track.appendChild(day);
    }
  }

  async function init(storageAdapter) {
    adapter = storageAdapter;
    lastError = '';
    try {
      state = normalize(await adapter.storageGet(KEY));
      ready = true;
    } catch (error) {
      ready = false;
      lastError = 'Не удалось загрузить награды. Проверьте соединение.';
      console.warn('Tarot reward init failed', error);
    }
    render();
    return ready;
  }

  async function claim() {
    if (!ready || !adapter || saving) return;
    const today = dateKey();
    if (state.lastClaimDate === today ||
        (dayIndex(state.lastClaimDate) !== null &&
         dayIndex(state.lastClaimDate) > dayIndex(today))) {
      render();
      return;
    }
    saving = true;
    lastError = '';
    render();
    try {
      // Re-read before writing to limit duplicate claims from multiple app views.
      const fresh = normalize(await adapter.storageGet(KEY));
      if (fresh.lastClaimDate === today) {
        state = fresh;
      } else {
        if (dayIndex(fresh.lastClaimDate) !== null &&
            dayIndex(fresh.lastClaimDate) > dayIndex(today)) {
          state = fresh;
          throw new Error('Device date precedes the stored claim date');
        }
        const streak = nextStreak(fresh, today);
        const reward = rewardFor(streak);
        const next = {
          balance: Math.min(fresh.balance + reward, 999999),
          streak: streak,
          totalClaims: Math.min(fresh.totalClaims + 1, 999999),
          lastClaimDate: today
        };
        const encoded = JSON.stringify(next);
        await adapter.storageSet(KEY, encoded);
        // The legacy Bridge wrapper suppresses write errors; verify readback.
        const verified = await adapter.storageGet(KEY);
        if (verified !== encoded) throw new Error('Reward storage verification failed');
        state = next;
      }
    } catch (error) {
      lastError = 'Награда не сохранилась. Попробуйте снова.';
      console.warn('Tarot reward save failed', error);
    } finally {
      saving = false;
      render();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ready) render();
  });
  window.TarotEngagement = { init, claim };
}());
