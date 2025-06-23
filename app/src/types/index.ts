// types/index.ts - 型定義をまとめる
export interface PromptHistoryItem {
  id: string;
  userId: string;
  prompt: string;
  originalPrompt: string;
  cameraSettings: {
    focalLength: number;
    aperture: number;
    colorTemp: number;
    imageStyle: string;
  };
  imageUrl: string;
  imageBlobPath: string;
  operationType: 'generate' | 'edit';
  size: string;
  timestamp: string;
  metadata: {
    userAgent?: string;
    processingTime?: number;
    [key: string]: any;
  };
}

export interface VideoHistoryItem {
  id: string;
  userId: string;
  prompt: string;
  originalPrompt: string;
  videoSettings: {
    height: number;
    width: number;
    n_seconds: number;
    n_variants: number;
    model: string;
  };
  jobId: string;
  jobStatus: 'pending' | 'running' | 'completed' | 'succeeded' | 'failed' | 'cancelled';
  videoUrl?: string;
  videoBlobPath?: string;
  thumbnailUrl?: string;
  thumbnailBlobPath?: string;
  operationType: 'generate';
  timestamp: string;
  completedAt?: string;
  metadata: {
    userAgent?: string;
    processingTime?: number;
    generationId?: string;
    fileSize?: number;
    duration?: number;
    dimensions?: { width: number; height: number };
    [key: string]: any;
  };
}

export interface VideoJob {
  id: string;
  jobId: string;
  prompt: string;
  videoSettings: {
    height: number;
    width: number;
    n_seconds: number;
    n_variants: number;
  };
  status: 'pending' | 'running' | 'completed' | 'succeeded' | 'failed' | 'cancelled';
  progress?: number;
  startTime: Date;
  lastChecked?: Date;
  generationId?: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  error?: string;
}

export type VideoAspectRatio = '1:1' | '16:9' | '9:16';
export type VideoResolution = '480p' | '720p' | '1080p';
export type VideoDuration = 5 | 10 | 15 | 20;
export type VideoVariation = 1 | 2;
