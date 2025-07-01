import { useState, useCallback } from 'react';
import { PresentationPlan } from './usePresentationGeneration';

interface UsePowerPointGenerationReturn {
  isGenerating: boolean;
  generatePowerPoint: (presentationPlan: PresentationPlan, theme?: string, masterStyle?: string) => Promise<void>;
  error: string | null;
}

export const usePowerPointGeneration = (): UsePowerPointGenerationReturn => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatePowerPoint = useCallback(async (
    presentationPlan: PresentationPlan, 
    theme: string = 'cyberpunk',
    masterStyle: string = 'corporate'
  ) => {
    try {
      setIsGenerating(true);
      setError(null);

      console.log('🎯 PowerPoint生成開始:', presentationPlan.title, 'テーマ:', theme, 'マスター:', masterStyle);

      const response = await fetch('/api/generatePowerPoint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          presentationPlan,
          theme,
          masterStyle
        }),
      });

      console.log('🔍 PowerPoint生成レスポンス詳細:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        ok: response.ok
      });

      if (!response.ok) {
        // エラーレスポンスの場合はJSONとして解析
        const errorText = await response.text();
        console.error('❌ PowerPoint生成エラーレスポンス:', errorText);
        
        try {
          const errorData = JSON.parse(errorText);
          throw new Error(errorData.error || errorData.details || 'PowerPoint生成に失敗しました');
        } catch (parseError) {
          throw new Error(`PowerPoint生成に失敗しました (${response.status}): ${errorText}`);
        }
      }

      // 成功時はバイナリデータとしてダウンロード
      const blob = await response.blob();
      console.log('📁 PowerPointファイル受信完了:', blob.size, 'bytes');

      // ファイル名を生成
      const contentDisposition = response.headers.get('Content-Disposition');
      let fileName = 'presentation.pptx';
      
      if (contentDisposition) {
        const matches = contentDisposition.match(/filename="(.+)"/);
        if (matches && matches[1]) {
          fileName = matches[1];
        }
      } else {
        // Content-Dispositionがない場合は独自にファイル名生成
        const safeTitle = presentationPlan.title
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '_')
          .substring(0, 30);
        fileName = `${safeTitle}_${new Date().toISOString().slice(0, 10)}.pptx`;
      }

      // ブラウザでダウンロード
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      
      // クリーンアップ
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      console.log('✅ PowerPointダウンロード完了:', fileName);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'PowerPoint生成中に不明なエラーが発生しました';
      console.error('❌ PowerPoint生成エラー:', err);
      setError(errorMessage);
      throw err;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return {
    isGenerating,
    generatePowerPoint,
    error
  };
};
