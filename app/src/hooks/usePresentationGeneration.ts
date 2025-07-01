// 📊 PowerPoint生成専用hook
import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';

export interface SlideItem {
  id: number;
  title: string;
  content: string;
  suggestedImage?: string;
  suggestedVideo?: string;
  layout: 'title-image' | 'full-text' | 'comparison-table' | 'bullet-points' | 'chart';
  notes?: string;
}

export interface PresentationPlan {
  title: string;
  slides: SlideItem[];
  designTheme: string; // 'cyberpunk' | 'neon' | 'ocean' | 'sunset' | 'matrix' など
  estimatedDuration: string;
  targetAudience: string;
  primaryGoal: string;
}

export const usePresentationGeneration = () => {
  // プレゼンテーション生成の状態
  const [prompt, setPrompt] = useState('');
  const [generatedPlan, setGeneratedPlan] = useState<PresentationPlan | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { getAuthToken } = useAuth();

  // プロンプト分析実行
  const handleAnalyze = useCallback(async () => {
    if (!prompt.trim()) {
      setError('プレゼンテーションの内容を入力してください');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const accessToken = await getAuthToken();
      if (!accessToken) {
        throw new Error('認証が必要です');
      }

      console.log('🎯 プレゼンテーション分析開始:', prompt);

      const response = await fetch('/api/analyzePresentationPrompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`プレゼンテーション分析に失敗しました: ${response.status} ${errorText}`);
      }

      console.log('🔍 レスポンス詳細:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        ok: response.ok
      });

      // レスポンステキストを一度取得してログ出力
      const responseText = await response.text();
      console.log('📜 レスポンステキスト（生）:', responseText);
      console.log('📏 レスポンス長:', responseText.length);

      if (!responseText || responseText.trim().length === 0) {
        throw new Error('APIから空のレスポンスが返されました');
      }

      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('🚨 JSONパースエラー:', parseError);
        console.error('🚨 パース失敗したテキスト:', responseText.substring(0, 500));
        throw new Error(`JSONパースに失敗しました: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }

      console.log('🎯 APIレスポンス:', responseData);
      
      // APIレスポンス形式: { success: true, data: PresentationPlan, message: string }
      if (!responseData.success || !responseData.data) {
        throw new Error(responseData.message || 'APIレスポンスが不正です');
      }
      
      const data: PresentationPlan = responseData.data;
      console.log('✅ プレゼンテーション分析完了:', data);
      
      setGeneratedPlan(data);
    } catch (err) {
      console.error('❌ プレゼンテーション分析エラー:', err);
      setError(err instanceof Error ? err.message : 'プレゼンテーション分析に失敗しました');
    } finally {
      setIsAnalyzing(false);
    }
  }, [prompt, getAuthToken]);

  // プランを更新
  const updateGeneratedPlan = useCallback((updatedPlan: PresentationPlan) => {
    setGeneratedPlan(updatedPlan);
    setError(null);
  }, []);

  // プランをリセット
  const resetPlan = useCallback(() => {
    setGeneratedPlan(null);
    setError(null);
  }, []);

  // プロンプトをリセット
  const resetPrompt = useCallback(() => {
    setPrompt('');
    setGeneratedPlan(null);
    setError(null);
  }, []);

  return {
    // State
    prompt,
    generatedPlan,
    isAnalyzing,
    error,
    
    // Actions
    setPrompt,
    handleAnalyze,
    updateGeneratedPlan,
    resetPlan,
    resetPrompt,
  };
};
