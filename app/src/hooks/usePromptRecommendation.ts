import { useState } from 'react';

export const usePromptRecommendation = () => {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const optimizePrompt = async (prompt: string, mode: 'image' | 'video' | 'powerpoint' = 'powerpoint'): Promise<string | null> => {
    if (!prompt.trim()) {
      setError('プロンプトを入力してください');
      return null;
    }

    setIsOptimizing(true);
    setError(null);

    try {
      console.log(`🎯 [DEBUG] ${mode}用プロンプト最適化開始:`, prompt);

      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          prompt: prompt.trim(),
          mode 
        }),
      });

      console.log('🎯 [DEBUG] Recommend API response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ [ERROR] Recommend API error:', errorData);
        throw new Error(errorData.error || `プロンプト最適化に失敗しました (${response.status})`);
      }

      const data = await response.json();
      console.log('✅ [SUCCESS] Recommend API success:', data);

      if (data.recommended) {
        return data.recommended;
      } else {
        throw new Error('最適化されたプロンプトが返されませんでした');
      }
    } catch (err) {
      console.error('❌ [ERROR] プロンプト最適化エラー:', err);
      const errorMessage = err instanceof Error ? err.message : 'プロンプト最適化中にエラーが発生しました';
      setError(errorMessage);
      return null;
    } finally {
      setIsOptimizing(false);
    }
  };

  return {
    optimizePrompt,
    isOptimizing,
    error
  };
};
