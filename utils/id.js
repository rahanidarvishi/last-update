'use strict';
var crypto = require('crypto');
function uid(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}
module.exports = { uid: uid };
