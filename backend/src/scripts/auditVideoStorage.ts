import { auditStorageState } from "../domain/storageAudit";
import { prisma } from "../db";
import {
    createStorageTarget,
    listVideoObjectKeys,
    s3Client,
} from "../storage/s3Client";

const stalePendingUploadHours = 24;
const stalePendingUploadMilliseconds =
    stalePendingUploadHours * 60 * 60 * 1000;

async function main() {
    const minioTarget = createStorageTarget("minio");
    const awsTarget = createStorageTarget("aws");

    const minioObjectKeys = await listVideoObjectKeys(minioTarget);
    const awsObjectKeys = await listVideoObjectKeys(awsTarget);

    const videos = await prisma.video.findMany({
        where: {
            sourceType: "uploaded",
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
            aws: new Set(awsObjectKeys),
        },
        now: new Date(),
        pendingUploadMaxAgeMilliseconds:
            stalePendingUploadMilliseconds,
    });

    console.log(
        JSON.stringify(
            {
                buckets: {
                    minio: minioTarget.bucketName,
                    aws: awsTarget.bucketName,
                },
                uploadedVideoRows: videos.length,
                minioObjectCount: minioObjectKeys.length,
                awsObjectCount: awsObjectKeys.length,
                stalePendingUploadHours,
                ...report,
            },
            null,
            2
        )
    );
}

main()
    .catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
        s3Client.destroy();
    });