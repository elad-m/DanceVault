-- Rename the persisted video storage provider to identify AWS S3 explicitly.
ALTER TYPE "StorageProvider" RENAME VALUE 'aws' TO 'awsS3';
