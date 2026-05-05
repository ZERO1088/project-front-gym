const { formatDateInput, shiftDate, getWeekdayIndex } = require('../../../utils/date');

function buildWeekDays(selectedDate) {
  const labels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const activeIndex = getWeekdayIndex(selectedDate);

  return labels.map((label, index) => ({
    label,
    active: index === activeIndex
  }));
}

function buildSelectedWeekdayText(selectedDate) {
  const labels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  return labels[getWeekdayIndex(selectedDate)] || '';
}

Page({
  data: {
    weekDays: [],
    hours: Array.from({ length: 17 }, (_, i) => `${String(i + 5).padStart(2, '0')}:00`),
    selectedDate: '',
    selectedWeekdayText: ''
  },

  onLoad() {
    const selectedDate = formatDateInput();
    this.setData({
      selectedDate,
      weekDays: buildWeekDays(selectedDate),
      selectedWeekdayText: buildSelectedWeekdayText(selectedDate)
    });
  },

  pickDate(e) {
    const selectedDate = e.detail.value;
    this.setData({
      selectedDate,
      weekDays: buildWeekDays(selectedDate),
      selectedWeekdayText: buildSelectedWeekdayText(selectedDate)
    });
  },

  changeDate(e) {
    const diff = Number(e.currentTarget.dataset.diff || 0);
    const selectedDate = shiftDate(this.data.selectedDate, diff);
    this.setData({
      selectedDate,
      weekDays: buildWeekDays(selectedDate),
      selectedWeekdayText: buildSelectedWeekdayText(selectedDate)
    });
  },

  tapCell(e) {
    const hour = e.currentTarget.dataset.hour;
    wx.navigateTo({
      url: `/pages/coach/createCourse/index?start=${hour}&date=${this.data.selectedDate}`
    });
  }
});
