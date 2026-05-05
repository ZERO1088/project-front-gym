const COLLECTIONS = {
  student: 'student',
  coachWechatBind: 'coach_wechat_bind',
  studentWechatBind: 'student_wechat_bind',
  contractRecord: 'contract_record'
};

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

function makeError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizePhotoList(photos) {
  const list = Array.isArray(photos) ? photos : [];
  return list
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 3);
}

module.exports = {
  COLLECTIONS,
  findById,
  findOne,
  listAll,
  makeError,
  normalizePhotoList
};
