-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('minio', 'aws');

-- AlterTable
ALTER TABLE "Video" ADD COLUMN "storageProvider" "StorageProvider";

-- Existing uploaded files were audited and found in the local MinIO bucket.
UPDATE "Video"
SET "storageProvider" = 'minio'
WHERE "sourceType" = 'uploaded' AND "storageKey" IS NOT NULL;
