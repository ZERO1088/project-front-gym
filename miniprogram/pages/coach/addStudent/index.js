const { request } = require('../../../utils/request');

function buildInitialForm() {
  return {
    name: '',
    phone: '',
    gender: 'male',
    height: '',
    weight: '',
    birthday: '',
    goal: '',
    remark: '',
    total_classes: 10
  };
}

Page({
  data: {
    form: buildInitialForm(),
    submitting: false
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`form.${key}`]: e.detail.value });
  },

  validateForm() {
    const { name, phone, total_classes } = this.data.form;

    if (!String(name || '').trim()) {
      wx.showToast({ title: '请先填写学员姓名', icon: 'none' });
      return false;
    }

    if (!String(phone || '').trim()) {
      wx.showToast({ title: '请先填写手机号码', icon: 'none' });
      return false;
    }

    if (!/^1\d{10}$/.test(String(phone || '').trim())) {
      wx.showToast({ title: '请输入正确的手机号码', icon: 'none' });
      return false;
    }

    const total = Number(total_classes);
    if (Number.isNaN(total) || total < 0) {
      wx.showToast({ title: '总课时请填写 0 或更大的数字', icon: 'none' });
      return false;
    }

    return true;
  },

  async submit() {
    if (this.data.submitting) return;
    if (!this.validateForm()) return;

    this.setData({ submitting: true });
    let loadingShown = false;

    try {
      wx.showLoading({ title: '保存中', mask: true });
      loadingShown = true;

      await request({
        url: '/api/student/add',
        method: 'POST',
        data: {
          ...this.data.form,
          name: String(this.data.form.name || '').trim(),
          phone: String(this.data.form.phone || '').trim(),
          goal: String(this.data.form.goal || '').trim(),
          remark: String(this.data.form.remark || '').trim()
        }
      });

      wx.setStorageSync('lastCreatedStudentPhone', String(this.data.form.phone || '').trim());

      const pages = getCurrentPages();
      const previousPage = pages.length > 1 ? pages[pages.length - 2] : null;
      if (previousPage && typeof previousPage.fetchStudents === 'function') {
        previousPage.fetchStudents();
      }

      if (loadingShown) {
        wx.hideLoading();
        loadingShown = false;
      }

      wx.showToast({ title: '学员已创建', icon: 'success' });
      this.setData({ form: buildInitialForm() });
      setTimeout(() => wx.navigateBack(), 900);
    } catch (error) {
      if (loadingShown) {
        wx.hideLoading();
        loadingShown = false;
      }
      console.log('add student failed', error);
    } finally {
      this.setData({ submitting: false });
    }
  }
});
