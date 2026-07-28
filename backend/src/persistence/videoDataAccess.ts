// Defines the database-independent video data used by application services.

import type {
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

export type VideoDataAccess = {
    getVideoByID(
        input: GetVideoByIDInput
    ): Promise<VideoDataAccessItem | null>;

    listVideos(
        input: ListVideosInput
    ): Promise<VideoDataAccessItem[]>;
};
