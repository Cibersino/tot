'use strict';

const fs = require('fs');

function hasFile(filePath) {
  return typeof filePath === 'string' && filePath.trim() !== '' && fs.existsSync(filePath);
}

function resolveGoogleDriveOcrAvailability({ credentialsPath, tokenPath } = {}) {
  const credentialsPresent = hasFile(credentialsPath);
  const tokenPresent = hasFile(tokenPath);

  if (!credentialsPresent) {
    return {
      available: false,
      errorCode: 'setup_incomplete',
      reason: 'credentials_missing',
      checks: { credentialsPresent, tokenPresent },
    };
  }

  if (!tokenPresent) {
    return {
      available: false,
      errorCode: 'ocr_activation_required',
      reason: 'token_missing',
      checks: { credentialsPresent, tokenPresent },
    };
  }

  return {
    available: true,
    errorCode: null,
    reason: 'ready',
    checks: { credentialsPresent, tokenPresent },
  };
}

module.exports = {
  resolveGoogleDriveOcrAvailability,
};

