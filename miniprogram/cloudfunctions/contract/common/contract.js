const {
  COLLECTIONS,
  findById,
  findOne,
  listAll,
  makeError,
  normalizePhotoList
} = require('./helpers');

function createContractService(ctx) {
  const { db, openid } = ctx;

  async function ensureCoachAccess() {
    if (!openid) throw makeError('coach openid is required', 401);
    const binds = await listAll(db, COLLECTIONS.coachWechatBind);
    const myBind = binds.find((item) => String(item.openid) === String(openid) && item.enabled !== false);
    if (!myBind) throw makeError('no coach access', 403);
    return myBind;
  }

  async function ensureStudentAccess() {
    if (!openid) throw makeError('student openid is required', 401);
    const bind = await findOne(
      db,
      COLLECTIONS.studentWechatBind,
      (item) => String(item.openid) === String(openid)
    );
    if (!bind) throw makeError('student binding not found', 404);
    return bind;
  }

  async function getContractRecord(studentId) {
    const contract = await findOne(
      db,
      COLLECTIONS.contractRecord,
      (item) => String(item.student_id) === String(studentId)
    );

    return {
      student_id: String(studentId),
      photos: normalizePhotoList(contract && contract.photos),
      remark: String((contract && contract.remark) || ''),
      updated_at: (contract && contract.updated_at) || null,
      updated_by_openid: (contract && contract.updated_by_openid) || null
    };
  }

  async function getContractDetail({ role = 'coach', student_id = '' }) {
    const normalizedRole = String(role || 'coach').toLowerCase();
    let studentId = String(student_id || '').trim();
    let editable = false;

    if (normalizedRole === 'student') {
      const bind = await ensureStudentAccess();
      studentId = String(bind.student_id);
    } else {
      await ensureCoachAccess();
      editable = true;
      if (!studentId) throw makeError('student_id is required');
    }

    const student = await findById(db, COLLECTIONS.student, studentId);
    if (!student) throw makeError('student not found', 404);

    const record = await getContractRecord(studentId);
    return {
      ...record,
      student_name: student.name || '',
      editable
    };
  }

  async function saveContract({ student_id = '', photos = [], remark = '' }) {
    await ensureCoachAccess();

    const studentId = String(student_id || '').trim();
    if (!studentId) throw makeError('student_id is required');

    const student = await findById(db, COLLECTIONS.student, studentId);
    if (!student) throw makeError('student not found', 404);

    const photoList = normalizePhotoList(photos);
    if (!photoList.length) throw makeError('at least one photo is required');

    const payload = {
      student_id: studentId,
      photos: photoList,
      remark: String(remark || '').trim(),
      updated_at: new Date().toISOString(),
      updated_by_openid: String(openid)
    };

    const existing = await findOne(
      db,
      COLLECTIONS.contractRecord,
      (item) => String(item.student_id) === studentId
    );

    if (existing) {
      await db.collection(COLLECTIONS.contractRecord).doc(String(existing._id)).update({ data: payload });
    } else {
      await db.collection(COLLECTIONS.contractRecord).add({
        data: {
          ...payload,
          created_at: payload.updated_at
        }
      });
    }

    return getContractDetail({ role: 'coach', student_id: studentId });
  }

  return {
    getContractDetail,
    saveContract
  };
}

module.exports = {
  createContractService
};
