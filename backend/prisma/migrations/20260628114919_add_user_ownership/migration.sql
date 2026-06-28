-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- Create an owner for data that existed before users were introduced
INSERT INTO "User" ("id", "email")
VALUES ('initial-user', 'owner@dancevault.local');

-- Add the ownership column as nullable temporarily
ALTER TABLE "Video" ADD COLUMN "userId" TEXT;

-- Assign existing videos to the initial user
UPDATE "Video"
SET "userId" = 'initial-user';

-- Future videos must always have an owner
ALTER TABLE "Video"
ALTER COLUMN "userId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Video"
ADD CONSTRAINT "Video_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
