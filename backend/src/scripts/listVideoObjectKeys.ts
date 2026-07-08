import {
    listVideoObjectKeys,
    readStorageProvider,
    s3Client,
    videoBucketName,
} from "../storage/s3Client";

async function main() {
    const storageKeys = await listVideoObjectKeys();

    console.log(
        JSON.stringify(
            {
                provider: readStorageProvider(),
                bucket: videoBucketName,
                count: storageKeys.length,
                storageKeys,
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
    .finally(() => {
        s3Client.destroy();
    });