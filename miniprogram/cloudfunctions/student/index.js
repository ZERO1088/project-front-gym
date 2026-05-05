const cloud = require('wx-server-sdk');
const { createStudentService } = require('./common/student');
const { fail, ok } = require('./common/response');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const db = cloud.database();
  const wxContext = cloud.getWXContext();
  const studentService = createStudentService({
    db,
    openid: wxContext.OPENID
  });

  try {
    const action = event.action || '';
    console.log('student function start', {
      action,
      query: event.query || {},
      params: event.params || {}
    });
    if (action === 'add') return ok(await studentService.addStudent(event.data || {}), 'student created');
    if (action === 'list') return ok(await studentService.listStudents(), 'ok');
    if (action === 'bindWechat') return ok(await studentService.bindStudentWechat(event.data || {}), 'student bound');
    if (action === 'me') return ok(await studentService.getStudentByOpenId((event.query || {}).openid), 'ok');
    if (action === 'calendar') return ok(await studentService.getStudentCalendar(event.query || {}), 'ok');
    if (action === 'coursesByDate') return ok(await studentService.getStudentCoursesByDate(event.query || {}), 'ok');
    if (action === 'updateClasses') return ok(await studentService.updateClassCount(event.params.studentId, event.data.mode, event.data.value), 'student classes updated');
    if (action === 'unbind') return ok(await studentService.unbindStudent(event.params.studentId), 'student unbound');
    if (action === 'delete') return ok(await studentService.deleteStudent(event.params.studentId), 'student deleted');
    throw new Error(`unknown student action: ${action}`);
  } catch (error) {
    console.error('student function failed', {
      action: event.action || '',
      message: error.message
    });
    return fail(error);
  }
};
