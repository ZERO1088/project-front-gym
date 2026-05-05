const { request } = require('../../../utils/request');
const { formatDateInput } = require('../../../utils/date');

const HOUR_OPTIONS = Array.from({ length: 19 }, (_, index) => String(index + 5).padStart(2, '0'));
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'));
const COLOR_OPTIONS = [
  { name: '曜石黑', value: '#111111' },
  { name: '深海蓝', value: '#4A90E2' },
  { name: '松石绿', value: '#34C7A1' },
  { name: '薄荷青', value: '#67C6C0' },
  { name: '暖橙', value: '#F6A25C' },
  { name: '雾粉', value: '#F28CA5' },
  { name: '薰衣草紫', value: '#8E7CF6' }
];

function decorateStudents(students, selectedIds, keyword = '') {
  const idSet = new Set(selectedIds);
  const search = String(keyword || '').trim().toLowerCase();

  return (students || [])
    .map((student) => ({
      ...student,
      selected: idSet.has(student.id)
    }))
    .filter((student) => {
      if (!search) return true;
      return (
        String(student.name || '').toLowerCase().includes(search) ||
        String(student.phone || '').toLowerCase().includes(search)
      );
    });
}

function getTimeIndexes(timeText = '09:00:00') {
  const [hour = '09', minute = '00'] = String(timeText).split(':');
  return {
    hourIndex: Math.max(HOUR_OPTIONS.indexOf(hour), 0),
    minuteIndex: Math.max(MINUTE_OPTIONS.indexOf(minute), 0)
  };
}

function buildTimeText(hourIndex, minuteIndex) {
  const hour = HOUR_OPTIONS[hourIndex] || HOUR_OPTIONS[0];
  const minute = MINUTE_OPTIONS[minuteIndex] || MINUTE_OPTIONS[0];
  return `${hour}:${minute}:00`;
}

function getNextHourTime(timeText = '09:00:00') {
  const { hourIndex } = getTimeIndexes(timeText);
  const nextHourIndex = Math.min(hourIndex + 1, HOUR_OPTIONS.length - 1);
  return {
    time: buildTimeText(nextHourIndex, 0),
    hourIndex: nextHourIndex,
    minuteIndex: 0
  };
}

function toMinutes(timeText = '00:00:00') {
  const [hour = '00', minute = '00'] = String(timeText).split(':');
  return Number(hour) * 60 + Number(minute);
}

Page({
  data: {
    form: {
      coach_id: 1,
      date: '',
      start_time: '',
      end_time: '',
      color: '#4A90E2',
      remark: ''
    },
    hourOptions: HOUR_OPTIONS,
    minuteOptions: MINUTE_OPTIONS,
    colorOptions: COLOR_OPTIONS,
    startHourIndex: 0,
    startMinuteIndex: 0,
    endHourIndex: 0,
    endMinuteIndex: 0,
    allStudents: [],
    students: [],
    selectedStudentIds: [],
    searchKeyword: '',
    loadingStudents: false,
    createdCourseSummary: null,
    submitting: false
  },

  async onLoad(query) {
    const startTime = query.start ? `${String(query.start).slice(0, 2)}:00:00` : '09:00:00';
    const nextHourTime = getNextHourTime(startTime);
    const startIndexes = getTimeIndexes(startTime);

    this.setData({
      'form.date': query.date || formatDateInput(),
      'form.start_time': startTime,
      'form.end_time': nextHourTime.time,
      startHourIndex: startIndexes.hourIndex,
      startMinuteIndex: startIndexes.minuteIndex,
      endHourIndex: nextHourTime.hourIndex,
      endMinuteIndex: nextHourTime.minuteIndex
    });

    await this.fetchStudents();
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`form.${key}`]: e.detail.value });
  },

  onDateChange(e) {
    this.setData({ 'form.date': e.detail.value });
  },

  onTimePartChange(e) {
    const type = e.currentTarget.dataset.type;
    const value = Number(e.detail.value || 0);
    this.setData({ [type]: value });
    this.syncTimeFields();
  },

  syncTimeFields() {
    this.setData({
      'form.start_time': buildTimeText(this.data.startHourIndex, this.data.startMinuteIndex),
      'form.end_time': buildTimeText(this.data.endHourIndex, this.data.endMinuteIndex)
    });
  },

  chooseColor(e) {
    this.setData({ 'form.color': e.currentTarget.dataset.value });
  },

  onSearchInput(e) {
    const searchKeyword = e.detail.value;
    this.setData({
      searchKeyword,
      students: decorateStudents(this.data.allStudents, this.data.selectedStudentIds, searchKeyword)
    });
  },

  async fetchStudents() {
    this.setData({ loadingStudents: true });
    try {
      const res = await request({ url: '/api/student/list' });
      const allStudents = res.data || [];
      this.setData({
        allStudents,
        students: decorateStudents(allStudents, this.data.selectedStudentIds, this.data.searchKeyword)
      });
    } catch (error) {
      console.log('fetch students failed', error);
      this.setData({
        allStudents: [],
        students: []
      });
    } finally {
      this.setData({ loadingStudents: false });
    }
  },

  toggleStudent(e) {
    const studentId = String(e.currentTarget.dataset.studentId);
    const selectedStudentIds = this.data.selectedStudentIds.slice();
    const index = selectedStudentIds.indexOf(studentId);

    if (index >= 0) {
      selectedStudentIds.splice(index, 1);
    } else {
      selectedStudentIds.push(studentId);
    }

    this.setData({
      selectedStudentIds,
      students: decorateStudents(this.data.allStudents, selectedStudentIds, this.data.searchKeyword)
    });
  },

  validateForm() {
    if (!this.data.selectedStudentIds.length) {
      wx.showToast({ title: '请先选择学员', icon: 'none' });
      return false;
    }

    if (toMinutes(this.data.form.end_time) <= toMinutes(this.data.form.start_time)) {
      wx.showToast({ title: '结束时间需要晚于开始时间', icon: 'none' });
      return false;
    }

    return true;
  },

  async submit() {
    if (this.data.submitting) return;
    if (!this.validateForm()) return;

    this.setData({ submitting: true });
    wx.showLoading({ title: '创建中', mask: true });

    try {
      const res = await request({
        url: '/api/course/create',
        method: 'POST',
        data: {
          ...this.data.form,
          remark: String(this.data.form.remark || '').trim(),
          student_ids: this.data.selectedStudentIds
        }
      });

      const targets = (res.data && res.data.share_targets) || [];
      this.setData({
        createdCourseSummary: {
          student_count: targets.length
        },
        selectedStudentIds: [],
        students: decorateStudents(this.data.allStudents, [], this.data.searchKeyword)
      });

      wx.hideLoading();
      wx.showToast({ title: '课程已创建', icon: 'success' });
    } catch (error) {
      wx.hideLoading();
      console.log('create course failed', error);
    } finally {
      this.setData({ submitting: false });
    }
  }
});
