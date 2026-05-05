const cloud = require('wx-server-sdk');
const { createContractService } = require('./common/contract');
const { fail, ok } = require('./common/response');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const db = cloud.database();
  const wxContext = cloud.getWXContext();
  const contractService = createContractService({
    db,
    openid: wxContext.OPENID
  });

  try {
    const action = event.action || '';
    if (action === 'detail') return ok(await contractService.getContractDetail(event.query || {}), 'ok');
    if (action === 'save') return ok(await contractService.saveContract(event.data || {}), 'saved');
    throw new Error(`unknown contract action: ${action}`);
  } catch (error) {
    return fail(error);
  }
};
