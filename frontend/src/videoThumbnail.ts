const videoThumbnailWidth = 320;
const videoThumbnailHeight = 180;
const videoThumbnailJPEGQuality = 0.78;
const videoThumbnailMediaTimeoutMilliseconds = 10_000;

function waitForMediaEvent(
    video: HTMLVideoElement,
    eventName: "loadeddata" | "seeked"
): Promise<void> {
    return new Promise((resolve, reject) => {
        const finish = (error?: Error) => {
            clearTimeout(timeout);
            video.removeEventListener(eventName, handleSuccess);
            video.removeEventListener("error", handleError);

            if (error) {
                reject(error);
            } else {
                resolve();
            }
        };
        const handleSuccess = () => finish();
        const handleError = () =>
            finish(new Error("The browser could not read the selected video"));
        const timeout = setTimeout(
            () => finish(new Error("The selected video took too long to load")),
            videoThumbnailMediaTimeoutMilliseconds
        );

        video.addEventListener(eventName, handleSuccess, { once: true });
        video.addEventListener("error", handleError, { once: true });
    });
}

function drawVideoThumbnail(video: HTMLVideoElement): Promise<Blob> {
    const canvas = document.createElement("canvas");
    canvas.width = videoThumbnailWidth;
    canvas.height = videoThumbnailHeight;

    const context = canvas.getContext("2d");
    if (!context || video.videoWidth === 0 || video.videoHeight === 0) {
        throw new Error("The browser could not capture the video thumbnail");
    }

    const scale = Math.min(
        videoThumbnailWidth / video.videoWidth,
        videoThumbnailHeight / video.videoHeight
    );
    const frameWidth = video.videoWidth * scale;
    const frameHeight = video.videoHeight * scale;

    context.fillStyle = "#000000";
    context.fillRect(0, 0, videoThumbnailWidth, videoThumbnailHeight);
    context.drawImage(
        video,
        (videoThumbnailWidth - frameWidth) / 2,
        (videoThumbnailHeight - frameHeight) / 2,
        frameWidth,
        frameHeight
    );

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(
                        new Error("The browser could not encode the video thumbnail")
                    );
                }
            },
            "image/jpeg",
            videoThumbnailJPEGQuality
        );
    });
}

async function captureVideoThumbnailFromSource(
    sourceURL: string
): Promise<Blob> {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "auto";
    video.src = sourceURL;

    try {
        const initialFrameLoaded = waitForMediaEvent(video, "loadeddata");
        video.load();
        await initialFrameLoaded;

        const targetSeconds = Math.min(video.duration * 0.1, 3);
        if (targetSeconds > 0.05) {
            const seeked = waitForMediaEvent(video, "seeked");
            video.currentTime = targetSeconds;
            await seeked;
        }

        return await drawVideoThumbnail(video);
    } finally {
        video.removeAttribute("src");
        video.load();
    }
}

export async function captureVideoThumbnail(file: File): Promise<Blob> {
    const objectURL = URL.createObjectURL(file);

    try {
        return await captureVideoThumbnailFromSource(objectURL);
    } finally {
        URL.revokeObjectURL(objectURL);
    }
}

export async function captureVideoThumbnailFromURL(
    sourceURL: string
): Promise<Blob> {
    return captureVideoThumbnailFromSource(sourceURL);
}
