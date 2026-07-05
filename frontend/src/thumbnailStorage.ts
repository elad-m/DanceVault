const databaseName = "dancevault";
const databaseVersion = 1;
const thumbnailStoreName = "segment-thumbnails";

function openThumbnailDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, databaseVersion);

        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(thumbnailStoreName)) {
                database.createObjectStore(thumbnailStoreName);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function getSegmentThumbnail(
    segmentId: string
): Promise<string | null> {
    const database = await openThumbnailDatabase();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(thumbnailStoreName, "readonly");
        const request = transaction.objectStore(thumbnailStoreName).get(segmentId);

        request.onsuccess = () => resolve(
            typeof request.result === "string" ? request.result : null
        );
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => database.close();
    });
}

export async function saveSegmentThumbnail(
    segmentId: string,
    dataUrl: string
): Promise<void> {
    const database = await openThumbnailDatabase();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(thumbnailStoreName, "readwrite");
        transaction.objectStore(thumbnailStoreName).put(dataUrl, segmentId);

        transaction.oncomplete = () => {
            database.close();
            resolve();
        };
        transaction.onerror = () => {
            database.close();
            reject(transaction.error);
        };
    });
}
