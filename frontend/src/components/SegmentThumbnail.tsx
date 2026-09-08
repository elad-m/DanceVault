import { ListChecks } from "lucide-react";
import { useEffect, useRef } from "react";

type SegmentThumbnailProps = {
    segmentId: string;
    thumbnailUrl: string | undefined;
    onVisible: (segmentId: string) => void;
    className?: string;
};

export function SegmentThumbnail({
    segmentId,
    thumbnailUrl,
    onVisible,
    className = "queue-thumbnail",
}: SegmentThumbnailProps) {
    const elementRef = useRef<HTMLSpanElement>(null);
    const requestedRef = useRef(false);

    useEffect(() => {
        if (thumbnailUrl || requestedRef.current) return;

        const element = elementRef.current;
        if (!element || !("IntersectionObserver" in window)) {
            requestedRef.current = true;
            onVisible(segmentId);
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (!entries.some((entry) => entry.isIntersecting)) return;
                requestedRef.current = true;
                onVisible(segmentId);
                observer.disconnect();
            },
            { rootMargin: "160px 0px" }
        );

        observer.observe(element);
        return () => observer.disconnect();
    }, [onVisible, segmentId, thumbnailUrl]);

    return (
        <span className={className} ref={elementRef}>
            {thumbnailUrl ? <img src={thumbnailUrl} alt="" /> : <ListChecks size={17} />}
        </span>
    );
}
