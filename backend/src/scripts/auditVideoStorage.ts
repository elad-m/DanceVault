import { auditStorageState } from "../domain/storageAudit";
import { createPersistenceProvider } from "../persistence";
import { createVideoStorageProvider } from "../storage";
import { runtime } from "../runtime";

const stalePendingUploadHours = 24;
const stalePendingUploadMilliseconds =
    stalePendingUploadHours * 60 * 60 * 1000;

async function main() {
    const minioProvider = createVideoStorageProvider("minio");
    const awsProvider = createVideoStorageProvider("awsS3");
    const persistenceProvider = createPersistenceProvider();

    try {
        const minioObjectKeys = await minioProvider.listVideoObjectKeys();
        const awsObjectKeys = await awsProvider.listVideoObjectKeys();

        const videos =
            await persistenceProvider.videoDataAccess.listAllVideosForStorageAudit();

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
                    videoRows: videos.length,
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
        await persistenceProvider.close();
    }
}

main()
    .catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    });
