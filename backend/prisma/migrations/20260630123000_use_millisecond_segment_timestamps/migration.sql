-- Rename the columns so existing segment boundaries are preserved.
ALTER TABLE "Segment"
RENAME COLUMN "startSeconds" TO "startMilliseconds";

ALTER TABLE "Segment"
RENAME COLUMN "endSeconds" TO "endMilliseconds";

-- Convert the existing values from seconds to milliseconds.
UPDATE "Segment"
SET
    "startMilliseconds" = "startMilliseconds" * 1000,
    "endMilliseconds" = "endMilliseconds" * 1000;

-- Keep the generated index name aligned with the Prisma schema.
ALTER INDEX "Segment_videoId_startSeconds_idx"
RENAME TO "Segment_videoId_startMilliseconds_idx";
