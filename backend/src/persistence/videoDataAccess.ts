// Defines the database-independent video data used by application services.

import type {
    ExternalVideoSourceType,
    VideoSourceType,
    VideoStatus,
    VideoStorageProviderName,
} from "../domain/video";
import type { AppEnvironment } from "../runtime";

export type VideoDataAccessItem = {
    id: string;
    userId: string;
    environment: AppEnvironment;
    title: string;
    sourceType: VideoSourceType;
    sourceUrl: string | null;
    storageKey: string | null;
    storageProvider: VideoStorageProviderName | null;
    originalFileName: string | null;
    status: VideoStatus;
    createdAt: Date;
};

type GetVideoByIDInput = {
    userID: string;
    videoID: string;
};

type ListVideosInput = {
    userID: string;
};

type CreateVideoDataAccessInput = {
    videoID: string;
    userID: string;
    title: string;
    createdAt: Date;
} & (
    | {
          sourceType: ExternalVideoSourceType;
          sourceURL: string;
          storageKey: null;
          storageProvider: null;
          originalFileName: null;
          status: "ready";
      }
    | {
          sourceType: "uploaded";
          sourceURL: null;
          storageKey: string;
          storageProvider: VideoStorageProviderName;
          originalFileName: string;
          status: "pending_upload";
      }
);

export type VideoDataAccess = {
    createVideo(
        input: CreateVideoDataAccessInput
    ): Promise<VideoDataAccessItem>;

    getVideoByID(
        input: GetVideoByIDInput
    ): Promise<VideoDataAccessItem | null>;

    listVideos(
        input: ListVideosInput
    ): Promise<VideoDataAccessItem[]>;
};
