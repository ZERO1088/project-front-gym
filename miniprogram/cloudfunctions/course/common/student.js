const {
  COLLECTIONS,
  buildStudentProfile,
  findById,
  findOne,
  listAll,
  removeByIds,
  toNumber
} = require('./helpers');

function makeError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function createStudentService(ctx) {
  const { db, openid } = ctx;

  async function getStudentByOpenId(currentOpenid = openid) {
    const bind = await findOne(db, COLLECTIONS.studentWechatBind, (item) => item.openid === currentOpenid);
    if (!bind) throw makeError('student binding not found', 404);

    const student = await findById(db, COLLECTIONS.student, bind.student_id);
    if (!student) throw makeError('student not found', 404);

    return buildStudentProfile(student, bind);
  }

  async function addStudent(payload) {
    const name = String(payload.name || '').trim();
    const phone = String(payload.phone || '').trim();
    const gender = payload.gender || null;
    const height = payload.height === '' || payload.height == null ? null : Number(payload.height);
    const weight = payload.weight === '' || payload.weight == null ? null : Number(payload.weight);
    const birthday = payload.birthday || null;
    const goal = String(payload.goal || '').trim() || null;
    const remark = String(payload.remark || '').trim() || null;
    const total = Math.max(toNumber(payload.total_classes, 0), 0);

    if (!name) throw makeError('student name is required');
    if (!phone) throw makeError('student phone is required');

    const result = await db.collection(COLLECTIONS.student).add({
      data: {
        name,
        phone,
        gender,
        height,
        weight,
        birthday,
        goal,
        remark,
        total_classes: total,
        remaining_classes: total,
        used_classes: 0,
        created_at: new Date().toISOString()
      }
    });

    return { id: String(result._id) };
  }

  async function listStudents() {
    const students = await listAll(db, COLLECTIONS.student);
    const binds = await listAll(db, COLLECTIONS.studentWechatBind);
    const bindMap = binds.reduce((map, bind) => {
      map[String(bind.student_id)] = bind;
      return map;
    }, {});

    return students
      .map((student) => buildStudentProfile(student, bindMap[String(student._id)] || null))
      .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')));
  }

  async function updateClassCount(studentId, mode, value) {
    const student = await findById(db, COLLECTIONS.student, studentId);
    if (!student) throw makeError('student not found', 404);

    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) {
      throw makeError('invalid class value');
    }

    let nextTotal = toNumber(student.total_classes, 0);
    if (mode === 'increase') nextTotal += numericValue;
    else if (mode === 'decrease') nextTotal -= numericValue;
    else if (mode === 'set') nextTotal = numericValue;

    if (nextTotal < toNumber(student.used_classes, 0)) {
      throw makeError('total_classes cannot be less than used_classes');
    }

    const nextRemaining = nextTotal - toNumber(student.used_classes, 0);
    await db.collection(COLLECTIONS.student).doc(String(studentId)).update({
      data: {
        total_classes: nextTotal,
        remaining_classes: nextRemaining
      }
    });

    return {
      student_id: String(studentId),
      total_classes: nextTotal,
      used_classes: toNumber(student.used_classes, 0),
      remaining_classes: nextRemaining
    };
  }

  async function bindStudentWechat({ token }) {
    const relation = await findOne(db, COLLECTIONS.courseStudent, (item) => item.share_token === token);
    if (!relation) throw makeError('invalid share token', 404);

    const sameOpenid = await findOne(db, COLLECTIONS.studentWechatBind, (item) => item.openid === openid);
    if (sameOpenid && String(sameOpenid.student_id) !== String(relation.student_id)) {
      throw makeError('this wechat account is already bound to another student');
    }

    const sameStudent = await findOne(db, COLLECTIONS.studentWechatBind, (item) => String(item.student_id) === String(relation.student_id));
    if (sameStudent && sameStudent.openid !== openid) {
      throw makeError('student is already bound to another wechat account');
    }

    if (!sameStudent) {
      await db.collection(COLLECTIONS.studentWechatBind).add({
        data: {
          student_id: String(relation.student_id),
          openid,
          bind_source_token: relation.share_token || null,
          created_at: new Date().toISOString()
        }
      });
    }

    return {
      openid,
      student: await getStudentByOpenId(openid),
      is_mock: false
    };
  }

  async function getStudentCalendar({ month }) {
    const student = await getStudentByOpenId(openid);
    const records = await listAll(db, COLLECTIONS.courseRecord);
    const counts = records
      .filter((record) => String(record.student_id) === String(student.id) && String(record.date || '').startsWith(month))
      .reduce((map, record) => {
        const date = String(record.date);
        map[date] = (map[date] || 0) + 1;
        return map;
      }, {});

    return Object.keys(counts)
      .sort()
      .map((date) => ({ date, course_count: counts[date] }));
  }

  async function getStudentCoursesByDate({ date }) {
    const student = await getStudentByOpenId(openid);
    const records = await listAll(db, COLLECTIONS.courseRecord);
    const schedules = await listAll(db, COLLECTIONS.courseSchedule);
    const coaches = await listAll(db, COLLECTIONS.coach);
    const scheduleMap = schedules.reduce((map, item) => {
      map[String(item._id)] = item;
      return map;
    }, {});
    const coachMap = coaches.reduce((map, item) => {
      map[String(item._id)] = item;
      return map;
    }, {});

    return records
      .filter((record) => String(record.student_id) === String(student.id) && String(record.date) === String(date))
      .map((record) => {
        const schedule = scheduleMap[String(record.course_id)] || {};
        const coach = coachMap[String(schedule.coach_id)] || {};
        return {
          id: String(record._id),
          date: record.date,
          start_time: record.start_time,
          end_time: record.end_time,
          status: record.status,
          coach_name: coach.name || '教练',
          remark: schedule.remark || '',
          color: schedule.color || '#4A90E2'
        };
      })
      .sort((left, right) => String(left.start_time || '').localeCompare(String(right.start_time || '')));
  }

  async function unbindStudent(studentId) {
    const student = await findById(db, COLLECTIONS.student, studentId);
    if (!student) throw makeError('student not found', 404);

    const binds = await listAll(db, COLLECTIONS.studentWechatBind);
    const bindIds = binds.filter((item) => String(item.student_id) === String(studentId)).map((item) => item._id);
    await removeByIds(db, COLLECTIONS.studentWechatBind, bindIds);

    return { student_id: String(studentId), unbound: true };
  }

  async function deleteStudent(studentId) {
    const student = await findById(db, COLLECTIONS.student, studentId);
    if (!student) throw makeError('student not found', 404);

    const records = await listAll(db, COLLECTIONS.courseRecord);
    if (records.some((record) => String(record.student_id) === String(studentId))) {
      throw makeError('student has course history and cannot be deleted');
    }

    const relations = await listAll(db, COLLECTIONS.courseStudent);
    const relationIds = relations.filter((item) => String(item.student_id) === String(studentId)).map((item) => item._id);
    await removeByIds(db, COLLECTIONS.courseStudent, relationIds);

    const binds = await listAll(db, COLLECTIONS.studentWechatBind);
    const bindIds = binds.filter((item) => String(item.student_id) === String(studentId)).map((item) => item._id);
    await removeByIds(db, COLLECTIONS.studentWechatBind, bindIds);

    await db.collection(COLLECTIONS.student).doc(String(studentId)).remove();

    const remainingRelations = await listAll(db, COLLECTIONS.courseStudent);
    const relationCourses = new Set(remainingRelations.map((item) => String(item.course_id)));
    const schedules = await listAll(db, COLLECTIONS.courseSchedule);
    const emptySchedules = schedules.filter((schedule) => !relationCourses.has(String(schedule._id)));
    await removeByIds(db, COLLECTIONS.courseSchedule, emptySchedules.map((item) => item._id));

    return { student_id: String(studentId), deleted: true, student_name: student.name };
  }

  return {
    addStudent,
    bindStudentWechat,
    deleteStudent,
    getStudentByOpenId,
    getStudentCalendar,
    getStudentCoursesByDate,
    listStudents,
    unbindStudent,
    updateClassCount
  };
}

module.exports = {
  createStudentService
};
