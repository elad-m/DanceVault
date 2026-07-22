export const VIDEO_ITEM_KEY_PREFIX = "VIDEO#";
export const SEGMENT_ITEM_KEY_PREFIX = "SEGMENT#";

export function createUserPartitionKey(
    userID: string
): string {
    return `USER#${userID}`;
}

export type VideoPrimaryKey = {
    PK: string;
    SK: string;
};

type CreateVideoPrimaryKeyInput = {
    userID: string;
    videoID: string;
};

export function createVideoPrimaryKey({
    userID,
    videoID,
}: CreateVideoPrimaryKeyInput): VideoPrimaryKey {
    return {
        PK: createUserPartitionKey(userID),
        SK: `${VIDEO_ITEM_KEY_PREFIX}${videoID}`,
    };
}

export type VideoItemKeys = VideoPrimaryKey & {
    UserContentPK: string;
    UserContentSK: string;
};

type CreateVideoItemKeysInput = {
    userID: string;
    videoID: string;
    createdAt: Date;
};

export function createVideoItemKeys({
    userID,
    videoID,
    createdAt,
}: CreateVideoItemKeysInput): VideoItemKeys {
    const primaryKey = createVideoPrimaryKey({
        userID,
        videoID,
    });

    return {
        ...primaryKey,
        UserContentPK: primaryKey.PK,
        UserContentSK: `${VIDEO_ITEM_KEY_PREFIX}${createdAt.toISOString()}#${videoID}`,
    };
}

export type SegmentItemKeys = {
    PK: string;
    SK: string;
    VideoPK: string;
    VideoSK: string;
    UserContentPK: string;
    UserContentSK: string;
};

type CreateSegmentItemKeysInput = {
    userID: string;
    videoID: string;
    segmentID: string;
    startMilliseconds: number;
    createdAt: Date;
};

export function createSegmentItemKeys({
    userID,
    videoID,
    segmentID,
    startMilliseconds,
    createdAt,
}: CreateSegmentItemKeysInput): SegmentItemKeys {
    const userPK = createUserPartitionKey(userID);
    const paddedStartMilliseconds =
        startMilliseconds.toString().padStart(12, "0");

    return {
        PK: userPK,
        SK: `${SEGMENT_ITEM_KEY_PREFIX}${segmentID}`,
        VideoPK: `${VIDEO_ITEM_KEY_PREFIX}${videoID}`,
        VideoSK:
            `${SEGMENT_ITEM_KEY_PREFIX}${paddedStartMilliseconds}#${segmentID}`,
        UserContentPK: userPK,
        UserContentSK:
            `${SEGMENT_ITEM_KEY_PREFIX}${createdAt.toISOString()}#${segmentID}`,
    };
}
