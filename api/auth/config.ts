// API: /api/auth/config
// Key VaultからクライアントID・テナントIDを取得して返すエンドポイント
const { getClientId, getTenantId } = require('../shared/auth');

module.exports = async function (context: any, req: any) {
  try {
    const clientId = await getClientId();
    const tenantId = await getTenantId();
    context.res = {
      status: 200,
      body: { clientId, tenantId }
    };
  } catch (err) {
    context.res = {
      status: 500,
      body: { error: 'Failed to get config', details: String(err) }
    };
  }
};
