import {
    createVideoStorageProvider,
    getActiveVideoStorageProviderName,
} from "../storage";

async function main() {
    const provider = createVideoStorageProvider(
        getActiveVideoStorageProviderName()
    );

    try {
        const storageKeys = await provider.listVideoObjectKeys();

        console.log(
            JSON.stringify(
                {
                    providerName: provider.name,
                    bucket: provider.bucketName,
                    count: storageKeys.length,
                    storageKeys,
                },
                null,
                2
            )
        );
    } finally {
        provider.close();
    }
}

main()
    .catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    });
