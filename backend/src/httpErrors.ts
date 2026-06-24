import type { FastifyReply } from "fastify";

export const ApiErrorCode = {
    InternalServerError: "INTERNAL_SERVER_ERROR",
    InvalidSegmentTimestamps: "INVALID_SEGMENT_TIMESTAMPS",
    SegmentNotFound: "SEGMENT_NOT_FOUND",
    ValidationError: "VALIDATION_ERROR",
    VideoNotFound: "VIDEO_NOT_FOUND",
} as const;

export type ApiErrorCode =
    (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

type ApiErrorMessageMap = Record<ApiErrorCode, string>;
export const ApiErrorMessage: ApiErrorMessageMap = {
    [ApiErrorCode.InternalServerError]: "Internal server error",
    [ApiErrorCode.InvalidSegmentTimestamps]:
        "endSeconds must be greater than startSeconds",
    [ApiErrorCode.SegmentNotFound]: "Segment not found",
    [ApiErrorCode.ValidationError]: "Request validation failed",
    [ApiErrorCode.VideoNotFound]: "Video not found",
};

type SendApiErrorOptions = {
    statusCode: number;
    code: ApiErrorCode;
    message?: string;
};

type ApiErrorResponse = {
    error: {
        code: ApiErrorCode;
        message: string;
    };
};

export function sendApiError(
    reply: FastifyReply,
    { statusCode, code, message = ApiErrorMessage[code] }: SendApiErrorOptions
) {
    const responseBody: ApiErrorResponse = {
        error: {
            code,
            message,
        },
    };

    return reply.status(statusCode).send(responseBody);
}
