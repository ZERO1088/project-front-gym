const crypto = require('crypto');

const COLLECTIONS = {
  coach: 'coach',
  coachWechatBind: 'coach_wechat_bind',
  coachInvite: 'coach_invite_code',
  student: 'student',
  courseSchedule: 'course_schedule',
  courseStudent: 'course_student',
  courseRecord: 'course_record',
  studentWechatBind: 'student_wechat_bind'
};

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDate(value) {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return new Date(`${value}T00:00:00`);
}

function formatLocalDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getTodayString(baseDate) {
  const date = toDate(baseDate);
  if (Number.isNaN(date.getTime())) {
    const error = new Error('invalid base date');
    error.status = 400;
    throw error;
  }
  return formatLocalDate(date);
}

function shiftDay(dateString, days) {
  const date = toDate(dateString);
  date.setDate(date.getDate() + Number(days || 0));
  return formatLocalDate(date);
}

function getMonthRange(dateString) {
  const date = toDate(dateString);
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const nextMonthStart = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return {
    monthStart: formatLocalDate(monthStart),
    nextMonthStart: formatLocalDate(nextMonthStart)
  };
}

function generateShareToken() {
  return crypto.randomBytes(16).toString('hex');
}

function buildSharePath(token) {
  return `/pages/common/courseConfirm/index?token=${token}`;
}

function toNumber(value, fallback = 0) {
  const result = Number(value);
  return Number.isNaN(result) ? fallback : result;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => String(item).trim()).filter(Boolean))];
}

async function listAll(db, collection) {
  const result = await db.collection(collection).limit(1000).get();
  return result.data || [];
}

async function findOne(db, collection, predicate) {
  const docs = await listAll(db, collection);
  return docs.find(predicate) || null;
}

async function findById(db, collection, id) {
  if (!id) return null;
  const docs = await listAll(db, collection);
  return docs.find((doc) => String(doc._id) === String(id)) || null;
}

async function removeByIds(db, collection, ids) {
  const uniqueIds = uniqueStrings(ids);
  await Promise.all(
    uniqueIds.map((id) =>
      db
        .collection(collection)
        .doc(String(id))
        .remove()
        .catch(() => null)
    )
  );
}

function buildStudentProfile(student, bind = null) {
  if (!student) return null;
  return {
    id: String(student._id),
    name: student.name,
    phone: student.phone,
    gender: student.gender || null,
    height: student.height ?? null,
    weight: student.weight ?? null,
    birthday: student.birthday || null,
    goal: student.goal || null,
    remark: student.remark || null,
    total_classes: toNumber(student.total_classes, 0),
    remaining_classes: toNumber(student.remaining_classes, 0),
    used_classes: toNumber(student.used_classes, 0),
    is_bound: Boolean(bind),
    bind_openid: bind ? bind.openid : null,
    bind_created_at: bind ? bind.created_at : null,
    created_at: student.created_at || null
  };
}

function buildCourseStudentPayload(relation, overrides = {}) {
  const payload = {
    relation_id: String(relation._id),
    course_id: String(relation.course_id),
    student_id: String(relation.student_id),
    coach_id: relation.coach_id ? String(relation.coach_id) : null,
    coach_name: relation.coach_name || null,
    student_name: relation.student_name || null,
    date: relation.date,
    start_time: relation.start_time,
    end_time: relation.end_time,
    remark: relation.remark || null,
    status: relation.status,
    total_classes: toNumber(relation.total_classes, 0),
    remaining_classes: toNumber(relation.remaining_classes, 0),
    used_classes: toNumber(relation.used_classes, 0),
    share_token: relation.share_token || null,
    share_path: relation.share_token ? buildSharePath(relation.share_token) : null,
    shared_at: relation.shared_at || null,
    confirmed_at: relation.confirmed_at || null,
    deducted_at: relation.deducted_at || null,
    completed_at: relation.completed_at || null,
    can_confirm: relation.status === 'pending',
    can_reject: relation.status === 'pending',
    is_deducted: Boolean(relation.deducted_at)
  };

  return { ...payload, ...overrides };
}

module.exports = {
  COLLECTIONS,
  buildCourseStudentPayload,
  buildSharePath,
  buildStudentProfile,
  findById,
  findOne,
  formatLocalDate,
  generateShareToken,
  getMonthRange,
  getTodayString,
  listAll,
  removeByIds,
  shiftDay,
  toDate,
  toNumber,
  uniqueStrings
};
