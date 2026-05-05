const { request } = require('./request');

const STORAGE_KEY = 'student_openid';

function getStudentOpenId() {
  return wx.getStorageSync(STORAGE_KEY) || '';
}

function setStudentOpenId(openid) {
  if (!openid) return;
  wx.setStorageSync(STORAGE_KEY, openid);
}

function clearStudentOpenId() {
  wx.removeStorageSync(STORAGE_KEY);
}

async function bindStudentByToken(token) {
  if (!token) return null;
  const res = await request({
    url: '/api/student/bind-wechat',
    method: 'POST',
    data: { token }
  });

  if (res.data && res.data.openid) {
    setStudentOpenId(res.data.openid);
  }

  return res.data || null;
}

async function fetchCurrentStudent() {
  const openid = getStudentOpenId();
  if (!openid) return null;
  const res = await request({
    url: `/api/student/me?openid=${encodeURIComponent(openid)}`
  });
  return res.data || null;
}

module.exports = {
  getStudentOpenId,
  setStudentOpenId,
  clearStudentOpenId,
  bindStudentByToken,
  fetchCurrentStudent
};
