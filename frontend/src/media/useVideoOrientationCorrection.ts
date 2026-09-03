import {
    useCallback,
    useEffect,
    useState,
    type CSSProperties,
    type RefObject,
} from "react";
import type { Rotation } from "mediabunny";

type VideoTrackOrientation = {
    rotation: Rotation;
    unrotatedWidth: number;
    unrotatedHeight: number;
};

function isAndroidBrowser(): boolean {
    return /Android/i.test(navigator.userAgent);
}

function ratioDistance(left: number, right: number): number {
    return Math.abs(Math.log(left / right));
}

function browserMissedQuarterTurn(
    player: HTMLVideoElement,
    orientation: VideoTrackOrientation
): boolean {
    if (
        orientation.rotation !== 90 &&
        orientation.rotation !== 270
    ) {
        return false;
    }

    const nativeRatio = player.videoWidth / player.videoHeight;
    const unrotatedRatio =
        orientation.unrotatedWidth / orientation.unrotatedHeight;
    const rotatedRatio = 1 / unrotatedRatio;

    // A square frame keeps the same dimensions after rotation, so native
    // dimensions cannot expose Android Chromium's missed display metadata.
    if (ratioDistance(unrotatedRatio, 1) < 0.01) {
        return true;
    }

    return ratioDistance(nativeRatio, unrotatedRatio) <
        ratioDistance(nativeRatio, rotatedRatio);
}

export function useVideoOrientationCorrection(
    playbackURL: string | null,
    playerRef: RefObject<HTMLVideoElement | null>,
    stageRef: RefObject<HTMLDivElement | null>
): {
    videoStyle: CSSProperties | undefined;
    updateVideoOrientation: () => void;
} {
    const [orientation, setOrientation] =
        useState<VideoTrackOrientation | null>(null);
    const [videoStyle, setVideoStyle] =
        useState<CSSProperties | undefined>();

    const updateVideoOrientation = useCallback(() => {
        const player = playerRef.current;
        const stage = stageRef.current;

        if (
            !orientation ||
            !player ||
            !stage ||
            player.videoWidth === 0 ||
            player.videoHeight === 0 ||
            !browserMissedQuarterTurn(player, orientation)
        ) {
            setVideoStyle(undefined);
            return;
        }

        const scale = Math.min(
            stage.clientWidth / orientation.unrotatedHeight,
            stage.clientHeight / orientation.unrotatedWidth
        );

        setVideoStyle({
            inset: "auto",
            top: "50%",
            left: "50%",
            width: orientation.unrotatedWidth * scale,
            height: orientation.unrotatedHeight * scale,
            objectFit: "fill",
            transform:
                `translate(-50%, -50%) rotate(${orientation.rotation}deg)`,
        });
    }, [orientation, playerRef, stageRef]);

    useEffect(() => {
        setOrientation(null);
        setVideoStyle(undefined);

        if (!playbackURL || !isAndroidBrowser()) return;

        let cancelled = false;

        void import("mediabunny").then(async ({
            ALL_FORMATS,
            Input,
            UrlSource,
        }) => {
            const input = new Input({
                source: new UrlSource(playbackURL),
                formats: ALL_FORMATS,
            });

            try {
                const videoTrack = await input.getPrimaryVideoTrack();
                if (!videoTrack || cancelled) return;

                const [rotation, unrotatedWidth, unrotatedHeight] =
                    await Promise.all([
                        videoTrack.getRotation(),
                        videoTrack.getSquarePixelWidth(),
                        videoTrack.getSquarePixelHeight(),
                    ]);

                if (!cancelled) {
                    setOrientation({
                        rotation,
                        unrotatedWidth,
                        unrotatedHeight,
                    });
                }
            } catch {
                // Native playback remains available if metadata inspection fails.
            } finally {
                input.dispose();
            }
        });

        return () => {
            cancelled = true;
        };
    }, [playbackURL]);

    useEffect(() => {
        updateVideoOrientation();

        const stage = stageRef.current;
        if (!stage) return;

        const resizeObserver = new ResizeObserver(
            updateVideoOrientation
        );
        resizeObserver.observe(stage);

        return () => resizeObserver.disconnect();
    }, [stageRef, updateVideoOrientation]);

    return {
        videoStyle,
        updateVideoOrientation,
    };
}
