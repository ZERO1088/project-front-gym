const cloud = require('wx-server-sdk');
const { createCoachService } = require('./common/coach');
const { fail, ok } = require('./common/response');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const db = cloud.database();
  const wxContext = cloud.getWXContext();
  const coachService = createCoachService({
    db,
    openid: wxContext.OPENID
  });

  try {
    const action = event.action || '';
    console.log('coach function start', {
      action,
      query: event.query || {},
      params: event.params || {}
    });
    if (action === 'dashboard') return ok(await coachService.getCoachDashboard(event.query || {}), 'ok');
    if (action === 'accessStatus') return ok(await coachService.getAccessStatus(), 'ok');
    if (action === 'bindInvite') return ok(await coachService.bindInvite(event.data || {}), 'ok');
    if (action === 'createInvite') return ok(await coachService.createInvite(event.data || {}), 'ok');
    if (action === 'inviteList') return ok(await coachService.listInvites(), 'ok');
    throw new Error(`unknown coach action: ${action}`);
  } catch (error) {
    console.error('coach function failed', {
      action: event.action || '',
      message: error.message
    });
    return fail(error);
  }
};
