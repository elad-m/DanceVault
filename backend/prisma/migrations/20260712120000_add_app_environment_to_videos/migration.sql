CREATE TYPE "AppEnvironment" AS ENUM ('local', 'dev');

ALTER TABLE "Video"
ADD COLUMN "environment" "AppEnvironment" NOT NULL DEFAULT 'local';
