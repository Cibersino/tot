// Shared preload instrumentation for DEADCODE_AUDIT.
const DEADCODE_AUDIT_CHANNEL = '__deadcode_audit__ipc_used';
const DEADCODE_AUDIT_ENABLED = process.env.DEADCODE_AUDIT === '1';

function initDeadcodeAuditPreload(ipcRenderer) {
  if (!DEADCODE_AUDIT_ENABLED || !ipcRenderer) return null;

  const originalSend = ipcRenderer.send.bind(ipcRenderer);
  const originalInvoke = ipcRenderer.invoke.bind(ipcRenderer);
  const originalOn = ipcRenderer.on.bind(ipcRenderer);
  const originalOnce = ipcRenderer.once.bind(ipcRenderer);

  const recordUsed = (channel) => {
    if (!channel || channel === DEADCODE_AUDIT_CHANNEL) return;
    try { originalSend(DEADCODE_AUDIT_CHANNEL, { type: 'ipc-used', channel: String(channel) }); } catch (e) { /* noop */ }
  };

  ipcRenderer.send = function (channel, ...args) {
    recordUsed(channel);
    return originalSend(channel, ...args);
  };

  ipcRenderer.invoke = function (channel, ...args) {
    recordUsed(channel);
    return originalInvoke(channel, ...args);
  };

  ipcRenderer.on = function (channel, listener) {
    recordUsed(channel);
    return originalOn(channel, listener);
  };

  ipcRenderer.once = function (channel, listener) {
    recordUsed(channel);
    return originalOnce(channel, listener);
  };

  return { channel: DEADCODE_AUDIT_CHANNEL };
}

module.exports = {
  initDeadcodeAuditPreload,
  DEADCODE_AUDIT_CHANNEL,
  DEADCODE_AUDIT_ENABLED
};
