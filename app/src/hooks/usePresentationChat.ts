import { useState } from 'react';
import { PresentationPlan } from './usePresentationGeneration';

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface UpdatePresentationResponse {
  data: PresentationPlan;
  debug?: {
    changesDetected: boolean;
    changes: Array<{
      index: number;
      titleChanged: boolean;
      contentChanged: boolean;
      originalTitle: string;
      updatedTitle: string;
      originalContent: string;
      updatedContent: string;
    }>;
    totalSlides: number;
    requestMessage: string;
  };
}

export function usePresentationChat() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updatePresentationWithChat = async (
    presentationPlan: PresentationPlan,
    chatMessage: string,
    chatHistory: ChatMessage[] = []
  ): Promise<UpdatePresentationResponse | null> => {
    setIsProcessing(true);
    setError(null);

    try {
      console.log('🤖 チャットでプレゼンテーション更新中...', {
        message: chatMessage,
        historyLength: chatHistory.length
      });

      const response = await fetch('/api/updatePresentationWithChat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          presentationPlan,
          chatMessage,
          chatHistory
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result: UpdatePresentationResponse = await response.json();
      
      console.log('✅ プレゼンテーション更新成功:', result);
      return result;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '不明なエラーが発生しました';
      console.error('❌ プレゼンテーション更新エラー:', errorMessage);
      setError(errorMessage);
      return null;
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    updatePresentationWithChat,
    isProcessing,
    error,
  };
}
