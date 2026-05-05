const {
  COLLECTIONS,
  findById,
  getMonthRange,
  getTodayString,
  listAll,
  shiftDay
} = require('./helpers');
const { ensureCoachId } = require('./course');

function makeError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function createCoachService(ctx) {
  const { db } = ctx;

  async function getCoachDashboard({ coach_id, date }) {
    const coachId = await ensureCoachId(db, coach_id);
    const today = getTodayString(date);
    const tomorrow = shiftDay(today, 1);
    const { monthStart, nextMonthStart } = getMonthRange(today);

    const coach = await findById(db, COLLECTIONS.coach, coachId);
    if (!coach) {
      throw makeError('coach not found', 404);
    }

    const courses = await listAll(db, COLLECTIONS.courseSchedule);
    const relations = await listAll(db, COLLECTIONS.courseStudent);
    const students = await listAll(db, COLLECTIONS.student);
    const studentMap = students.reduce((map, item) => {
      map[String(item._id)] = item;
      return map;
    }, {});

    const coachCourses = courses.filter((course) => String(course.coach_id) === String(coachId));
    const todayCourses = coachCourses.filter((course) => String(course.date) === String(today));
    const tomorrowCourses = coachCourses.filter((course) => String(course.date) === String(tomorrow));
    const monthlyCourses = coachCourses.filter((course) => String(course.date) >= String(monthStart) && String(course.date) < String(nextMonthStart));
    const pendingRelations = relations.filter((relation) => {
      const course = courses.find((item) => String(item._id) === String(relation.course_id));
      return course && String(course.coach_id) === String(coachId) && String(course.date) >= String(today) && relation.status === 'pending';
    });

    const recentPending = pendingRelations
      .map((relation) => {
        const course = courses.find((item) => String(item._id) === String(relation.course_id)) || {};
        const student = studentMap[String(relation.student_id)] || {};
        return {
          course_id: String(relation.course_id),
          student_id: String(relation.student_id),
          student_name: student.name || '',
          date: course.date,
          start_time: course.start_time,
          end_time: course.end_time,
          share_path: relation.share_token ? `/pages/common/courseConfirm/index?token=${relation.share_token}` : null
        };
      })
      .sort((left, right) => {
        const dateDiff = String(left.date || '').localeCompare(String(right.date || ''));
        if (dateDiff !== 0) return dateDiff;
        return String(left.start_time || '').localeCompare(String(right.start_time || ''));
      })
      .slice(0, 3);

    return {
      coach_id: String(coach._id),
      name: coach.name,
      phone: coach.phone,
      avatar_text: (coach.name || 'C').slice(0, 1).toUpperCase(),
      today_courses: todayCourses.length,
      tomorrow_courses: tomorrowCourses.length,
      monthly_courses: monthlyCourses.length,
      pending_students: pendingRelations.length,
      today,
      recent_pending: recentPending
    };
  }

  return {
    getCoachDashboard
  };
}

module.exports = {
  createCoachService
};
