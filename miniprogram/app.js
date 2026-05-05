const CLOUD_ENV_ID = 'cloud1-5grtixrkd1443af8';

App({
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env: CLOUD_ENV_ID,
        traceUser: true
      });
    }
  },

  globalData: {
    cloudEnvId: CLOUD_ENV_ID,
    baseUrl: ''
  }
});
