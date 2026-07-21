export type VideoItemKeys = {
    PK: string;
    SK: string;
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
    const userPK = `USER#${userID}`;

    return {
        PK: userPK,
        SK: `VIDEO#${videoID}`,
        UserContentPK: userPK,
        UserContentSK:
            `VIDEO#${createdAt.toISOString()}#${videoID}`,
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
    const userPK = `USER#${userID}`;
    const paddedStartMilliseconds =
        startMilliseconds.toString().padStart(12, "0");

    return {
        PK: userPK,
        SK: `SEGMENT#${segmentID}`,
        VideoPK: `VIDEO#${videoID}`,
        VideoSK:
            `SEGMENT#${paddedStartMilliseconds}#${segmentID}`,
        UserContentPK: userPK,
        UserContentSK:
            `SEGMENT#${createdAt.toISOString()}#${segmentID}`,
    };
}