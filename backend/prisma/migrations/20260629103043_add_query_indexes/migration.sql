-- CreateIndex
CREATE INDEX "Segment_videoId_startSeconds_idx" ON "Segment"("videoId", "startSeconds");

-- CreateIndex
CREATE INDEX "Video_userId_createdAt_idx" ON "Video"("userId", "createdAt");
