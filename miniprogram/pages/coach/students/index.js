const { request } = require('../../../utils/request');
const { formatDisplayDate } = require('../../../utils/date');

function formatStudent(student, highlightedPhone = '') {
  return {
    ...student,
    expanded: Boolean(student.expanded),
    is_new: highlightedPhone && String(student.phone || '') === String(highlightedPhone),
    display_birthday: student.birthday ? formatDisplayDate(student.birthday) : '-',
    display_gender: student.gender || '-',
    display_height: student.height || '-',
    display_weight: student.weight || '-',
    display_goal: student.goal || '-',
    display_remark: student.remark || '-'
  };
}

Page({
  data: {
    students: [],
    updatingStudentId: null,
    actionStudentId: null
  },

  _fetching: false,

  onShow() {
    this.fetchStudents();
  },

  async fetchStudents() {
    if (this._fetching) return;

    this._fetching = true;
    const highlightedPhone = wx.getStorageSync('lastCreatedStudentPhone') || '';

    try {
      const res = await request({ url: '/api/student/list' });
      this.setData({
        students: (res.data || []).map((student) => formatStudent(student, highlightedPhone))
      });

      if (highlightedPhone) {
        setTimeout(() => {
          this.setData({
            students: this.data.students.map((student) => ({
              ...student,
              is_new: false
            }))
          });
          wx.removeStorageSync('lastCreatedStudentPhone');
        }, 2600);
      }
    } catch (error) {
      console.log('fetch students failed', error);
      this.setData({ students: [] });
    } finally {
      this._fetching = false;
    }
  },

  async adjustClasses(e) {
    const studentId = String(e.currentTarget.dataset.studentId);
    const mode = e.currentTarget.dataset.mode;
    if (this.data.updatingStudentId) return;

    this.setData({ updatingStudentId: studentId });
    try {
      const res = await request({
        url: `/api/student/${studentId}/classes`,
        method: 'POST',
        data: {
          mode,
          value: 1
        }
      });

      const nextStudents = this.data.students.map((student) => {
        if (student.id !== studentId) return student;
        return formatStudent(
          {
            ...student,
            ...res.data
          },
          ''
        );
      });

      this.setData({ students: nextStudents });
      wx.showToast({
        title: mode === 'increase' ? '已增加 1 次' : '已减少 1 次',
        icon: 'none'
      });
    } catch (error) {
      console.log('adjust classes failed', error);
    } finally {
      this.setData({ updatingStudentId: null });
    }
  },

  deleteStudent(e) {
    const studentId = String(e.currentTarget.dataset.studentId);
    const studentName = e.currentTarget.dataset.studentName;

    wx.showModal({
      title: '删除学员',
      content: `确认删除 ${studentName} 吗？已有上课记录的学员无法删除。`,
      success: async (res) => {
        if (!res.confirm || this.data.actionStudentId) return;

        this.setData({ actionStudentId: studentId });
        try {
          await request({
            url: `/api/student/${studentId}`,
            method: 'DELETE'
          });

          this.setData({
            students: this.data.students.filter((student) => student.id !== studentId)
          });

          wx.showToast({
            title: '学员已删除',
            icon: 'none'
          });
        } catch (error) {
          console.log('delete student failed', error);
        } finally {
          this.setData({ actionStudentId: null });
        }
      }
    });
  },

  toggleExpand(e) {
    const studentId = String(e.currentTarget.dataset.studentId);
    this.setData({
      students: this.data.students.map((student) => {
        if (student.id !== studentId) return student;
        return {
          ...student,
          expanded: !student.expanded
        };
      })
    });
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/coach/addStudent/index' });
  }
});
