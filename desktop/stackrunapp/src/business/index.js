let businessService = null;

function getBusinessService() {
  if (!businessService) {
    businessService = require('./appBusiness');
  }
  return businessService;
}

function getContainerService() {
  return require('./containerManager');
}

function getAppService() {
  return require('./appManager');
}

module.exports = {
  getBusinessService,
  getContainerService,
  getAppService
};