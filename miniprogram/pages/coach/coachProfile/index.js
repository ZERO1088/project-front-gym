const { request } = require('../../../utils/request');
const { formatDateInput } = require('../../../utils/date');

function normalizeInviteStatus(status = '', expiresAt = '') {
  const value = String(status || '').toLowerCase();
  const expired = expiresAt && new Date(expiresAt.replace(/-/g, '/')).getTime() < Date.now();
  if (expired && value === 'active') return { text: '已过期', className: 'status-muted' };
  if (value === 'used') return { text: '已使用', className: 'status-completed' };
  if (value === 'active') return { text: '生效中', className: 'status-available' };
  return { text: status || '-', className: 'status-muted' };
}

Page({
  data: {
    profile: {
      avatar_text: '教',
      name: '教练',
      phone: '',
      today_courses: 0,
      tomorrow_courses: 0,
      monthly_courses: 0,
      pending_students: 0
    },
    quickActions: [
      {
        title: '合同记录',
        subtitle: '上传合同照片并补充内容（教练/管理员可编辑）',
        url: '/pages/common/contractRecord/index?role=coach'
      }
    ],
    access: {
      has_access: false,
      is_manager: false,
      coach_name: '',
      coach_phone: ''
    },
    inviteCode: '',
    newCoachName: '',
    newCoachPhone: '',
    latestInvite: null
  },

  _fetchingDashboard: false,
  _fetchingAccess: false,

  onShow() {
    this.initPage();
  },

  async initPage() {
    await this.fetchAccessStatus();
    if (this.data.access.has_access) {
      await this.fetchDashboard();
    }
  },

  async fetchAccessStatus() {
    if (this._fetchingAccess) return;
    this._fetchingAccess = true;
    try {
      const res = await request({ url: '/api/coach/access-status' });
      this.setData({ access: res.data || this.data.access });
    } catch (error) {
      console.log('fetch access status failed', error);
    } finally {
      this._fetchingAccess = false;
    }
  },

  async fetchDashboard() {
    if (this._fetchingDashboard) return;
    this._fetchingDashboard = true;
    try {
      const res = await request({ url: `/api/coach/dashboard?date=${formatDateInput()}` });
      this.setData({
        profile: {
          ...this.data.profile,
          ...(res.data || {})
        }
      });
    } catch (error) {
      console.log('fetch dashboard failed', error);
    } finally {
      this._fetchingDashboard = false;
    }
  },

  onInviteCodeInput(e) {
    this.setData({ inviteCode: e.detail.value });
  },

  onNewCoachNameInput(e) {
    this.setData({ newCoachName: e.detail.value });
  },

  onNewCoachPhoneInput(e) {
    this.setData({ newCoachPhone: e.detail.value });
  },

  async bindInvite() {
    const code = String(this.data.inviteCode || '').trim().toUpperCase();
    if (!code) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' });
      return;
    }
    try {
      await request({
        url: '/api/coach/bind-invite',
        method: 'POST',
        data: { code }
      });
      wx.showToast({ title: '绑定成功', icon: 'none' });
      this.setData({ inviteCode: '' });
      await this.initPage();
    } catch (error) {
      console.log('bind invite failed', error);
    }
  },

  async createInvite() {
    const name = String(this.data.newCoachName || '').trim();
    const phone = String(this.data.newCoachPhone || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入新教练姓名', icon: 'none' });
      return;
    }
    if (!phone) {
      wx.showToast({ title: '请输入新教练手机号', icon: 'none' });
      return;
    }

    try {
      const res = await request({
        url: '/api/coach/create-invite',
        method: 'POST',
        data: { name, phone, expires_days: 7 }
      });
      const latestInvite = res.data
        ? {
            ...res.data,
            ...normalizeInviteStatus('active', res.data.expires_at)
          }
        : null;
      wx.showToast({ title: '邀请码已生成', icon: 'none' });
      this.setData({ newCoachName: '', newCoachPhone: '', latestInvite });
    } catch (error) {
      console.log('create invite failed', error);
    }
  },

  copyLatestInvite() {
    const code = String((this.data.latestInvite || {}).code || '').trim();
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'none' })
    });
  },

  goAction(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url });
  },

  onShareAppMessage() {
    return {
      title: '教练工作台',
      path: '/pages/coach/coachProfile/index'
    };
  }
});
