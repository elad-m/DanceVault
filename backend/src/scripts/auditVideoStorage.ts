import { auditStorageState } from "../domain/storageAudit";
import { prisma } from "../db";
import { createVideoStorageProvider } from "../storage";
import { runtime } from "../runtime";

const stalePendingUploadHours = 24;
const stalePendingUploadMilliseconds =
    stalePendingUploadHours * 60 * 60 * 1000;

async function main() {
    const minioProvider = createVideoStorageProvider("minio");
    const awsProvider = createVideoStorageProvider("awsS3");

    try {
        const minioObjectKeys = await minioProvider.listVideoObjectKeys();
        const awsObjectKeys = await awsProvider.listVideoObjectKeys();

        const videos = await prisma.video.findMany({
            where: {
                sourceType: "uploaded",
                environment: runtime.environment,
            },
            select: {
                id: true,
                title: true,
                storageKey: true,
                status: true,
                createdAt: true,
            },
            orderBy: {
                createdAt: "asc",
            },
        });

        const report = auditStorageState({
            videos,
            storageKeys: {
                minio: new Set(minioObjectKeys),
                awsS3: new Set(awsObjectKeys),
            },
            now: new Date(),
            pendingUploadMaxAgeMilliseconds:
                stalePendingUploadMilliseconds,
        });

        console.log(
            JSON.stringify(
                {
                    buckets: {
                        minio: minioProvider.bucketName,
                        awsS3: awsProvider.bucketName,
                    },
                    uploadedVideoRows: videos.length,
                    environment: runtime.environment,
                    minioObjectCount: minioObjectKeys.length,
                    awsS3ObjectCount: awsObjectKeys.length,
                    stalePendingUploadHours,
                    ...report,
                },
                null,
                2
            )
        );
    } finally {
        minioProvider.close();
        awsProvider.close();
        await prisma.$disconnect();
    }
}

main()
    .catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    });
