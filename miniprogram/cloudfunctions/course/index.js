const cloud = require('wx-server-sdk');
const { createCourseService } = require('./common/course');
const { fail, ok } = require('./common/response');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const db = cloud.database();
  const wxContext = cloud.getWXContext();
  const courseService = createCourseService({
    db,
    openid: wxContext.OPENID
  });

  try {
    const action = event.action || '';
    console.log('course function start', {
      action,
      query: event.query || {},
      params: event.params || {}
    });
    if (action === 'create') return ok(await courseService.createCourse(event.data || {}), 'course created');
    if (action === 'list') return ok(await courseService.listCourses(event.query || {}), 'ok');
    if (action === 'weather') return ok(await courseService.getWeather(event.query || {}), 'ok');
    if (action === 'confirm') return ok(await courseService.confirmCourse(event.data || {}), 'course confirmation updated');
    if (action === 'shareLink') return ok(await courseService.getCourseShareLink(event.data || {}), 'ok');
    if (action === 'shareDetail') return ok(await courseService.getCourseShareDetail((event.query || {}).token), 'ok');
    if (action === 'shareConfirm') return ok(await courseService.confirmCourseByToken(event.data || {}), 'course confirmation updated');
    if (action === 'complete') return ok(await courseService.completeOrSigninCourse({ ...(event.data || {}), trigger: 'complete' }), 'course completed, classes deducted');
    if (action === 'signin') return ok(await courseService.completeOrSigninCourse({ ...(event.data || {}), trigger: 'signin' }), 'course signed in, classes deducted');
    if (action === 'history') return ok(await courseService.listStudentHistory((event.query || {}).student_id), 'ok');
    if (action === 'cancel') return ok(await courseService.cancelCourse(event.params.courseId), 'course canceled');
    if (action === 'delete') return ok(await courseService.deleteCourse(event.params.courseId), 'course deleted');
    throw new Error(`unknown course action: ${action}`);
  } catch (error) {
    console.error('course function failed', {
      action: event.action || '',
      message: error.message
    });
    return fail(error);
  }
};
