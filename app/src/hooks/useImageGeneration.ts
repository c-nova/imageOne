// 🎭 画像生成専用hook
import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';

export interface ImageItem {
  id: string;
  prompt: string;
  originalPrompt?: string;
  imageUrl: string;
  imageBlobPath?: string;
  operationType: 'generate' | 'edit';
  size: string;
  timestamp: string;
  metadata?: {
    processingTime?: number;
    userAgent?: string;
  };
  cameraSettings?: {
    focalLength: number;
    aperture: number;
    colorTemp: number;
  };
}

export interface CameraSettings {
  focalLength: number;    // 10-200mm
  aperture: number;       // f/2-f/10
  colorTemp: number;      // 2000K-10000K
}

export type ImageStyle =
  | 'Ultra Realistic Photo'
  | 'Casual Snapshot'
  | 'Portrait'
  | 'Cinematic'
  | '3D Rendered'
  | 'Digital Art'
  | 'Concept Art'
  | 'Photorealistic Render'
  | 'Anime Style'
  | 'Manga'
  | 'Studio Ghibli Style'
  | 'Character Design'
  | 'Oil Painting'
  | 'Watercolor'
  | 'Sketch Drawing'
  | 'Impressionist';

export const useImageGeneration = () => {
  // 画像生成の状態
  const [prompt, setPrompt] = useState('');
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [size, setSize] = useState<'1024x1024' | '1536x1024' | '1024x1536'>('1024x1024');
  const [loading, setLoading] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  
  // カメラ設定
  const [cameraSettings, setCameraSettings] = useState<CameraSettings>({
    focalLength: 50,
    aperture: 2.8,
    colorTemp: 5500
  });
  
  // 画像スタイル
  const [imageStyle, setImageStyle] = useState<ImageStyle>('Ultra Realistic Photo');
  
  // 推奨プロンプト機能
  const [recommendedPrompt, setRecommendedPrompt] = useState('');
  const [loadingRec, setLoadingRec] = useState(false);
  
  // 画像履歴
  const [imageHistory, setImageHistory] = useState<ImageItem[]>([]);
  const [imageHistoryLoading, setImageHistoryLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null);
  
  const { getAuthToken } = useAuth();

  // 📜 画像履歴取得
  const handleImageHistoryRefresh = useCallback(async () => {
    setImageHistoryLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('認証トークンが見つかりません');
      }

      const response = await fetch('/api/list', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '画像履歴の取得に失敗しました');
      }
      setImageHistory(data.images || []);
    } catch (error) {
      console.error('❌ 画像履歴取得エラー:', error);
    } finally {
      setImageHistoryLoading(false);
    }
  }, [getAuthToken]);

  // 🎨 画像生成実行
  const handleImageGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    // buildCameraPromptをここに移動
    const buildCameraPrompt = (basePrompt: string): string => {
      const cameraSettingsArr = [
        `shot with ${cameraSettings.focalLength}mm lens`,
        `aperture f/${cameraSettings.aperture}`,
        `${cameraSettings.colorTemp}K color temperature`
      ];
      const styleSuffix = imageStyle ? `, ${imageStyle}` : '';
      return `${basePrompt}, ${cameraSettingsArr.join(', ')}${styleSuffix}`;
    };
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('認証トークンが見つかりません');
      }

      // カメラ設定＋スタイルを組み込んだプロンプトを送信
      const finalPrompt = buildCameraPrompt(prompt.trim());

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          prompt: finalPrompt,
          originalPrompt: originalPrompt || prompt.trim(),
          size,
          cameraSettings,
          imageStyle
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '画像生成に失敗しました');
      }

      setGeneratedImage(data.imageUrl);
      
      // 成功したら履歴を更新（自動で呼び出し）
      handleImageHistoryRefresh();
      
    } catch (error) {
      console.error('❌ 画像生成エラー:', error);
      const errorMessage = error instanceof Error ? error.message : '不明なエラーが発生しました';
      alert(`画像生成に失敗しました: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [prompt, originalPrompt, size, cameraSettings, imageStyle, getAuthToken, handleImageHistoryRefresh]);

  // 💡 推奨プロンプト生成
  const generateRecommendedPrompt = useCallback(async () => {
    if (!prompt.trim()) return;
    
    setLoadingRec(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('認証トークンが見つかりません');
      }

      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          prompt: prompt.trim()
        })
      });

      const data = await response.json();
      console.log('🎯 [DEBUG] APIレスポンス:', data); // デバッグログ追加
      
      if (!response.ok) {
        throw new Error(data.error || '推奨プロンプト生成に失敗しました');
      }

      // APIは 'recommended' フィールドで返すので修正
      let recommendedText = data.recommended || data.recommendedPrompt;
      // 前後の鉤括弧・クォート類を除去（不要なエスケープ修正）
      recommendedText = recommendedText.replace(/^[\s\n]*["'“”「『（[]+/u, '').replace(/["'“”」』）\]\s\n]*$/u, '').trim();
      console.log('🎯 [DEBUG] 推奨プロンプト:', recommendedText); // デバッグログ追加
      setRecommendedPrompt(recommendedText);
      
    } catch (error) {
      console.error('❌ 推奨プロンプト生成エラー:', error);
      const errorMessage = error instanceof Error ? error.message : '不明なエラーが発生しました';
      alert(`推奨プロンプト生成に失敗しました: ${errorMessage}`);
    } finally {
      setLoadingRec(false);
    }
  }, [prompt, getAuthToken]);

  // 推奨プロンプトを使用
  const useRecommendedPrompt = useCallback(() => {
    if (recommendedPrompt) {
      setOriginalPrompt(prompt); // 元のプロンプトを保存
      setPrompt(recommendedPrompt);
      setRecommendedPrompt(''); // クリア
    }
  }, [recommendedPrompt, prompt]);

  // 🖼️ 画像選択
  const handleImageSelect = useCallback((image: ImageItem | null) => {
    setSelectedImage(image);
  }, []);

  // 🗑️ 画像削除
  const handleImageDelete = useCallback(async (image: ImageItem) => {
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('認証トークンが見つかりません');
      }

      const response = await fetch('/api/delete', {
        method: 'POST', // ←DELETE→POSTに修正
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          url: image.imageBlobPath // ←imagePath→urlに修正
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '画像削除に失敗しました');
      }

      // 選択中の画像が削除されたらクリア
      if (selectedImage?.id === image.id) {
        setSelectedImage(null);
      }
      
      // 履歴を更新
      handleImageHistoryRefresh();
      
    } catch (error) {
      console.error('❌ 画像削除エラー:', error);
      const errorMessage = error instanceof Error ? error.message : '不明なエラーが発生しました';
      alert(`画像削除に失敗しました: ${errorMessage}`);
    }
  }, [selectedImage, getAuthToken, handleImageHistoryRefresh]);

  return {
    // State
    prompt,
    setPrompt,
    originalPrompt,
    setOriginalPrompt,
    size,
    setSize,
    loading,
    generatedImage,
    setGeneratedImage,
    cameraSettings,
    setCameraSettings,
    imageStyle,
    setImageStyle,
    recommendedPrompt,
    loadingRec,
    imageHistory,
    imageHistoryLoading,
    selectedImage,
    
    // Actions
    handleImageGenerate,
    generateRecommendedPrompt,
    useRecommendedPrompt,
    handleImageHistoryRefresh,
    handleImageSelect,
    handleImageDelete,
    
    // Auth
    getAuthToken
  };
};
