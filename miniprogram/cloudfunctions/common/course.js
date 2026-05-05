const {
  COLLECTIONS,
  buildCourseStudentPayload,
  buildSharePath,
  findById,
  findOne,
  generateShareToken,
  getTodayString,
  getMonthRange,
  listAll,
  removeByIds,
  toNumber,
  uniqueStrings
} = require('./helpers');

function makeError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function ensureCoachId(db, coachId) {
  const coaches = await listAll(db, COLLECTIONS.coach);
  if (!coaches.length) {
    const result = await db.collection(COLLECTIONS.coach).add({
      data: {
        name: '教练',
        phone: '00000000000',
        created_at: new Date().toISOString()
      }
    });
    return String(result._id);
  }

  if (coachId) {
    const matched = coaches.find((coach) => String(coach._id) === String(coachId));
    if (matched) return String(matched._id);
  }

  return String(coaches[0]._id);
}

function normalizeConfirmationAction(action) {
  if (action === 'accept' || action === 'reject') return action;
  throw makeError('invalid confirm action');
}

async function lockCourseStudent(db, selector) {
  const relations = await listAll(db, COLLECTIONS.courseStudent);
  const schedules = await listAll(db, COLLECTIONS.courseSchedule);
  const students = await listAll(db, COLLECTIONS.student);
  const coaches = await listAll(db, COLLECTIONS.coach);

  const relation = relations.find((item) => {
    if (selector.token) return item.share_token === selector.token;
    return String(item.course_id) === String(selector.course_id) && String(item.student_id) === String(selector.student_id);
  });

  if (!relation) throw makeError('course-student relation not found', 404);

  const schedule = schedules.find((item) => String(item._id) === String(relation.course_id));
  const student = students.find((item) => String(item._id) === String(relation.student_id));
  const coach = coaches.find((item) => String(item._id) === String(schedule && schedule.coach_id));
  if (!schedule || !student) throw makeError('course-student relation not found', 404);

  return {
    ...relation,
    coach_id: schedule.coach_id,
    coach_name: coach ? coach.name : null,
    date: schedule.date,
    start_time: schedule.start_time,
    end_time: schedule.end_time,
    remark: schedule.remark,
    student_name: student.name,
    total_classes: toNumber(student.total_classes, 0),
    remaining_classes: toNumber(student.remaining_classes, 0),
    used_classes: toNumber(student.used_classes, 0)
  };
}

async function confirmCourseInStore(db, selector, action) {
  const normalizedAction = normalizeConfirmationAction(action);
  const relation = await lockCourseStudent(db, selector);

  if (normalizedAction === 'reject') {
    if (relation.status === 'rejected') {
      return buildCourseStudentPayload(relation);
    }

    if (relation.status === 'accepted' || relation.status === 'completed' || relation.deducted_at) {
      throw makeError('course already accepted and deducted');
    }

    const confirmedAt = relation.confirmed_at || new Date().toISOString();
    await db.collection(COLLECTIONS.courseStudent).doc(String(relation._id)).update({
      data: {
        status: 'rejected',
        confirmed_at: confirmedAt
      }
    });

    return buildCourseStudentPayload({ ...relation, status: 'rejected', confirmed_at: confirmedAt });
  }

  if (relation.status === 'rejected') {
    throw makeError('course already rejected');
  }

  if (relation.status === 'accepted' || relation.status === 'completed') {
    return buildCourseStudentPayload(relation);
  }

  if (relation.remaining_classes <= 0) {
    throw makeError('insufficient remaining classes');
  }

  const nextRemaining = relation.remaining_classes - 1;
  const nextUsed = relation.used_classes + 1;

  await db.collection(COLLECTIONS.student).doc(String(relation.student_id)).update({
    data: {
      remaining_classes: nextRemaining,
      used_classes: nextUsed
    }
  });

  const confirmedAt = relation.confirmed_at || new Date().toISOString();
  const deductedAt = relation.deducted_at || new Date().toISOString();
  await db.collection(COLLECTIONS.courseStudent).doc(String(relation._id)).update({
    data: {
      status: 'accepted',
      confirmed_at: confirmedAt,
      deducted_at: deductedAt
    }
  });

  return buildCourseStudentPayload({
    ...relation,
    status: 'accepted',
    remaining_classes: nextRemaining,
    used_classes: nextUsed,
    confirmed_at: confirmedAt,
    deducted_at: deductedAt
  });
}

