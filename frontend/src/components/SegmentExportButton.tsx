import {
    CheckCircle2,
    Download,
    LoaderCircle,
    RefreshCw,
    Share2,
    X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
    ApiRequestError,
    getSegmentExport,
    getSegmentExportDownloadUrl,
    requestSegmentExport,
} from "../api";
import type { Segment, SegmentExport } from "../types";

type SegmentExportButtonProps = {
    segment: Segment;
    onError: (message: string) => void;
};

function downloadFile(url: string) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "dance-segment.mp4";
    anchor.rel = "noopener";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
}

export function SegmentExportButton({
    segment,
    onError,
}: SegmentExportButtonProps) {
    const [exportItem, setExportItem] = useState<SegmentExport | null>(null);
    const [working, setWorking] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [showReadyDialog, setShowReadyDialog] = useState(false);
    const waitingForRequestedExport = useRef(false);
    const supportsNativeShare =
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function";

    useEffect(() => {
        let cancelled = false;
        setExportItem(null);
        setWorking(false);
        setDownloading(false);
        setShowReadyDialog(false);
        waitingForRequestedExport.current = false;

        void getSegmentExport(segment.id)
            .then((item) => {
                if (!cancelled) setExportItem(item);
            })
            .catch((error: unknown) => {
                if (
                    !cancelled &&
                    !(
                        error instanceof ApiRequestError &&
                        error.statusCode === 404
                    )
                ) {
                    onError(
                        error instanceof Error
                            ? error.message
                            : "Could not load segment export"
                    );
                }
            });

        return () => {
            cancelled = true;
        };
    }, [segment.id, onError]);

    useEffect(() => {
        if (
            exportItem?.status !== "queued" &&
            exportItem?.status !== "processing"
        ) {
            return;
        }

        const timer = window.setInterval(() => {
            void getSegmentExport(segment.id)
                .then((item) => {
                    setExportItem(item);
                    if (
                        item.status === "ready" &&
                        waitingForRequestedExport.current
                    ) {
                        waitingForRequestedExport.current = false;
                        setShowReadyDialog(true);
                    }
                })
                .catch((error: unknown) => {
                    onError(
                        error instanceof Error
                            ? error.message
                            : "Could not refresh segment export"
                    );
                    window.clearInterval(timer);
                });
        }, 1_000);

        return () => window.clearInterval(timer);
    }, [exportItem?.status, onError, segment.id]);

    async function startExport() {
        setWorking(true);
        waitingForRequestedExport.current = true;

        try {
            const requestedExport = await requestSegmentExport(segment.id);
            setExportItem(requestedExport);
            if (requestedExport.status === "ready") {
                waitingForRequestedExport.current = false;
                setShowReadyDialog(true);
            }
        } catch (error: unknown) {
            waitingForRequestedExport.current = false;
            onError(
                error instanceof Error
                    ? error.message
                    : "Could not start segment export"
            );
        } finally {
            setWorking(false);
        }
    }

    async function shareExport() {
        setWorking(true);

        try {
            const downloadUrl = await getSegmentExportDownloadUrl(
                segment.id
            );

            const response = await fetch(downloadUrl);
            if (!response.ok) {
                throw new Error("Could not download the exported segment");
            }
            const file = new File(
                [await response.blob()],
                `${segment.name}.mp4`,
                { type: "video/mp4" }
            );

            if (!navigator.canShare({ files: [file] })) {
                throw new Error(
                    "This browser cannot share video files. Use Download segment instead."
                );
            }

            await navigator.share({
                title: segment.name,
                files: [file],
            });
        } catch (error: unknown) {
            if (error instanceof DOMException && error.name === "AbortError") {
                return;
            }

            onError(
                error instanceof Error
                    ? error.message
                    : "Could not share segment export"
            );
        } finally {
            setWorking(false);
        }
    }

    async function downloadExport() {
        setDownloading(true);

        try {
            const downloadUrl = await getSegmentExportDownloadUrl(
                segment.id
            );
            downloadFile(downloadUrl);
        } catch (error: unknown) {
            onError(
                error instanceof Error
                    ? error.message
                    : "Could not download segment export"
            );
        } finally {
            setDownloading(false);
        }
    }

    const isPreparing =
        exportItem?.status === "queued" ||
        exportItem?.status === "processing";

    if (exportItem?.status === "ready") {
        return (
            <>
                <div className="segment-export-actions">
                    <button
                        className="secondary-button"
                        disabled={working || downloading}
                        onClick={() => void downloadExport()}
                        title="Download exported segment"
                    >
                        {downloading ? (
                            <LoaderCircle className="spin" size={15} />
                        ) : (
                            <Download size={15} />
                        )}
                        <span>Download segment</span>
                    </button>
                    {supportsNativeShare && (
                        <button
                            className="secondary-button"
                            disabled={working || downloading}
                            onClick={() => void shareExport()}
                            title="Share exported segment"
                        >
                            {working ? (
                                <LoaderCircle className="spin" size={15} />
                            ) : (
                                <Share2 size={15} />
                            )}
                            <span>Share segment</span>
                        </button>
                    )}
                </div>

                {showReadyDialog && (
                    <div
                        className="modal-backdrop segment-export-ready-backdrop"
                        role="presentation"
                    >
                        <section
                            className="modal segment-export-ready-dialog"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="segment-export-ready-title"
                        >
                            <header className="modal-header">
                                <div className="segment-export-ready-heading">
                                    <CheckCircle2 size={22} />
                                    <div>
                                        <h2 id="segment-export-ready-title">
                                            Segment ready
                                        </h2>
                                        <p>
                                            {segment.name} is ready to download
                                            {supportsNativeShare
                                                ? " or share."
                                                : "."}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="icon-button"
                                    onClick={() => setShowReadyDialog(false)}
                                    aria-label="Close segment ready dialog"
                                >
                                    <X size={17} />
                                </button>
                            </header>
                            <footer
                                className={`modal-footer${
                                    supportsNativeShare
                                        ? ""
                                        : " download-only"
                                }`}
                            >
                                <button
                                    type="button"
                                    className="secondary-button"
                                    disabled={working || downloading}
                                    onClick={() => void downloadExport()}
                                >
                                    {downloading ? (
                                        <LoaderCircle className="spin" size={16} />
                                    ) : (
                                        <Download size={16} />
                                    )}
                                    Download
                                </button>
                                {supportsNativeShare && (
                                    <button
                                        type="button"
                                        className="primary-button"
                                        disabled={working || downloading}
                                        onClick={() => void shareExport()}
                                    >
                                        {working ? (
                                            <LoaderCircle
                                                className="spin"
                                                size={16}
                                            />
                                        ) : (
                                            <Share2 size={16} />
                                        )}
                                        Share
                                    </button>
                                )}
                            </footer>
                        </section>
                    </div>
                )}
            </>
        );
    }

    return (
        <button
            className="secondary-button"
            disabled={working || isPreparing}
            onClick={() => void startExport()}
            title={
                exportItem?.status === "failed"
                    ? exportItem.failureMessage ?? "Export failed"
                    : "Create an MP4 file from this segment"
            }
        >
            {working || isPreparing ? (
                <LoaderCircle className="spin" size={15} />
            ) : exportItem?.status === "failed" ? (
                <RefreshCw size={15} />
            ) : (
                <Share2 size={15} />
            )}
            <span>
                {isPreparing
                    ? "Preparing segment..."
                    : exportItem?.status === "failed"
                      ? "Retry export"
                      : "Export segment"}
            </span>
        </button>
    );
}
