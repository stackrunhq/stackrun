exports.OS_TYPE = {
  D_OS_TYPE_WIN_XP: 0x01,
  D_OS_TYPE_WIN_07: 0x02,
  D_OS_TYPE_WIN_08: 0x03,
  D_OS_TYPE_WIN_10: 0x04,
  D_OS_TYPE_WIN_11: 0x05,
  D_OS_TYPE_Max: 0x06
};

exports.OS_VERSION_LIST = {
  1: 'winxp',
  2: 'win7',
  3: 'win8',
  4: 'win10',
  5: 'win11'
};

exports.OS_TYPE_NAMES = {
  [exports.OS_TYPE.D_OS_TYPE_WIN_XP]: "WIN XP",
  [exports.OS_TYPE.D_OS_TYPE_WIN_07]: "WIN 7",
  [exports.OS_TYPE.D_OS_TYPE_WIN_08]: "WIN 8",
  [exports.OS_TYPE.D_OS_TYPE_WIN_10]: "WIN 10",
  [exports.OS_TYPE.D_OS_TYPE_WIN_11]: "WIN 11"
};

// 容器配置（用于前端显示，实际操作由 dserver 处理）
exports.CONTAINER_CONFIG = {
  DEFAULT_CONTAINER_NAME: '默认容器',
  DEFAULT_CONTAINER_NOTES: '系统默认容器',
  CONTAINER_FILE_EXTENSION: 'srtar'
};

exports.CACHE_CONFIG = {
  CONTAINER_CACHE_FILE: 'containers_cache.json',
  CACHE_TTL: 5 * 60 * 1000,
  ENABLE_CACHE: false
};

exports.LICENSE_CONFIG = {
  EDITION_TYPES: {
    PERSONAL: 'personal',
    BASE: 'base',
    PRO: 'pro',
    CUSTOM: 'custom'
  },
  EDITION_NAMES: {
    personal: '个人版',
    base: '基础版',
    pro: '专业版',
    custom: '定制版'
  },
  getEditionName: function(edition) {
    return this.EDITION_NAMES[edition] || edition || '个人版';
  },
  getTitleText: function(edition, expireDays) {
    const editionName = this.getEditionName(edition);
    if (!expireDays || expireDays === 'unlimited') {
      return editionName;
    }
    if (expireDays <= 0) {
      return `${editionName}-已过期`;
    }
    if (expireDays > 999) {
      return `${editionName}-长期`;
    }
    return `${editionName}-${expireDays}天`;
  },
  calculateRemainingDays: function(expireAt) {
    if (!expireAt) {
      return null;
    }
    const expireDate = new Date(expireAt);
    const now = new Date();
    if (isNaN(expireDate.getTime())) {
      return null;
    }
    const diffTime = expireDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }
};