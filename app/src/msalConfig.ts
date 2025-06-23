import { Configuration } from '@azure/msal-browser';

export async function getMsalConfig(): Promise<Configuration> {
  const res = await fetch('/api/auth/config');
  if (!res.ok) throw new Error('MSAL設定の取得に失敗したよ！');
  const { clientId, tenantId } = await res.json();
  return {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri: "http://localhost:3000" // ローカル開発用
    },
    cache: {
      cacheLocation: "sessionStorage",
      storeAuthStateInCookie: false
    }
  };
}
