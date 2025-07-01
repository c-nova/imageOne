import { useState, useCallback } from 'react';

interface SlidePreviewHookResult {
  generatePreview: (slide: any, slideIndex: number, theme?: string) => Promise<string | null>;
  isGenerating: boolean;
  error: string | null;
}

export const useSlidePreview = (): SlidePreviewHookResult => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generatePreview = useCallback(async (slide: any, slideIndex: number, theme: string = 'cyberpunk'): Promise<string | null> => {
    if (!slide) {
      setError('スライド情報が必要です');
      return null;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/generateSlidePreview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slide,
          slideIndex,
          theme, // テーマパラメータを追加
          format: 'png' // PNG形式で高品質画像を生成
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && data.slidePreview) {
        console.log('✅ スライドプレビュー画像生成成功:', data.message);
        return data.slidePreview; // data:image/png;base64,... 形式
      } else {
        throw new Error(data.message || 'スライドプレビューの生成に失敗しました');
      }

    } catch (err) {
      console.error('❌ スライドプレビュー生成エラー:', err);
      const errorMessage = err instanceof Error ? err.message : 'スライドプレビューの生成中に予期しないエラーが発生しました';
      setError(errorMessage);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return {
    generatePreview,
    isGenerating,
    error
  };
};
