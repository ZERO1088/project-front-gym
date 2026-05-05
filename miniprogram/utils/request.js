const app = getApp();

const ROUTES = [
  { pattern: /^\/api\/student\/add$/, name: 'student', action: 'add', method: 'POST' },
  { pattern: /^\/api\/student\/list$/, name: 'student', action: 'list' },
  { pattern: /^\/api\/student\/bind-wechat$/, name: 'student', action: 'bindWechat', method: 'POST' },
  { pattern: /^\/api\/student\/me$/, name: 'student', action: 'me' },
  { pattern: /^\/api\/student\/calendar$/, name: 'student', action: 'calendar' },
  { pattern: /^\/api\/student\/courses-by-date$/, name: 'student', action: 'coursesByDate' },
  { pattern: /^\/api\/student\/([^/]+)\/classes$/, name: 'student', action: 'updateClasses', paramKey: 'studentId', method: 'POST' },
  { pattern: /^\/api\/student\/([^/]+)\/unbind$/, name: 'student', action: 'unbind', paramKey: 'studentId', method: 'POST' },
  { pattern: /^\/api\/student\/([^/]+)$/, name: 'student', action: 'delete', paramKey: 'studentId', method: 'DELETE' },
  { pattern: /^\/api\/course\/create$/, name: 'course', action: 'create', method: 'POST' },
  { pattern: /^\/api\/course\/list$/, name: 'course', action: 'list' },
  { pattern: /^\/api\/course\/weather$/, name: 'course', action: 'weather' },
  { pattern: /^\/api\/course\/confirm$/, name: 'course', action: 'confirm', method: 'POST' },
  { pattern: /^\/api\/course\/share-link$/, name: 'course', action: 'shareLink', method: 'POST' },
  { pattern: /^\/api\/course\/share-detail$/, name: 'course', action: 'shareDetail' },
  { pattern: /^\/api\/course\/share-confirm$/, name: 'course', action: 'shareConfirm', method: 'POST' },
  { pattern: /^\/api\/course\/complete$/, name: 'course', action: 'complete', method: 'POST' },
  { pattern: /^\/api\/course\/signin$/, name: 'course', action: 'signin', method: 'POST' },
  { pattern: /^\/api\/course\/history$/, name: 'course', action: 'history' },
  { pattern: /^\/api\/course\/([^/]+)\/cancel$/, name: 'course', action: 'cancel', paramKey: 'courseId', method: 'POST' },
  { pattern: /^\/api\/course\/([^/]+)$/, name: 'course', action: 'delete', paramKey: 'courseId', method: 'DELETE' },
  { pattern: /^\/api\/coach\/dashboard$/, name: 'coach', action: 'dashboard' },
  { pattern: /^\/api\/coach\/access-status$/, name: 'coach', action: 'accessStatus' },
  { pattern: /^\/api\/coach\/bind-invite$/, name: 'coach', action: 'bindInvite', method: 'POST' },
  { pattern: /^\/api\/coach\/create-invite$/, name: 'coach', action: 'createInvite', method: 'POST' },
  { pattern: /^\/api\/coach\/invite-list$/, name: 'coach', action: 'inviteList' },
  { pattern: /^\/api\/contract\/detail$/, name: 'contract', action: 'detail' },
  { pattern: /^\/api\/contract\/save$/, name: 'contract', action: 'save', method: 'POST' }
];

function parseApiUrl(url) {
  const [pathnamePart, searchPart = ''] = String(url || '').split('?');
  const query = {};

  searchPart
    .split('&')
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const [key, value = ''] = pair.split('=');
      if (!key) return;
      query[decodeURIComponent(key)] = decodeURIComponent(value);
    });

  return {
    pathname: pathnamePart.startsWith('/') ? pathnamePart : `/${pathnamePart}`,
    query
  };
}

function getErrorMessage(res) {
  if (!res) return '请求失败';
  if (typeof res.message === 'string' && res.message.trim()) return res.message.trim();
  if (res.data && typeof res.data.message === 'string' && res.data.message.trim()) {
    return res.data.message.trim();
  }
  if (typeof res.data === 'string' && res.data.trim()) return res.data.trim();
  return '请求失败';
}

function showNetworkError(error) {
  const errMsg = String((error && error.errMsg) || '');
  const title = errMsg.includes('timeout')
    ? '请求超时，请检查云函数和网络'
    : '请求失败，请检查云开发配置';

  wx.showToast({
    title,
    icon: 'none',
    duration: 3000
  });
}

function handleCoachAccessError(res) {
  const code = Number(res && res.code);
  const message = String((res && res.message) || '').toLowerCase();
  const noAccess = code === 403 && message.includes('coach access');
  if (!noAccess) return false;

  wx.showToast({
    title: '当前微信未开通教练权限，请先绑定邀请码',
    icon: 'none',
    duration: 2500
  });

  setTimeout(() => {
    wx.switchTab({
      url: '/pages/coach/coachProfile/index'
    });
  }, 250);

  return true;
}

function resolveRoute(url, method) {
  const { pathname, query } = parseApiUrl(url);
  const matched = ROUTES.find((route) => {
    const routeMethod = route.method || 'GET';
    if (routeMethod !== String(method || 'GET').toUpperCase()) return false;
    return route.pattern.test(pathname);
  });

  if (!matched) return null;

  const pathMatch = pathname.match(matched.pattern);
  const params = matched.paramKey && pathMatch ? { [matched.paramKey]: pathMatch[1] } : {};

  return {
    name: matched.name,
    action: matched.action,
    query,
    params
  };
}

function callCloudRoute({ url, method = 'GET', data = {} }) {
  const route = resolveRoute(url, method);
  if (!route) return Promise.reject(new Error(`unsupported api route: ${url}`));

  console.log('cloud route =>', {
    url,
    method,
    name: route.name,
    action: route.action,
    query: route.query,
    params: route.params
  });

  return wx.cloud.callFunction({
    name: route.name,
    data: {
      action: route.action,
      method,
      query: route.query,
      params: route.params,
      data
    }
  }).then((result) => {
    console.log('cloud result =>', {
      name: route.name,
      action: route.action,
      result
    });
    return result.result || {};
  }).catch((error) => {
    console.error('cloud call failed =>', {
      name: route.name,
      action: route.action,
      error
    });
    throw error;
  });
}

function callHttpRoute({ url, method = 'GET', data = {}, timeout = 10000 }) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${app.globalData.baseUrl}${url}`,
      method,
      data,
      timeout,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.code === 0) {
          resolve(res.data);
          return;
        }

        if (handleCoachAccessError(res.data || res)) {
          reject(res.data || res);
          return;
        }

        wx.showToast({
          title: getErrorMessage(res),
          icon: 'none',
          duration: 2500
        });
        reject(res.data || res);
      },
      fail: (error) => {
        showNetworkError(error);
        reject(error);
      }
    });
  });
}

function request({ url, method = 'GET', data = {}, timeout = 10000 }) {
  if (wx.cloud && typeof wx.cloud.callFunction === 'function') {
    return callCloudRoute({ url, method, data })
      .then((res) => {
        if (res && res.code === 0) return res;
        if (handleCoachAccessError(res)) return Promise.reject(res);
        wx.showToast({
          title: getErrorMessage(res),
          icon: 'none',
          duration: 2500
        });
        return Promise.reject(res);
      })
      .catch((error) => {
        console.error('[request] error =>', error);
        if (error && typeof error.code === 'number') return Promise.reject(error);
        showNetworkError(error);
        return Promise.reject(error);
      });
  }

  return callHttpRoute({ url, method, data, timeout });
}

module.exports = { request };
