const { fetchCurrentStudent, clearStudentOpenId } = require('../../../utils/studentSession');

Page({
  data: {
    student: null,
    unbound: false
  },

  onShow() {
    this.fetchStudent();
  },

  async fetchStudent() {
    try {
      const student = await fetchCurrentStudent();
      this.setData({
        student,
        unbound: !student
      });
    } catch (error) {
      this.setData({
        student: null,
        unbound: true
      });
    }
  },

  goCalendar() {
    wx.navigateTo({ url: '/pages/student/home/index' });
  },

  goContractRecord() {
    wx.navigateTo({ url: '/pages/common/contractRecord/index?role=student' });
  },

  resetBinding() {
    clearStudentOpenId();
    this.setData({
      student: null,
      unbound: true
    });
    wx.showToast({
      title: '已清除本机绑定缓存',
      icon: 'none'
    });
  }
});