function normalizeCourse(course) {
  return {
    id: String(course._id),
    coach_id: course.coach_id ? String(course.coach_id) : null,
    date: course.date,
    start_time: course.start_time,
    end_time: course.end_time,
    price: course.price ?? null,
    color: course.color || '#4A90E2',
    status: course.status || 'scheduled',
    canceled_at: course.canceled_at || null,
    remark: course.remark || null,
    created_at: course.created_at || null
  };
}

function sortDateTime(left, right) {
  const dateDiff = String(right.date || '').localeCompare(String(left.date || ''));
  if (dateDiff !== 0) return dateDiff;
  return String(left.start_time || '').localeCompare(String(right.start_time || ''));
}

function createCourseService(ctx) {
  const { db } = ctx;

  async function createCourse(payload) {
    const coach_id = await ensureCoachId(db, payload.coach_id);
    const date = payload.date;
    const start_time = payload.start_time;
    const end_time = payload.end_time;
    const price = payload.price == null || payload.price === '' ? null : Number(payload.price);
    const color = payload.color || '#4A90E2';
    const remark = String(payload.remark || '').trim() || null;
    const studentIds = uniqueStrings(payload.student_ids);

    if (!studentIds.length) throw makeError('at least one student is required');

    const students = await listAll(db, COLLECTIONS.student);
    const studentMap = students.reduce((map, item) => {
      map[String(item._id)] = item;
      return map;
    }, {});

    for (const id of studentIds) {
      if (!studentMap[id]) throw makeError('one or more students not found');
    }

    const courseResult = await db.collection(COLLECTIONS.courseSchedule).add({
      data: {
        coach_id,
        date,
        start_time,
        end_time,
        price,
        color,
        status: 'scheduled',
        remark,
        created_at: new Date().toISOString(),
        canceled_at: null
      }
    });

    const courseId = String(courseResult._id);
    const shareTargets = [];
    for (const studentId of studentIds) {
      const shareToken = generateShareToken();
      await db.collection(COLLECTIONS.courseStudent).add({
        data: {
          course_id: courseId,
          student_id: studentId,
          status: 'pending',
          share_token: shareToken,
          shared_at: null,
          confirmed_at: null,
          deducted_at: null,
          completed_at: null,
          created_at: new Date().toISOString()
        }
      });
      shareTargets.push({
        course_id: courseId,
        student_id: studentId,
        student_name: studentMap[studentId].name,
        status: 'pending',
        share_token: shareToken,
        share_path: buildSharePath(shareToken)
      });
    }

    return { course_id: courseId, share_targets: shareTargets };
  }

  async function listCourses({ date, coach_id, include_canceled = '' }) {
    const schedules = await listAll(db, COLLECTIONS.courseSchedule);
    const normalizedCoachId = await ensureCoachId(db, coach_id);
    const courseRows = schedules.filter((course) => {
      if (date && String(course.date) !== String(date)) return false;
      if (normalizedCoachId && String(course.coach_id) !== String(normalizedCoachId)) return false;
      if (!String(include_canceled || '').trim() && String(course.status || 'scheduled') !== 'scheduled') return false;
      return true;
    });

    if (!courseRows.length) return [];

    const relations = await listAll(db, COLLECTIONS.courseStudent);
    const students = await listAll(db, COLLECTIONS.student);
    const studentMap = students.reduce((map, item) => {
      map[String(item._id)] = item;
      return map;
    }, {});

    return courseRows
      .sort(sortDateTime)
      .map((course) => {
        const relationRows = relations.filter((item) => String(item.course_id) === String(course._id));
        return {
          ...normalizeCourse(course),
          student_names: relationRows.map((item) => studentMap[String(item.student_id)]?.name || '').filter(Boolean).join(', '),
          pending_count: relationRows.filter((item) => item.status === 'pending').length,
          accepted_count: relationRows.filter((item) => item.status === 'accepted').length,
          rejected_count: relationRows.filter((item) => item.status === 'rejected').length,
          completed_count: relationRows.filter((item) => item.status === 'completed').length,
          course_students: relationRows.map((relation) => {
            const student = studentMap[String(relation.student_id)] || {};
            return {
              student_id: String(relation.student_id),
              student_name: student.name || '',
              student_phone: student.phone || '',
              remaining_classes: toNumber(student.remaining_classes, 0),
              status: relation.status,
              share_token: relation.share_token || null,
              share_path: relation.share_token ? buildSharePath(relation.share_token) : null,
              shared_at: relation.shared_at || null,
              confirmed_at: relation.confirmed_at || null,
              deducted_at: relation.deducted_at || null,
              completed_at: relation.completed_at || null,
              is_pending: relation.status === 'pending',
              is_confirmed: relation.status === 'accepted' || relation.status === 'completed'
            };
          })
        };
      });
  }

  async function confirmCourse(payload) {
    return confirmCourseInStore(db, { course_id: payload.course_id, student_id: payload.student_id }, payload.action);
  }

  async function getCourseShareLink(payload) {
    const relation = await lockCourseStudent(db, { course_id: payload.course_id, student_id: payload.student_id });
    const shareToken = relation.share_token || generateShareToken();
    const sharedAt = new Date().toISOString();
    await db.collection(COLLECTIONS.courseStudent).doc(String(relation._id)).update({
      data: {
        share_token: shareToken,
        shared_at: sharedAt
      }
    });
    return buildCourseStudentPayload({ ...relation, share_token: shareToken, shared_at: sharedAt });
  }

  async function getCourseShareDetail(token) {
    const relation = await lockCourseStudent(db, { token });
    return buildCourseStudentPayload(relation);
  }

  async function confirmCourseByToken(payload) {
    return confirmCourseInStore(db, { token: payload.token }, payload.action);
  }

  async function completeOrSigninCourse(payload) {
    const relation = await lockCourseStudent(db, { course_id: payload.course_id, student_id: payload.student_id });

    if (relation.status === 'rejected') {
      throw makeError('rejected course cannot be completed');
    }

    if (relation.status === 'pending') {
      throw makeError('course must be confirmed before completion');
    }

    let nextRemaining = relation.remaining_classes;
    let nextUsed = relation.used_classes;

    if (!relation.deducted_at) {
      if (relation.remaining_classes <= 0) {
        throw makeError('insufficient remaining classes');
      }

      nextRemaining = relation.remaining_classes - 1;
      nextUsed = relation.used_classes + 1;
      await db.collection(COLLECTIONS.student).doc(String(relation.student_id)).update({
        data: {
          remaining_classes: nextRemaining,
          used_classes: nextUsed
        }
      });

      await db.collection(COLLECTIONS.courseStudent).doc(String(relation._id)).update({
        data: {
          deducted_at: new Date().toISOString()
        }
      });
    }

    if (relation.status !== 'completed') {
      await db.collection(COLLECTIONS.courseStudent).doc(String(relation._id)).update({
        data: {
          status: 'completed',
          completed_at: new Date().toISOString()
        }
      });
    }

    const existingRecord = await findOne(
      db,
      COLLECTIONS.courseRecord,
      (item) => String(item.student_id) === String(relation.student_id) && String(item.course_id) === String(relation.course_id)
    );

    if (!existingRecord) {
      await db.collection(COLLECTIONS.courseRecord).add({
        data: {
          student_id: String(relation.student_id),
          course_id: String(relation.course_id),
          date: relation.date,
          start_time: relation.start_time,
          end_time: relation.end_time,
          status: payload.trigger || 'complete',
          created_at: new Date().toISOString()
        }
      });
    }

    return {
      course_id: String(payload.course_id),
      student_id: String(payload.student_id),
      remaining_classes: nextRemaining,
      used_classes: nextUsed,
      status: 'completed'
    };
  }

  async function listStudentHistory(studentId) {
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
      .filter((record) => String(record.student_id) === String(studentId))
      .sort((left, right) => {
        const dateDiff = String(right.date || '').localeCompare(String(left.date || ''));
        if (dateDiff !== 0) return dateDiff;
        return String(right.start_time || '').localeCompare(String(left.start_time || ''));
      })
      .map((record) => {
        const schedule = scheduleMap[String(record.course_id)] || {};
        const coach = coachMap[String(schedule.coach_id)] || {};
        return {
          id: String(record._id),
          date: record.date,
          start_time: record.start_time,
          end_time: record.end_time,
          status: record.status,
          coach_name: coach.name || '教练'
        };
      });
  }

  async function cancelCourse(courseId) {
    const course = await findById(db, COLLECTIONS.courseSchedule, courseId);
    if (!course) throw makeError('course not found', 404);
    if (String(course.status) === 'canceled') {
      return { course_id: String(courseId), status: 'canceled' };
    }

    const relations = await listAll(db, COLLECTIONS.courseStudent);
    if (
      relations
        .filter((item) => String(item.course_id) === String(courseId))
        .some((item) => item.status === 'accepted' || item.status === 'completed' || item.deducted_at)
    ) {
      throw makeError('confirmed or completed course cannot be canceled');
    }

    await Promise.all(
      relations
        .filter((item) => String(item.course_id) === String(courseId) && item.status === 'pending')
        .map((item) =>
          db.collection(COLLECTIONS.courseStudent).doc(String(item._id)).update({
            data: {
              status: 'rejected',
              confirmed_at: item.confirmed_at || new Date().toISOString()
            }
          })
        )
    );

    await db.collection(COLLECTIONS.courseSchedule).doc(String(courseId)).update({
      data: {
        status: 'canceled',
        canceled_at: new Date().toISOString()
      }
    });

    return { course_id: String(courseId), status: 'canceled' };
  }

  async function deleteCourse(courseId) {
    const course = await findById(db, COLLECTIONS.courseSchedule, courseId);
    if (!course) throw makeError('course not found', 404);

    const records = await listAll(db, COLLECTIONS.courseRecord);
    if (records.some((record) => String(record.course_id) === String(courseId))) {
      throw makeError('course with history cannot be deleted');
    }

    const relations = await listAll(db, COLLECTIONS.courseStudent);
    if (
      relations
        .filter((item) => String(item.course_id) === String(courseId))
        .some((item) => item.status === 'accepted' || item.status === 'completed' || item.deducted_at)
    ) {
      throw makeError('confirmed or completed course cannot be deleted');
    }

    await removeByIds(
      db,
      COLLECTIONS.courseStudent,
      relations.filter((item) => String(item.course_id) === String(courseId)).map((item) => item._id)
    );

    await db.collection(COLLECTIONS.courseSchedule).doc(String(courseId)).remove();
    return { course_id: String(courseId), deleted: true };
  }

  return {
    cancelCourse,
    completeOrSigninCourse,
    confirmCourse,
    confirmCourseByToken,
    createCourse,
    deleteCourse,
    getCourseShareDetail,
    getCourseShareLink,
    listCourses,
    listStudentHistory
  };
}

module.exports = {
  createCourseService,
  ensureCoachId
};
