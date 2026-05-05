const { request } = require('../../../utils/request');
const { formatDateInput, formatDisplayDate } = require('../../../utils/date');
const { fetchCurrentStudent, getStudentOpenId } = require('../../../utils/studentSession');

function pad(value) {
  return String(value).padStart(2, '0');
}

function getMonthText(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function shiftMonth(monthText, diff) {
  const [year, month] = String(monthText).split('-').map(Number);
  const date = new Date(year, month - 1 + diff, 1);
  return getMonthText(date);
}

function buildCalendar(monthText, highlighted = {}, selectedDate = '') {
  const [year, month] = monthText.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekDay = (firstDay.getDay() + 6) % 7;
  const cells = [];

  for (let index = 0; index < firstWeekDay; index += 1) {
    cells.push({ empty: true, key: `empty-${index}` });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${monthText}-${pad(day)}`;
    cells.push({
      key: date,
      date,
      day,
      active: date === selectedDate,
      highlighted: Boolean(highlighted[date]),
      count: highlighted[date] || 0
    });
  }

  return cells;
}

function formatCourseItem(item) {
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
    student: null,
    monthText: getMonthText(),
    weekLabels: ['一', '二', '三', '四', '五', '六', '日'],
    calendarDays: [],
    selectedDate: formatDateInput(),
    selectedCourses: [],
    loading: false,
    unbound: false
  },

  onShow() {
    this.bootstrap();
  },

  async bootstrap() {
    const openid = getStudentOpenId();
    if (!openid) {
      this.setData({
        student: null,
        unbound: true,
        selectedCourses: [],
        calendarDays: buildCalendar(this.data.monthText, {}, this.data.selectedDate)
      });
      return;
    }

    this.setData({ loading: true, unbound: false });
    try {
      const student = await fetchCurrentStudent();
      const selectedDate = this.data.selectedDate || formatDateInput();
      this.setData({ student, selectedDate });
      await this.fetchCalendarData(this.data.monthText, selectedDate);
    } finally {
      this.setData({ loading: false });
    }
  },

  async fetchCalendarData(monthText, selectedDate) {
    const openid = getStudentOpenId();
    if (!openid) return;

    const [calendarRes, courseRes] = await Promise.all([
      request({
        url: `/api/student/calendar?openid=${encodeURIComponent(openid)}&month=${monthText}`
      }),
      request({
        url: `/api/student/courses-by-date?openid=${encodeURIComponent(openid)}&date=${selectedDate}`
      })
    ]);

    const highlighted = (calendarRes.data || []).reduce((map, item) => {
      map[item.date] = item.course_count;
      return map;
    }, {});

    this.setData({
      monthText,
      selectedDate,
      calendarDays: buildCalendar(monthText, highlighted, selectedDate),
      selectedCourses: (courseRes.data || []).map(formatCourseItem)
    });
  },

  async changeMonth(e) {
    const diff = Number(e.currentTarget.dataset.diff || 0);
    const monthText = shiftMonth(this.data.monthText, diff);
    const selectedDate = `${monthText}-01`;
    await this.fetchCalendarData(monthText, selectedDate);
  },

  async pickDay(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    await this.fetchCalendarData(this.data.monthText, date);
  },

  goProfile() {
    wx.navigateTo({ url: '/pages/student/profile/index' });
  }
});
