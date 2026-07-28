-- Remove legacy external videos before making uploaded storage metadata required.
-- Segment rows are deleted by the existing ON DELETE CASCADE relationship.
DELETE FROM "Video"
WHERE "sourceType" <> 'uploaded';

ALTER TABLE "Video"
DROP COLUMN "sourceType",
DROP COLUMN "sourceUrl",
ALTER COLUMN "storageKey" SET NOT NULL,
ALTER COLUMN "storageProvider" SET NOT NULL,
ALTER COLUMN "originalFileName" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'pending_upload';

DROP TYPE "VideoSourceType";
