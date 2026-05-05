const crypto = require('crypto');
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

function createInviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function normalizeDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

function createCoachService(ctx) {
  const { db, openid } = ctx;

  async function getEnabledBindings() {
    const bindings = await listAll(db, COLLECTIONS.coachWechatBind);
    return bindings
      .filter((item) => item.enabled !== false)
      .sort((left, right) => String(left.created_at || '').localeCompare(String(right.created_at || '')));
  }

  async function getAccessStatus() {
    const bindings = await getEnabledBindings();
    const myBindings = bindings.filter((item) => String(item.openid) === String(openid));
    if (!myBindings.length) {
      return {
        has_access: false,
        is_manager: false,
        coach_id: null,
        coach_name: null,
        coach_phone: null
      };
    }

    const managerOpenid = bindings.length ? String(bindings[0].openid || '') : '';
    const coachId = String(myBindings[0].coach_id);
    const coach = await findById(db, COLLECTIONS.coach, coachId);

    return {
      has_access: true,
      is_manager: managerOpenid === String(openid),
      coach_id: coachId,
      coach_name: coach ? coach.name : null,
      coach_phone: coach ? coach.phone : null
    };
  }

  async function ensureManager() {
    const access = await getAccessStatus();
    if (!access.has_access) throw makeError('no coach access', 403);
    if (!access.is_manager) throw makeError('manager permission required', 403);
    return access;
  }

  async function bindInvite({ code }) {
    const inviteCode = String(code || '').trim().toUpperCase();
    if (!inviteCode) throw makeError('invite code is required');

    const invites = await listAll(db, COLLECTIONS.coachInvite);
    const invite = invites.find((item) => String(item.code || '').toUpperCase() === inviteCode && String(item.status || '') === 'active');
    if (!invite) throw makeError('invite code invalid', 404);

    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      throw makeError('invite code expired', 400);
    }

    const bindings = await getEnabledBindings();
    const existingMine = bindings.find((item) => String(item.openid) === String(openid));
    if (existingMine && String(existingMine.coach_id) !== String(invite.coach_id)) {
      throw makeError('this wechat account is already bound to another coach', 400);
    }

    const existingCoach = bindings.find((item) => String(item.coach_id) === String(invite.coach_id) && String(item.openid) !== String(openid));
    if (existingCoach) {
      throw makeError('target coach is already bound by another account', 400);
    }

    if (!existingMine) {
      await db.collection(COLLECTIONS.coachWechatBind).add({
        data: {
          coach_id: String(invite.coach_id),
          openid: String(openid),
          enabled: true,
          created_at: new Date().toISOString()
        }
      });
    }

    await db.collection(COLLECTIONS.coachInvite).doc(String(invite._id)).update({
      data: {
        status: 'used',
        used_by_openid: String(openid),
        used_at: new Date().toISOString()
      }
    });

    return getAccessStatus();
  }

  async function createInvite(payload) {
    await ensureManager();

    const name = String(payload.name || '').trim();
    const phone = String(payload.phone || '').trim();
    const expiresDaysRaw = Number(payload.expires_days);
    const expiresDays = Number.isNaN(expiresDaysRaw) ? 7 : Math.max(1, Math.min(30, expiresDaysRaw));

    if (!name) throw makeError('coach name is required');
    if (!phone) throw makeError('coach phone is required');

    const createdAt = new Date().toISOString();
    const coachResult = await db.collection(COLLECTIONS.coach).add({
      data: {
        name,
        phone,
        created_at: createdAt
      }
    });

    const coachId = String(coachResult._id);
    const code = createInviteCode();
    const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString();

    await db.collection(COLLECTIONS.coachInvite).add({
      data: {
        coach_id: coachId,
        code,
        status: 'active',
        created_at: createdAt,
        expires_at: expiresAt,
        created_by_openid: String(openid)
      }
    });

    return {
      code,
      coach_id: coachId,
      coach_name: name,
      coach_phone: phone,
      expires_at: expiresAt
    };
  }

  async function listInvites() {
    await ensureManager();

    const invites = await listAll(db, COLLECTIONS.coachInvite);
    const coaches = await listAll(db, COLLECTIONS.coach);
    const coachMap = coaches.reduce((map, item) => {
      map[String(item._id)] = item;
      return map;
    }, {});

    return invites
      .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))
      .slice(0, 20)
      .map((item) => {
        const coach = coachMap[String(item.coach_id)] || {};
        return {
          id: String(item._id),
          code: item.code,
          status: item.status || 'active',
          coach_id: String(item.coach_id),
          coach_name: coach.name || null,
          coach_phone: coach.phone || null,
          created_at: normalizeDate(item.created_at),
          expires_at: normalizeDate(item.expires_at),
          used_at: normalizeDate(item.used_at)
        };
      });
  }

  async function getCoachDashboard({ coach_id, date }) {
    const coachId = await ensureCoachId(db, coach_id, { openid });
    const today = getTodayString(date);
    const tomorrow = shiftDay(today, 1);
    const { monthStart, nextMonthStart } = getMonthRange(today);

    const coach = await findById(db, COLLECTIONS.coach, coachId);
    if (!coach) {
      throw makeError('coach not found', 404);
    }

    const courses = await db.collection(COLLECTIONS.courseSchedule).where({
      coach_id: String(coachId)
    }).get().then((res) => res.data || []);
    const courseIds = courses.map((item) => String(item._id));
    const relations = courseIds.length
      ? await db.collection(COLLECTIONS.courseStudent).where({
          course_id: db.command.in(courseIds)
        }).get().then((res) => res.data || [])
      : [];
    const studentIds = [...new Set(relations.map((item) => String(item.student_id)))];
    const students = studentIds.length
      ? await db.collection(COLLECTIONS.student).where({
          _id: db.command.in(studentIds)
        }).get().then((res) => res.data || [])
      : [];
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
    bindInvite,
    createInvite,
    getAccessStatus,
    getCoachDashboard,
    listInvites
  };
}

module.exports = {
  createCoachService
};
