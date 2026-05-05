const { request } = require('../../../utils/request');
const { formatDateInput, formatDisplayDate, shiftDate } = require('../../../utils/date');

function normalizeCourseColor(color) {
  const colorAliases = {
    红色: '#FF6B6B',
    蓝色: '#4A90E2',
    绿色: '#34C7A1',
    紫色: '#8E7CF6',
    橙色: '#F6A25C',
    粉色: '#F28CA5',
    黑色: '#111111'
  };
  if (!color) return '#4A90E2';
  if (colorAliases[color]) return colorAliases[color];
  return /^#([0-9a-fA-F]{6})$/.test(color) ? color : '#4A90E2';
}

function getStudentStatus(student) {
  if (student.status === 'pending') return { text: '待确认', className: 'status-pending' };
  if (student.status === 'completed') return { text: '已完成', className: 'status-completed' };
  if (student.status === 'accepted') return { text: '已确认', className: 'status-accepted' };
  return { text: '已拒绝', className: 'status-rejected' };
}

function getCourseStatus(course) {
  const studentCount = Number(course.student_count || 0);
  const completedCount = Number(course.completed_count || 0);
  const pendingCount = Number(course.pending_count || 0);
  const acceptedCount = Number(course.accepted_count || 0);

  if (studentCount > 0 && completedCount >= studentCount) {
    return { text: '已完成', className: 'status-completed' };
  }
  if (pendingCount > 0) {
    return { text: '待确认', className: 'status-pending' };
  }
  if (acceptedCount > 0) {
    return { text: '已确认', className: 'status-accepted' };
  }
  return { text: '已排课', className: 'status-available' };
}

function formatCourses(courses) {
  return (courses || []).map((course) => {
    const students = (course.course_students || []).map((student) => ({
      ...student,
      share_label: student.status === 'pending' ? '发送确认' : '再次发送',
      ...getStudentStatus(student)
    }));
    const studentCount = students.length;

    return {
      ...course,
      showActions: false,
      course_color: normalizeCourseColor(course.color),
      display_date: formatDisplayDate(course.date),
      time_range: `${course.start_time}-${course.end_time}`,
      summary_text: `待确认 ${course.pending_count} · 已确认 ${course.accepted_count} · 已完成 ${course.completed_count}`,
      student_count: studentCount,
      students,
      ...getCourseStatus({
        ...course,
        student_count: studentCount
      })
    };
  });
}

function calcOverview(courses) {
  return (courses || []).reduce(
    (acc, course) => ({
      course_count: acc.course_count + 1,
      pending_count: acc.pending_count + Number(course.pending_count || 0),
      completed_count: acc.completed_count + Number(course.completed_count || 0)
    }),
    { course_count: 0, pending_count: 0, completed_count: 0 }
  );
}

function isDateInWeatherWindow(dateString) {
  const selected = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(selected.getTime())) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const max = new Date(today);
  max.setDate(max.getDate() + 3);
  return selected >= today && selected <= max;
}

