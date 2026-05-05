const { request } = require('../../../utils/request');
const { formatDisplayDate } = require('../../../utils/date');
const { getStudentOpenId } = require('../../../utils/studentSession');

function formatHistoryItem(item) {
  const statusMap = {
    complete: '已完成',
    signin: '已签到'
  };

  return {
    ...item,
    date: formatDisplayDate(item.date),
    time_range: `${item.start_time}-${item.end_time}`,
    status_text: statusMap[item.status] || item.status || '-'
  };
}

Page({
  data: {
    date: '',
    history: []
  },

  onLoad(query) {
    this.setData({
      date: query.date || ''
    });
  },

  onShow() {
    this.fetchHistory();
  },

  async fetchHistory() {
    const openid = getStudentOpenId();
    if (!openid || !this.data.date) return;
    const res = await request({
      url: `/api/student/courses-by-date?openid=${encodeURIComponent(openid)}&date=${this.data.date}`
    });
    this.setData({
      history: (res.data || []).map(formatHistoryItem)
    });
  }
});
