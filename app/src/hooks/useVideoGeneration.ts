// hooks/useVideoGeneration.ts - 動画生成関連のカスタムフック
import { useState, useCallback, useEffect } from 'react';
import { VideoHistoryItem, VideoJob, VideoAspectRatio, VideoResolution, VideoDuration, VideoVariation } from '../types';
import { useAuth } from './useAuth';

// 🖼️ OpenAI APIのサムネイルURLをプロキシ経由URLに変換するヘルパー関数
const convertThumbnailUrlToProxy = (thumbnailUrl: string | undefined): string | undefined => {
  if (!thumbnailUrl) return undefined;
  
  console.log('🔄 [DEBUG] サムネイルURL変換開始:', thumbnailUrl);
  
  if (thumbnailUrl.includes('openai/v1/video/generations/') && thumbnailUrl.includes('/content/thumbnail')) {
    try {
      const url = new URL(thumbnailUrl);
      const path = url.pathname.replace(/^\//, '') + url.search;
      const proxyUrl = `/api/image-proxy?path=${encodeURIComponent(path)}`;
      console.log('✅ [DEBUG] サムネイルURL変換成功:', {
        original: thumbnailUrl,
        path: path,
        proxyUrl: proxyUrl
      });
      return proxyUrl;
    } catch (error) {
      console.warn('🔄 サムネイルURL変換失敗:', thumbnailUrl, error);
      return thumbnailUrl;
    }
  }
  
  console.log('🔄 [DEBUG] サムネイルURL変換スキップ（OpenAI APIパスではない）:', thumbnailUrl);
  return thumbnailUrl;
};

export const useVideoGeneration = () => {
  // 🎬 動画生成設定のstate
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoAspectRatio, setVideoAspectRatio] = useState<VideoAspectRatio>('16:9');
  const [videoResolution, setVideoResolution] = useState<VideoResolution>('480p');
  const [videoDuration, setVideoDuration] = useState<VideoDuration>(5);
  const [videoVariation, setVideoVariation] = useState<VideoVariation>(1);

  // 📹 動画履歴とジョブ管理
  const [videoHistory, setVideoHistory] = useState<VideoHistoryItem[]>([]);
  const [activeVideoJobs, setActiveVideoJobs] = useState<VideoJob[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoHistoryItem | null>(null);
  
  // ⏳ ローディング状態
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoHistoryLoading, setVideoHistoryLoading] = useState(false);
  
  // 💡 プロンプト推薦
  const [recommendedPrompt, setRecommendedPrompt] = useState('');
  const [loadingRec, setLoadingRec] = useState(false);

  const { isAuthenticated, getAuthToken, getUserId } = useAuth();

  // 🚀 動画ジョブ一覧取得（OpenAI APIから）
  const fetchVideoJobs = useCallback(async () => {
    if (!isAuthenticated) return;
    
    try {
      const token = await getAuthToken();
      if (!token) {
        console.warn('トークンがないため動画ジョブ取得をスキップ');
        return;
      }
      
      const res = await fetch('/api/videoJobs', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        console.log('🎬 動画ジョブ取得成功:', data);
        
        // OpenAI APIのジョブをVideoJobフォーマットに変換
        const jobs: VideoJob[] = await Promise.all((data.data || []).map(async (job: any) => {
          const baseJob: VideoJob = {
            id: job.id,
            jobId: job.id,
            prompt: job.prompt,
            videoSettings: {
              height: job.height || 720,
              width: job.width || 1280,
              n_seconds: job.n_seconds || 5,
              n_variants: job.n_variants || 1
            },
            status: job.status,
            progress: job.progress,
            startTime: new Date(job.created_at * 1000),
            lastChecked: new Date(),
            generationId: job.id
          };

          // 完成したジョブの場合、詳細を取得してサムネイルURLも取得
          if (job.status === 'completed' || job.status === 'succeeded') {
            try {
              const detailRes = await fetch(`/api/videoJobs/jobs/${job.id}`, {
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              });

              if (detailRes.ok) {
                const detailData = await detailRes.json();
                console.log(`🔍 [DEBUG] ジョブ詳細データ ${job.id}:`, {
                  status: detailData.status,
                  originalThumbnailUrl: detailData.thumbnailUrl,
                  originalVideoUrl: detailData.videoUrl
                });
                
                if (detailData.thumbnailUrl) {
                  // 🖼️ OpenAI APIのサムネイルURLをプロキシ経由に変換
                  const thumbnailUrl = convertThumbnailUrlToProxy(detailData.thumbnailUrl);
                  console.log(`🔄 [DEBUG] サムネイルURL変換 ${job.id}:`, {
                    original: detailData.thumbnailUrl,
                    converted: thumbnailUrl
                  });
                  baseJob.thumbnailUrl = thumbnailUrl;
                }
                if (detailData.videoUrl) {
                  baseJob.videoUrl = detailData.videoUrl;
                }
              }
            } catch (detailError) {
              console.warn(`ジョブ ${job.id} の詳細取得に失敗:`, detailError);
            }
          }

          return baseJob;
        }));
        
        setActiveVideoJobs(jobs);
        
        // 🎯 完成したジョブの自動処理
        const completedJobs = jobs.filter(job => job.status === 'completed' || job.status === 'succeeded');
        if (completedJobs.length > 0) {
          console.log(`🎬 完成したジョブを${completedJobs.length}件発見:`, completedJobs.map(j => j.id));
        }
      } else {
        console.error('動画ジョブ取得エラー:', res.status, res.statusText);
      }
    } catch (error) {
      console.error('動画ジョブ取得エラー:', error);
    }
  }, [isAuthenticated, getAuthToken]);

  // 📹 動画履歴取得（Cosmos DBから）
  const fetchVideoHistory = useCallback(async (limit: number = 20, offset: number = 0) => {
    if (!isAuthenticated) return;
    
    setVideoHistoryLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        console.warn('トークンがないため動画履歴取得をスキップ');
        setVideoHistoryLoading(false);
        return;
      }
      
      const res = await fetch(`/api/videoHistory?limit=${limit}&offset=${offset}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        console.log('📹 動画履歴取得成功:', data);
        setVideoHistory(data.videoHistory || []);
      } else {
        console.error('動画履歴取得エラー:', res.status, res.statusText);
      }
    } catch (error) {
      console.error('動画履歴取得エラー:', error);
    } finally {
      setVideoHistoryLoading(false);
    }
  }, [isAuthenticated, getAuthToken]);

  // 🎬 動画生成実行
  const handleVideoGenerate = useCallback(async () => {
    if (!videoPrompt.trim()) {
      alert('プロンプトを入力してください！');
      return;
    }

    setVideoLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        alert('認証エラー: ログインし直してください');
        return;
      }

      // 解像度設定を実際の数値に変換
      const getResolutionDimensions = (resolution: VideoResolution) => {
        switch (resolution) {
          case '480p': return { width: 854, height: 480 };
          case '720p': return { width: 1280, height: 720 };
          case '1080p': return { width: 1920, height: 1080 };
          default: return { width: 1280, height: 720 };
        }
      };

      const dimensions = getResolutionDimensions(videoResolution);

      const requestBody = {
        prompt: videoPrompt,
        model: 'sora-1.0-turbo',
        height: dimensions.height,
        width: dimensions.width,
        n_seconds: videoDuration
      };

      console.log('🎬 動画生成リクエスト:', requestBody);

      const response = await fetch('/api/generateVideo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ 動画生成開始成功:', result);
        alert('🎬 動画生成を開始しました！左下のジョブリストで進捗を確認してね！');
        
        // ジョブリストを更新
        fetchVideoJobs();
      } else {
        const errorData = await response.json();
        console.error('❌ 動画生成エラー:', errorData);
        alert(`❌ 動画生成エラー: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ 動画生成エラー:', error);
      alert(`❌ エラーが発生しました: ${error}`);
    } finally {
      setVideoLoading(false);
    }
  }, [videoPrompt, videoResolution, videoDuration, getAuthToken, fetchVideoJobs]);

  // 💾 完成したジョブを手動処理
  const handleProcessCompletedJob = useCallback(async (job: VideoJob) => {
    if (!job.id) return;

    try {
      const token = await getAuthToken();
      if (!token) return;

      const userId = getUserId();
      if (!userId) {
        alert('ユーザーID取得に失敗しました');
        return;
      }

      console.log(`📥 ジョブ ${job.id} の処理開始...`);

      // Step 1: まず動画をダウンロードしてBlob Storageに保存
      console.log(`📥 動画ダウンロード開始: ${job.videoUrl}`);
      const downloadRes = await fetch('/api/downloadVideo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          videoUrl: job.videoUrl,
          thumbnailUrl: job.thumbnailUrl, // サムネイルURLも送信
          jobId: job.id,
          prompt: job.prompt
        })
      });

      if (!downloadRes.ok) {
        const downloadError = await downloadRes.json();
        console.error(`❌ 動画ダウンロード失敗:`, downloadError);
        alert(`❌ 動画ダウンロードに失敗しました: ${downloadError.error || 'Unknown error'}`);
        return;
      }

      const downloadData = await downloadRes.json();
      console.log(`✅ 動画ダウンロード完了:`, downloadData);

      // Step 2: ダウンロード成功したらBlob StorageのURLで履歴に保存
      const saveRes = await fetch('/api/videoHistory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          prompt: job.prompt,
          originalPrompt: job.prompt,
          videoSettings: job.videoSettings,
          jobId: job.id,
          jobStatus: 'completed',
          videoUrl: downloadData.videoUrl, // Blob StorageのURL
          videoBlobPath: downloadData.blobPath, // 動画のBlob Storageパス
          thumbnailUrl: convertThumbnailUrlToProxy(downloadData.thumbnailUrl || job.thumbnailUrl), // サムネイルもBlob Storageにあれば使用（プロキシ経由）
          thumbnailBlobPath: downloadData.thumbnailBlobPath, // サムネイルのBlob Storageパス
          metadata: {
            generationId: job.generationId || job.id,
            processingTime: job.startTime ? Date.now() - job.startTime.getTime() : undefined,
            originalVideoUrl: job.videoUrl, // 元のOpenAI APIのURLも保存
            originalThumbnailUrl: job.thumbnailUrl, // 元のOpenAI APIサムネイルURLも保存
            blobPath: downloadData.blobPath, // Blob Storageのパス（後方互換性）
            thumbnailBlobPath: downloadData.thumbnailBlobPath // サムネイルのBlob Storageパス
          }
        })
      });

      if (saveRes.ok) {
        const saveData = await saveRes.json();
        console.log(`✅ ジョブ ${job.id} の処理完了:`, saveData);
        
        alert(`✅ 動画「${job.prompt.substring(0, 30)}...」の取り込み完了！`);
        
        // 両方のリストを更新
        fetchVideoJobs();
        fetchVideoHistory();
      } else {
        const errorData = await saveRes.json();
        console.error(`❌ ジョブ ${job.id} の処理失敗:`, errorData);
        alert(`❌ 動画処理に失敗しました: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`❌ ジョブ ${job.id} の処理エラー:`, error);
      alert(`❌ 動画処理中にエラーが発生しました: ${error}`);
    }
  }, [getAuthToken, getUserId, fetchVideoJobs, fetchVideoHistory]);

  // 🗑️ ジョブ削除機能
  const handleDeleteVideoJob = useCallback(async (job: VideoJob) => {
    if (!job.id) return;

    // 確認ダイアログ
    const confirmDelete = window.confirm(
      `ジョブ「${job.prompt.substring(0, 50)}...」を削除しますか？\n\nこの操作は取り消せません。`
    );
    
    if (!confirmDelete) return;

    try {
      const token = await getAuthToken();
      if (!token) return;

      console.log(`🗑️ ジョブ ${job.id} の削除開始...`);

      // 楽観的更新: UIから即座に削除
      setActiveVideoJobs((prev: VideoJob[]) => {
        const originalJobs = [...prev];
        const filteredJobs = prev.filter((j: VideoJob) => j.id !== job.id);
        
        // originalJobsを内部で保存（エラー時のロールバック用）
        (window as any).__deletedJobBackup = originalJobs;
        return filteredJobs;
      });

      // deleteVideoJob APIを呼び出し（正しいエンドポイント）
      const deleteRes = await fetch(`/api/deleteVideoJob/${job.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (deleteRes.ok) {
        const deleteData = await deleteRes.json();
        console.log(`✅ ジョブ ${job.id} の削除完了:`, deleteData);
        alert(`✅ ジョブ「${job.prompt.substring(0, 30)}...」を削除しました`);
        
        // バックアップクリア
        (window as any).__deletedJobBackup = null;
        
        // 2秒後にリストを再取得（API反映待ち）
        setTimeout(() => {
          console.log('🔄 削除後の再取得を実行...');
          fetchVideoJobs();
        }, 2000);
      } else {
        // 削除失敗時は元のリストに戻す
        const backup = (window as any).__deletedJobBackup;
        if (backup) {
          setActiveVideoJobs(backup);
          (window as any).__deletedJobBackup = null;
        }
        const errorData = await deleteRes.json();
        console.error(`❌ ジョブ ${job.id} の削除失敗:`, errorData);
        alert(`❌ ジョブの削除に失敗しました: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      // エラー時は元のリストに戻す
      const backup = (window as any).__deletedJobBackup;
      if (backup) {
        setActiveVideoJobs(backup);
        (window as any).__deletedJobBackup = null;
      }
      console.error(`❌ ジョブ ${job.id} の削除エラー:`, error);
      alert(`❌ ジョブ削除中にエラーが発生しました: ${error}`);
    }
  }, [getAuthToken, fetchVideoJobs]);

  // 💾 完成したジョブを処理（取り込み後に自動削除）
  const handleProcessCompletedJobWithDelete = useCallback(async (job: VideoJob) => {
    if (!job.id) return;

    try {
      const token = await getAuthToken();
      if (!token) return;

      const userId = getUserId();
      if (!userId) {
        alert('ユーザーID取得に失敗しました');
        return;
      }

      console.log(`📥 ジョブ ${job.id} の処理開始...`);

      // Step 1: まず動画をダウンロードしてBlob Storageに保存
      console.log(`📥 動画ダウンロード開始: ${job.videoUrl}`);
      const downloadRes = await fetch('/api/downloadVideo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          videoUrl: job.videoUrl,
          thumbnailUrl: job.thumbnailUrl, // サムネイルURLも送信
          jobId: job.id,
          prompt: job.prompt
        })
      });

      if (!downloadRes.ok) {
        const downloadError = await downloadRes.json();
        console.error(`❌ 動画ダウンロード失敗:`, downloadError);
        alert(`❌ 動画ダウンロードに失敗しました: ${downloadError.error || 'Unknown error'}`);
        return;
      }

      const downloadData = await downloadRes.json();
      console.log(`✅ 動画ダウンロード完了:`, downloadData);

      // Step 2: ダウンロード成功したらBlob StorageのURLで履歴に保存
      const saveRes = await fetch('/api/videoHistory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          prompt: job.prompt,
          originalPrompt: job.prompt,
          videoSettings: job.videoSettings,
          jobId: job.id,
          jobStatus: 'completed',
          videoUrl: downloadData.videoUrl, // Blob StorageのURL
          videoBlobPath: downloadData.blobPath, // 動画のBlob Storageパス
          thumbnailUrl: convertThumbnailUrlToProxy(downloadData.thumbnailUrl || job.thumbnailUrl), // サムネイルもBlob Storageにあれば使用（プロキシ経由）
          thumbnailBlobPath: downloadData.thumbnailBlobPath, // サムネイルのBlob Storageパス
          metadata: {
            generationId: job.generationId || job.id,
            processingTime: job.startTime ? Date.now() - job.startTime.getTime() : undefined,
            originalVideoUrl: job.videoUrl, // 元のOpenAI APIのURLも保存
            originalThumbnailUrl: job.thumbnailUrl, // 元のOpenAI APIサムネイルURLも保存
            blobPath: downloadData.blobPath, // Blob Storageのパス（後方互換性）
            thumbnailBlobPath: downloadData.thumbnailBlobPath // サムネイルのBlob Storageパス
          }
        })
      });

      if (saveRes.ok) {
        const saveData = await saveRes.json();
        console.log(`✅ ジョブ ${job.id} の処理完了:`, saveData);
        
        // 💡 [DEBUG] 処理成功後の自動削除を一時的に無効化（デバッグのため）
        /*
        console.log(`🗑️ ジョブ ${job.id} を自動削除中...`);
        
        // 楽観的更新: UIから即座に削除
        setActiveVideoJobs((prev: VideoJob[]) => prev.filter((j: VideoJob) => j.id !== job.id));
        
        const deleteRes = await fetch(`/api/deleteVideoJob/${job.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (deleteRes.ok) {
          console.log(`✅ ジョブ ${job.id} の自動削除完了`);
        } else {
          console.warn(`⚠️ ジョブ ${job.id} の自動削除に失敗（処理は成功）`);
        }
        */
        console.log(`💡 [DEBUG] ジョブ ${job.id} の自動削除をスキップ（デバッグモード）`);
        
        alert(`✅ 動画「${job.prompt.substring(0, 30)}...」の取り込み完了！`);
        
        // 両方のリストを更新
        fetchVideoJobs();
        fetchVideoHistory();
      } else {
        const errorData = await saveRes.json();
        console.error(`❌ ジョブ ${job.id} の処理失敗:`, errorData);
        alert(`❌ 動画処理に失敗しました: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`❌ ジョブ ${job.id} の処理エラー:`, error);
      alert(`❌ 動画処理中にエラーが発生しました: ${error}`);
    }
  }, [getAuthToken, getUserId, fetchVideoJobs, fetchVideoHistory]);

  // 📺 動画選択
  const handleVideoSelect = useCallback((video: VideoHistoryItem | null) => {
    setSelectedVideo(video);
  }, []);

  // 🔄 履歴更新
  const handleVideoHistoryRefresh = useCallback(() => {
    fetchVideoHistory();
  }, [fetchVideoHistory]);

  // 🔄 ジョブ更新
  const handleVideoJobsRefresh = useCallback(() => {
    fetchVideoJobs();
  }, [fetchVideoJobs]);

  // 💡 推薦プロンプト生成
  const generateRecommendedVideo = useCallback(async () => {
    if (!videoPrompt.trim()) {
      console.error('プロンプトが空です。まず動画プロンプトを入力してください。');
      return;
    }

    setLoadingRec(true);
    try {
      const token = await getAuthToken();
      if (!token) return;

      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          prompt: videoPrompt,
          mode: 'video' // 🎬 動画モードを指定
        })
      });

      if (response.ok) {
        const data = await response.json();
        setRecommendedPrompt(data.recommended || '');
      } else {
        console.error('推薦プロンプト取得エラー:', response.statusText);
        const errorData = await response.json();
        console.error('エラー詳細:', errorData);
      }
    } catch (error) {
      console.error('推薦プロンプト取得エラー:', error);
    } finally {
      setLoadingRec(false);
    }
  }, [getAuthToken, videoPrompt]);

  // 💡 推薦プロンプト使用
  const useRecommendedPrompt = useCallback(() => {
    if (recommendedPrompt) {
      setVideoPrompt(recommendedPrompt);
      setRecommendedPrompt('');
    }
  }, [recommendedPrompt]);

  // 🗑️ 動画履歴削除
  const handleDeleteVideoHistory = useCallback(async (videoId: string) => {
    if (!isAuthenticated) {
      alert('認証が必要です');
      return;
    }

    const confirmDelete = window.confirm('この動画履歴を削除しますか？');
    if (!confirmDelete) return;

    try {
      const token = await getAuthToken();
      if (!token) {
        alert('認証エラー: ログインし直してください');
        return;
      }

      console.log('🗑️ 動画履歴削除開始:', videoId);

      const deleteRes = await fetch('/api/videoHistory', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id: videoId })
      });

      if (deleteRes.ok) {
        const deleteData = await deleteRes.json();
        console.log('✅ 動画履歴削除成功:', deleteData);
        
        // UIから即座に削除（楽観的更新）
        setVideoHistory((prev: VideoHistoryItem[]) => 
          prev.filter((video: VideoHistoryItem) => video.id !== videoId)
        );
        
        alert('🗑️ 動画履歴を削除しました！');
      } else {
        console.error('❌ 動画履歴削除エラー - HTTP Status:', deleteRes.status);
        let errorMessage = `HTTP ${deleteRes.status}`;
        
        try {
          const errorData = await deleteRes.json();
          errorMessage = errorData.error || errorMessage;
          console.error('❌ 動画履歴削除エラー詳細:', errorData);
        } catch (jsonError) {
          // JSONパースに失敗した場合はテキストを取得
          try {
            const errorText = await deleteRes.text();
            console.error('❌ 削除エラーレスポンス(非JSON):', errorText);
            errorMessage = errorText || errorMessage;
          } catch {
            console.error('❌ レスポンス読み取りにも失敗');
          }
        }
        
        alert(`❌ 削除エラー: ${errorMessage}`);
      }
    } catch (error) {
      console.error('❌ 動画履歴削除エラー:', error);
      alert(`❌ エラーが発生しました: ${error}`);
    }
  }, [isAuthenticated, getAuthToken]);

  // 🔄 初期化時にデータを取得
  useEffect(() => {
    if (isAuthenticated) {
      fetchVideoHistory();
      fetchVideoJobs();
    }
  }, [isAuthenticated, fetchVideoHistory, fetchVideoJobs]);

  // 📤 戻り値
  return {
    // State
    videoPrompt,
    setVideoPrompt,
    videoAspectRatio,
    setVideoAspectRatio,
    videoResolution,
    setVideoResolution,
    videoDuration,
    setVideoDuration,
    videoVariation,
    setVideoVariation,
    videoHistory,
    activeVideoJobs,
    videoJobs: activeVideoJobs, // エイリアス追加
    selectedVideo,
    videoLoading,
    videoHistoryLoading,
    recommendedPrompt,
    loadingRec,
    
    // Actions
    handleVideoGenerate,
    handleVideoSelect,
    handleVideoHistoryRefresh,
    handleVideoJobsRefresh,
    handleProcessCompletedJob,
    generateRecommendedVideo,
    useRecommendedPrompt,
    handleDeleteVideoJob,
    deleteJob: handleDeleteVideoJob, // エイリアス追加
    handleProcessCompletedJobWithDelete,
    handleDeleteVideoHistory,
    
    // Auth
    getAuthToken,
  };
};
