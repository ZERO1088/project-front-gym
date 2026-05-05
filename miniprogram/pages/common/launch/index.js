let timer = null;
let navigated = false;

function clearLaunchTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function isDevtools() {
  try {
    if (typeof wx.getDeviceInfo === 'function') {
      return wx.getDeviceInfo().platform === 'devtools';
    }
    return false;
  } catch (error) {
    return false;
  }
}

function navigateHome() {
  if (navigated) return;
  navigated = true;
  clearLaunchTimer();

  const api = isDevtools() ? wx.reLaunch : wx.switchTab;
  api({
    url: '/pages/coach/todo/index',
    fail(error) {
      console.error('[launch] navigate home failed', error);
    }
  });
}

Page({
  onLoad() {
    navigated = false;
    clearLaunchTimer();
    timer = setTimeout(() => {
      navigateHome();
    }, 1100);
  },

  onHide() {
    clearLaunchTimer();
  },

  onUnload() {
    clearLaunchTimer();
  },

  skip() {
    navigateHome();
  }
});
