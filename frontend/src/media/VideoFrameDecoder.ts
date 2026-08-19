import {
    ALL_FORMATS,
    CanvasSink,
    Input,
    UrlSource,
    type WrappedCanvas,
} from "mediabunny";

export type DecodedVideoFrame = WrappedCanvas;

export class VideoFrameDecoder {
    readonly #input: Input<UrlSource>;
    readonly #sink: CanvasSink;

    private constructor(
        input: Input<UrlSource>,
        sink: CanvasSink
    ) {
        this.#input = input;
        this.#sink = sink;
    }

    static async create(playbackURL: string): Promise<VideoFrameDecoder> {
        const input = new Input({
            source: new UrlSource(playbackURL),
            formats: ALL_FORMATS,
        });

        try {
            const videoTrack = await input.getPrimaryVideoTrack();
            if (!videoTrack) {
                throw new Error("This file does not contain a video track");
            }

            const hasVideoDecoder =
                typeof globalThis.VideoDecoder !== "undefined";
            if (!hasVideoDecoder) {
                throw new Error(
                    globalThis.isSecureContext
                        ? "This browser does not provide frame decoding"
                        : "Frame decoding requires HTTPS on this device"
                );
            }

            if (!(await videoTrack.canDecode())) {
                const codec = await videoTrack.getCodecParameterString();
                throw new Error(
                    `This browser cannot decode ${codec ?? "this video codec"} frame by frame`
                );
            }

            return new VideoFrameDecoder(
                input,
                new CanvasSink(videoTrack, {
                    width: 960,
                    height: 540,
                    fit: "contain",
                    poolSize: 2,
                })
            );
        } catch (error) {
            input.dispose();
            throw error;
        }
    }

    async getFrameAt(timestampSeconds: number): Promise<DecodedVideoFrame> {
        const frame = await this.#sink.getCanvas(timestampSeconds);
        if (!frame) {
            throw new Error("No video frame exists at this position");
        }

        return frame;
    }

    dispose(): void {
        this.#input.dispose();
    }
}
