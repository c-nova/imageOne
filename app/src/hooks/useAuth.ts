// hooks/useAuth.ts - 認証関連のカスタムフック
import { useCallback } from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';

// グローバルでclientIdをキャッシュ
let globalClientId: string | null = null;
const fetchClientId = async () => {
  if (globalClientId) return globalClientId;
  const res = await fetch('/api/auth/config');
  const data = await res.json();
  globalClientId = data.clientId;
  return globalClientId;
};

export const useAuth = () => {
  const isAuthenticated = useIsAuthenticated();
  const { instance } = useMsal();

  const getAuthToken = useCallback(async (): Promise<string | null> => {
    if (!isAuthenticated) return null;
    
    try {
      const accounts = instance.getAllAccounts();
      if (accounts.length === 0) return null;
      const clientId = await fetchClientId();
      const tokenResponse = await instance.acquireTokenSilent({
        scopes: [`${clientId}/.default`],
        account: accounts[0]
      });
      
      return tokenResponse.accessToken;
    } catch (error) {
      console.error('トークン取得エラー:', error);
      return null;
    }
  }, [isAuthenticated, instance]);

  const getUserId = useCallback((): string | null => {
    if (!isAuthenticated) return null;
    try {
      const accounts = instance.getAllAccounts();
      if (accounts.length === 0) return null;
      // Azure ADのobjectId（oid）を返す！
      return accounts[0].idTokenClaims?.oid || null;
    } catch (error) {
      console.error('ユーザーID取得エラー:', error);
      return null;
    }
  }, [isAuthenticated, instance]);

  return {
    isAuthenticated,
    instance,
    getAuthToken,
    getUserId
  };
};
