// 설치 상태는 표시만 합니다. 기기 등록·권한·토큰을 만들거나 저장하지 않습니다.
(() => {
  const installButton = document.querySelector('#install-button');
  const installStatus = document.querySelector('#install-status');
  const connectionStatus = document.querySelector('#connection-status');
  const offlineNotice = document.querySelector('#offline-notice');
  let installPrompt = null;
  let prompting = false;
  const standalone = globalThis.matchMedia?.('(display-mode: standalone)');
  const isInstalled = () => standalone?.matches === true || navigator.standalone === true;
  let installed = isInstalled();

  function updateInstall() {
    installButton.hidden = installed || !installPrompt;
    installButton.disabled = prompting || navigator.onLine === false;
    installStatus.textContent = installed
      ? '앱 설치 또는 앱 실행 상태가 확인되었습니다. 기기 승인은 별도로 확인해야 합니다.'
      : installPrompt ? '브라우저에서 자료실 앱을 설치할 수 있습니다.'
        : '설치는 브라우저 메뉴의 앱 설치 또는 홈 화면에 추가에서 확인하세요.';
  }
  function updateConnection() {
    const offline = navigator.onLine === false;
    document.documentElement.setAttribute('data-offline', String(offline));
    offlineNotice.hidden = !offline;
    connectionStatus.textContent = offline ? '현재 오프라인입니다.' : '인터넷에 연결되어 있습니다.';
    updateInstall();
  }
  globalThis.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    updateInstall();
  });
  globalThis.addEventListener('appinstalled', () => {
    installed = true;
    installPrompt = null;
    updateInstall();
  });
  standalone?.addEventListener?.('change', () => { installed = isInstalled(); updateInstall(); });
  globalThis.addEventListener('online', updateConnection);
  globalThis.addEventListener('offline', updateConnection);
  installButton.addEventListener('click', async () => {
    if (!installPrompt || prompting || navigator.onLine === false) return;
    const prompt = installPrompt;
    installPrompt = null;
    prompting = true;
    updateInstall();
    let failed = false;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      failed = true;
    } finally {
      prompting = false;
      updateInstall();
      if (failed) installStatus.textContent = '설치 확인을 열지 못했습니다. 브라우저 메뉴에서 확인해 주세요.';
    }
  });
  updateConnection();
})();