Page({
  data: {
    selectedDate: '',
    courses: [],
    swipeStartX: 0,
    actionCourseId: null,
    loading: false,
    loadingWeather: false,
    overview: {
      course_count: 0,
      pending_count: 0,
      completed_count: 0
    },
    weather: {
      known: false,
      date: '',
      city: '',
      summary: '天气未知',
      max_temp: null,
      min_temp: null
    }
  },

  _fetchingCourses: false,
  _fetchingWeather: false,

  onLoad() {
    this.setData({ selectedDate: formatDateInput() });
  },

  onShow() {
    this.refreshPageData();
  },

  async refreshPageData() {
    await Promise.all([this.fetchCourses(), this.fetchWeather()]);
  },

  async fetchCourses() {
    if (this._fetchingCourses) return;
    this._fetchingCourses = true;
    this.setData({ loading: true });
    try {
      const res = await request({ url: `/api/course/list?date=${this.data.selectedDate}` });
      const courses = formatCourses(res.data || []);
      this.setData({ courses, overview: calcOverview(courses) });
    } catch (error) {
      console.error('fetch courses failed', error);
      this.setData({
        courses: [],
        overview: { course_count: 0, pending_count: 0, completed_count: 0 }
      });
    } finally {
      this._fetchingCourses = false;
      this.setData({ loading: false });
    }
  },

  async fetchWeather() {
    const date = this.data.selectedDate;
    if (!isDateInWeatherWindow(date)) {
      this.setData({
        weather: {
          known: false,
          date,
          city: '',
          summary: '天气未知',
          max_temp: null,
          min_temp: null
        }
      });
      return;
    }

    if (this._fetchingWeather) return;
    this._fetchingWeather = true;
    this.setData({ loadingWeather: true });
    try {
      const res = await request({ url: `/api/course/weather?date=${date}` });
      this.setData({
        weather: {
          known: Boolean((res.data || {}).known),
          date: (res.data || {}).date || date,
          city: (res.data || {}).city || '',
          summary: (res.data || {}).summary || '天气未知',
          max_temp: (res.data || {}).max_temp,
          min_temp: (res.data || {}).min_temp
        }
      });
    } catch (error) {
      console.error('fetch weather failed', error);
      this.setData({
        weather: {
          known: false,
          date,
          city: '',
          summary: '天气未知',
          max_temp: null,
          min_temp: null
        }
      });
    } finally {
      this._fetchingWeather = false;
      this.setData({ loadingWeather: false });
    }
  },

  async pickDate(e) {
    this.setData({ selectedDate: e.detail.value });
    await this.refreshPageData();
  },

  async changeDate(e) {
    this.setData({
      selectedDate: shiftDate(this.data.selectedDate, Number(e.currentTarget.dataset.diff || 0))
    });
    await this.refreshPageData();
  },

  goCreateCourse() {
    wx.navigateTo({ url: `/pages/coach/createCourse/index?date=${this.data.selectedDate}` });
  },

  onTouchStart(e) {
    this.setData({ swipeStartX: e.changedTouches[0].clientX });
  },

  onTouchEnd(e) {
    const endX = e.changedTouches[0].clientX;
    const diff = endX - this.data.swipeStartX;
    const courseId = String(e.currentTarget.dataset.courseId);
    const shouldOpen = diff < -50;
    this.setData({
      courses: this.data.courses.map((course) => ({
        ...course,
        showActions: course.id === courseId ? shouldOpen : false
      }))
    });
  },

  closeSwipe() {
    if (!this.data.courses.some((course) => course.showActions)) return;
    this.setData({
      courses: this.data.courses.map((course) => ({ ...course, showActions: false }))
    });
  },

  async cancelCourse(e) {
    const courseId = String(e.currentTarget.dataset.courseId);
    if (this.data.actionCourseId) return;
    this.setData({ actionCourseId: courseId });
    try {
      await request({ url: `/api/course/${courseId}/cancel`, method: 'POST' });
      wx.showToast({ title: '课程已取消', icon: 'none' });
      await this.fetchCourses();
    } catch (error) {
      console.log('cancel course failed', error);
    } finally {
      this.setData({ actionCourseId: null });
    }
  },

  deleteCourse(e) {
    const courseId = String(e.currentTarget.dataset.courseId);
    if (this.data.actionCourseId) return;
    wx.showModal({
      title: '删除课程',
      content: '确认删除这节课程吗？已确认或已完成课程无法删除。',
      success: async (res) => {
        if (!res.confirm || this.data.actionCourseId) return;
        this.setData({ actionCourseId: courseId });
        try {
          await request({ url: `/api/course/${courseId}`, method: 'DELETE' });
          wx.showToast({ title: '课程已删除', icon: 'none' });
          await this.fetchCourses();
        } catch (error) {
          console.log('delete course failed', error);
        } finally {
          this.setData({ actionCourseId: null });
        }
      }
    });
  },

  onShareAppMessage(res) {
    if (res.from === 'button') {
      const { sharePath, shareTitle } = res.target.dataset;
      return { title: shareTitle || '课程确认', path: sharePath };
    }
    return { title: '教练课程', path: '/pages/coach/todo/index' };
  }
});
