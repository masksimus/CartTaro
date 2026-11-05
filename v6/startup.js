/* Run immediately after the local Bridge (which detects its platform from URL).
 * Credentials live only in this closure until taken by app.js. Never log them. */
(() => {
  let raw = location.search;
  history.replaceState(null, '', location.pathname);
  window.takeTarotLaunch = () => { const value = raw; raw = ''; delete window.takeTarotLaunch; return value; };
  window.tarotStartupTimer = setTimeout(() => {
    const main = document.getElementById('content');
    if (main) {
      main.querySelector('p').textContent = 'Не удалось загрузить игру. Проверьте сеть и попробуйте ещё раз. Ваш прогресс не изменён.';
      const button = document.getElementById('startup-retry');
      button.hidden = false;
      button.onclick = () => location.reload();
    }
  }, 8000);
})();
