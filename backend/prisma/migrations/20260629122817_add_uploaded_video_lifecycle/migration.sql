-- CreateEnum
CREATE TYPE "VideoSourceType" AS ENUM (
    'youtube',
    'external_url',
    'uploaded'
);

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM (
    'pending_upload',
    'ready',
    'upload_failed'
);

-- Add upload lifecycle fields and make external URLs optional
ALTER TABLE "Video"
ADD COLUMN "status" "VideoStatus" NOT NULL DEFAULT 'ready',
ADD COLUMN "storageKey" TEXT,
ALTER COLUMN "sourceUrl" DROP NOT NULL;

-- Preserve existing values while converting text to the enum
ALTER TABLE "Video"
ALTER COLUMN "sourceType" TYPE "VideoSourceType"
USING ("sourceType"::"VideoSourceType");

-- Each uploaded object may belong to only one video
CREATE UNIQUE INDEX "Video_storageKey_key"
ON "Video"("storageKey");