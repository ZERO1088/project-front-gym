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
const https = require('https');

function makeError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function ensureCoachId(db, coachId, options = {}) {
  const openid = String(options.openid || '').trim();
  const coaches = await listAll(db, COLLECTIONS.coach);
  const now = new Date().toISOString();

  if (!coaches.length) {
    const created = await db.collection(COLLECTIONS.coach).add({
      data: {
        name: '教练',
        phone: '00000000000',
        created_at: now
      }
    });
    const newCoachId = String(created._id);
    if (openid) {
      await db.collection(COLLECTIONS.coachWechatBind).add({
        data: {
          coach_id: newCoachId,
          openid,
          enabled: true,
          created_at: now
        }
      });
    }
    return newCoachId;
  }

  const coachMap = coaches.reduce((map, item) => {
    map[String(item._id)] = item;
    return map;
  }, {});
  const bindings = await listAll(db, COLLECTIONS.coachWechatBind);
  const enabledBindings = bindings.filter((item) => item.enabled !== false);
  const normalizedCoachId = coachId ? String(coachId) : '';

  if (normalizedCoachId && !coachMap[normalizedCoachId]) {
    throw makeError('coach not found', 404);
  }

  if (!enabledBindings.length) {
    const fallbackCoachId = normalizedCoachId || String(coaches[0]._id);
    if (openid) {
      await db.collection(COLLECTIONS.coachWechatBind).add({
        data: {
          coach_id: fallbackCoachId,
          openid,
          enabled: true,
          created_at: now
        }
      });
    }
    return fallbackCoachId;
  }

  if (!openid) {
    throw makeError('coach openid is required', 401);
  }

  const myBindings = enabledBindings.filter((item) => String(item.openid) === openid);
  if (!myBindings.length) {
    throw makeError('no coach access', 403);
  }

  if (normalizedCoachId) {
    const matched = myBindings.find((item) => String(item.coach_id) === normalizedCoachId);
    if (!matched) {
      throw makeError('no coach access', 403);
    }
    return normalizedCoachId;
  }

  return String(myBindings[0].coach_id);
}

async function queryCollection(db, collection, where = {}) {
  const result = await db.collection(collection).where(where).get();
  return result.data || [];
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


function isDateInSupportedRange(dateString) {
  const selected = new Date(`${String(dateString)}T00:00:00`);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const max = new Date(today);
  max.setDate(max.getDate() + 3);
  const selectedDate = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate());
  return selectedDate >= today && selectedDate <= max;
}

function mapWeatherCode(code) {
  const value = Number(code);
  if (value === 0) return '晴';
  if ([1, 2, 3].includes(value)) return '多云';
  if ([45, 48].includes(value)) return '雾';
  if ([51, 53, 55, 56, 57].includes(value)) return '毛毛雨';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return '雨';
  if ([71, 73, 75, 77, 85, 86].includes(value)) return '雪';
  if ([95, 96, 99].includes(value)) return '雷雨';
  return '未知';
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`weather api status: ${res.statusCode}`));
          }
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(new Error('weather api response is not json'));
          }
        });
      })
      .on('error', (error) => reject(error));
  });
}
function createCourseService(ctx) {
  const { db, openid } = ctx;

  async function createCourse(payload) {
    const coach_id = await ensureCoachId(db, payload.coach_id, { openid });
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
    const normalizedCoachId = await ensureCoachId(db, coach_id, { openid });
    const scheduleWhere = {};
    if (date) scheduleWhere.date = String(date);
    if (normalizedCoachId) scheduleWhere.coach_id = String(normalizedCoachId);
    if (!String(include_canceled || '').trim()) scheduleWhere.status = 'scheduled';

    const courseRows = await queryCollection(db, COLLECTIONS.courseSchedule, scheduleWhere);

    if (!courseRows.length) return [];

    const courseIds = uniqueStrings(courseRows.map((course) => String(course._id)));
    const relations = courseIds.length
      ? await queryCollection(db, COLLECTIONS.courseStudent, {
          course_id: db.command.in(courseIds)
        })
      : [];
    const studentIds = uniqueStrings(relations.map((item) => String(item.student_id)));
    const students = studentIds.length
      ? await queryCollection(db, COLLECTIONS.student, {
          _id: db.command.in(studentIds)
        })
      : [];
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
  async function getWeather({ date }) {
    const targetDate = getTodayString(date);
    if (!isDateInSupportedRange(targetDate)) {
      return {
        date: targetDate,
        known: false,
        summary: '天气未知',
        max_temp: null,
        min_temp: null
      };
    }

    const latitude = 31.3525;
    const longitude = 118.4331;
    const city = '芜湖';
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FShanghai&forecast_days=4';

    try {
      const data = await fetchJson(url);
      const dates = (((data || {}).daily || {}).time || []).map((item) => String(item));
      const idx = dates.findIndex((item) => item === targetDate);
      if (idx < 0) {
        return {
          date: targetDate,
          known: false,
          summary: '天气未知',
          max_temp: null,
          min_temp: null
        };
      }

      const codes = (((data || {}).daily || {}).weather_code || []);
      const maxTemps = (((data || {}).daily || {}).temperature_2m_max || []);
      const minTemps = (((data || {}).daily || {}).temperature_2m_min || []);
      const weatherCode = codes[idx];
      const maxTemp = maxTemps[idx] == null ? null : Number(maxTemps[idx]);
      const minTemp = minTemps[idx] == null ? null : Number(minTemps[idx]);

      return {
        date: targetDate,
        known: true,
        city,
        summary: mapWeatherCode(weatherCode),
        weather_code: weatherCode,
        max_temp: maxTemp,
        min_temp: minTemp
      };
    } catch (error) {
      console.error('get weather failed', error.message);
      return {
        date: targetDate,
        known: false,
        summary: '天气未知',
        max_temp: null,
        min_temp: null
      };
    }
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
          coach_name: coach.name || '鏁欑粌'
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
    getWeather,
    listCourses,
    listStudentHistory
  };
}

module.exports = {
  createCourseService,
  ensureCoachId
};



