function ok(data, message = 'ok') {
  return { code: 0, message, data };
}

function fail(error) {
  return {
    code: error && typeof error.status === 'number' ? error.status : 500,
    message: (error && error.message) || 'internal error'
  };
}

module.exports = {
  fail,
  ok
};
