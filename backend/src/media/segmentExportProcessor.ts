export type ProcessSegmentExportInput = {
    sourcePath: string;
    outputPath: string;
    startMilliseconds: number;
    endMilliseconds: number;
};

export type SegmentExportProcessor = {
    process(input: ProcessSegmentExportInput): Promise<void>;
};
