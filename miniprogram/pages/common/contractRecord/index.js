const { request } = require('../../../utils/request');
const { fetchCurrentStudent } = require('../../../utils/studentSession');

function readQueryRole(query) {
  const role = String((query && query.role) || 'coach').toLowerCase();
  return role === 'student' ? 'student' : 'coach';
}

function fileExt(path = '') {
  const matched = String(path).match(/\.[a-zA-Z0-9]+$/);
  return matched ? matched[0] : '.jpg';
}

Page({
  data: {
    role: 'coach',
    editable: false,
    loading: false,
    saving: false,
    uploading: false,
    students: [],
    selectedStudentIndex: 0,
    selectedStudentId: '',
    selectedStudentName: '',
    photos: [],
    remark: '',
    updatedAt: '',
    unboundStudent: false
  },

  onLoad(query) {
    this.setData({
      role: readQueryRole(query)
    });
  },

  async onShow() {
    await this.bootstrap();
  },

  async bootstrap() {
    if (this.data.role === 'student') {
      await this.bootstrapForStudent();
      return;
    }
    await this.bootstrapForCoach();
  },

  async bootstrapForCoach() {
    this.setData({ loading: true, unboundStudent: false });
    try {
      const studentRes = await request({ url: '/api/student/list' });
      const students = studentRes.data || [];
      if (!students.length) {
        this.setData({
          students: [],
          selectedStudentId: '',
          selectedStudentName: '',
          photos: [],
          remark: '',
          editable: true
        });
        return;
      }

      const selectedStudentId = String(this.data.selectedStudentId || students[0].id);
      const selectedStudentIndex = Math.max(
        0,
        students.findIndex((item) => String(item.id) === selectedStudentId)
      );
      const selectedStudent = students[selectedStudentIndex];

      this.setData({
        students,
        selectedStudentIndex,
        selectedStudentId: String(selectedStudent.id),
        selectedStudentName: selectedStudent.name || ''
      });

      await this.fetchContractDetail({
        role: 'coach',
        studentId: String(selectedStudent.id)
      });
    } catch (error) {
      console.log('bootstrap coach contract failed', error);
    } finally {
      this.setData({ loading: false });
    }
  },

  async bootstrapForStudent() {
    this.setData({ loading: true, unboundStudent: false });
    try {
      const student = await fetchCurrentStudent();
      if (!student) {
        this.setData({
          unboundStudent: true,
          selectedStudentId: '',
          selectedStudentName: '',
          photos: [],
          remark: '',
          editable: false
        });
        return;
      }

      this.setData({
        selectedStudentId: String(student.id),
        selectedStudentName: student.name || ''
      });

      await this.fetchContractDetail({
        role: 'student'
      });
    } catch (error) {
      console.log('bootstrap student contract failed', error);
      this.setData({ unboundStudent: true });
    } finally {
      this.setData({ loading: false });
    }
  },

  async fetchContractDetail({ role, studentId = '' }) {
    const query = [`role=${encodeURIComponent(role)}`];
    if (studentId) query.push(`student_id=${encodeURIComponent(studentId)}`);
    const res = await request({
      url: `/api/contract/detail?${query.join('&')}`
    });
    const detail = res.data || {};
    this.setData({
      editable: Boolean(detail.editable),
      photos: detail.photos || [],
      remark: detail.remark || '',
      updatedAt: detail.updated_at || ''
    });
  },

  async onStudentChange(e) {
    const index = Number(e.detail.value || 0);
    const students = this.data.students || [];
    const current = students[index];
    if (!current) return;

    this.setData({
      selectedStudentIndex: index,
      selectedStudentId: String(current.id),
      selectedStudentName: current.name || '',
      loading: true
    });

    try {
      await this.fetchContractDetail({
        role: 'coach',
        studentId: String(current.id)
      });
    } catch (error) {
      console.log('change student contract failed', error);
    } finally {
      this.setData({ loading: false });
    }
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  async choosePhotos() {
    if (!this.data.editable || this.data.uploading) return;
    const remain = Math.max(0, 3 - (this.data.photos || []).length);
    if (remain <= 0) {
      wx.showToast({ title: '最多上传 3 张', icon: 'none' });
      return;
    }

    try {
      const result = await wx.chooseMedia({
        count: Math.min(3, remain),
        mediaType: ['image'],
        sourceType: ['album']
      });
      const files = (result && result.tempFiles) || [];
      if (!files.length) return;
      await this.uploadPhotos(files.map((item) => item.tempFilePath).filter(Boolean));
    } catch (error) {
      console.log('choose contract photos failed', error);
    }
  },

  async uploadPhotos(paths) {
    if (!paths.length) return;
    this.setData({ uploading: true });
    wx.showLoading({ title: '上传中', mask: true });
    try {
      const studentId = String(this.data.selectedStudentId || 'unknown');
      const uploads = await Promise.all(
        paths.map((path, index) => {
          const cloudPath = `contracts/${studentId}/${Date.now()}-${index}${fileExt(path)}`;
          return wx.cloud.uploadFile({
            cloudPath,
            filePath: path
          });
        })
      );

      const fileIds = uploads.map((item) => item.fileID).filter(Boolean);
      this.setData({
        photos: [...(this.data.photos || []), ...fileIds].slice(0, 3)
      });
    } finally {
      wx.hideLoading();
      this.setData({ uploading: false });
    }
  },

  removePhoto(e) {
    if (!this.data.editable) return;
    const index = Number(e.currentTarget.dataset.index);
    const photos = (this.data.photos || []).slice();
    if (index < 0 || index >= photos.length) return;
    photos.splice(index, 1);
    this.setData({ photos });
  },

  previewPhoto(e) {
    const current = e.currentTarget.dataset.src;
    const urls = this.data.photos || [];
    if (!current || !urls.length) return;
    wx.previewImage({
      current,
      urls
    });
  },

  async saveContract() {
    if (!this.data.editable || this.data.saving) return;
    const studentId = String(this.data.selectedStudentId || '').trim();
    if (!studentId) {
      wx.showToast({ title: '请先选择学员', icon: 'none' });
      return;
    }
    if (!(this.data.photos || []).length) {
      wx.showToast({ title: '请先上传合同照片', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中', mask: true });
    try {
      const res = await request({
        url: '/api/contract/save',
        method: 'POST',
        data: {
          student_id: studentId,
          photos: this.data.photos,
          remark: this.data.remark
        }
      });
      this.setData({
        updatedAt: (res.data || {}).updated_at || ''
      });
      wx.showToast({
        title: '合同记录已保存',
        icon: 'none'
      });
    } catch (error) {
      console.log('save contract failed', error);
    } finally {
      wx.hideLoading();
      this.setData({ saving: false });
    }
  }
});
