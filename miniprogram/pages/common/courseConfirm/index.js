const { request } = require('../../../utils/request');
const { formatDisplayDate } = require('../../../utils/date');
const { bindStudentByToken } = require('../../../utils/studentSession');

Page({
  data: {
    token: '',
    course_id: null,
    student_id: null,
    detail: null,
    loading: false
  },

  async onLoad(query) {
    this.setData({
      token: query.token || '',
      course_id: query.course_id ? String(query.course_id) : null,
      student_id: query.student_id ? String(query.student_id) : null
    });

    if (query.token) {
      await this.tryBindStudent(query.token);
      await this.fetchDetail(query.token);
    }
  },

  getStatusText(status) {
    const map = {
      pending: '待确认',
      accepted: '已确认',
      rejected: '已拒绝',
      completed: '已完成'
    };

    return map[status] || status || '-';
  },

  async tryBindStudent(token) {
    try {
      await bindStudentByToken(token);
    } catch (error) {
      console.log('student bind skipped', error && error.message ? error.message : error);
    }
  },

  async fetchDetail(token) {
    this.setData({ loading: true });
    try {
      const res = await request({
        url: `/api/course/share-detail?token=${token}`
      });

      this.setData({
        detail: res.data
          ? {
              ...res.data,
              date: formatDisplayDate(res.data.date),
              status_text: this.getStatusText(res.data.status)
            }
          : null
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  async confirm(e) {
    const action = e.currentTarget.dataset.action;
    const isTokenMode = Boolean(this.data.token);

    const res = await request({
      url: isTokenMode ? '/api/course/share-confirm' : '/api/course/confirm',
      method: 'POST',
      data: isTokenMode
        ? {
            token: this.data.token,
            action
          }
        : {
            course_id: this.data.course_id,
            student_id: this.data.student_id,
            action
          }
    });

    if (res.data) {
      this.setData({
        detail: {
          ...res.data,
          date: formatDisplayDate(res.data.date),
          status_text: this.getStatusText(res.data.status)
        }
      });
    }

    wx.showToast({
      title: action === 'accept' ? '已确认' : '已拒绝',
      icon: 'none'
    });
  }
});
