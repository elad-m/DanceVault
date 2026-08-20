import {
    EllipsisVertical,
    FileText,
    LogOut,
    ShieldCheck,
} from "lucide-react";
import { useEffect, useRef } from "react";

type AccountMenuProperties = {
    signedInUserLabel: string;
    onSignOut?: () => void;
};

export function AccountMenu({
    signedInUserLabel,
    onSignOut,
}: AccountMenuProperties) {
    const detailsRef = useRef<HTMLDetailsElement>(null);

    useEffect(() => {
        function closeForOutsideInteraction(event: PointerEvent) {
            if (
                detailsRef.current &&
                !detailsRef.current.contains(event.target as Node)
            ) {
                detailsRef.current.removeAttribute("open");
            }
        }

        function closeForEscape(event: KeyboardEvent) {
            if (event.key === "Escape") {
                detailsRef.current?.removeAttribute("open");
            }
        }

        document.addEventListener("pointerdown", closeForOutsideInteraction);
        document.addEventListener("keydown", closeForEscape);

        return () => {
            document.removeEventListener(
                "pointerdown",
                closeForOutsideInteraction
            );
            document.removeEventListener("keydown", closeForEscape);
        };
    }, []);

    function closeMenu() {
        detailsRef.current?.removeAttribute("open");
    }

    return (
        <details className="account-menu" ref={detailsRef}>
            <summary
                className="icon-button"
                aria-label="Open account menu"
                title="Account and legal"
            >
                <EllipsisVertical size={18} />
            </summary>
            <div className="account-menu-popover">
                <div className="account-menu-user">
                    <span>Signed in as</span>
                    <strong title={signedInUserLabel}>
                        {signedInUserLabel}
                    </strong>
                </div>
                <a
                    href="/privacy"
                    target="_blank"
                    rel="noreferrer"
                    onClick={closeMenu}
                >
                    <ShieldCheck size={16} />
                    Privacy Notice
                </a>
                <a
                    href="/terms"
                    target="_blank"
                    rel="noreferrer"
                    onClick={closeMenu}
                >
                    <FileText size={16} />
                    Terms of Use
                </a>
                {onSignOut && (
                    <button
                        type="button"
                        onClick={() => {
                            closeMenu();
                            onSignOut();
                        }}
                    >
                        <LogOut size={16} />
                        Sign out
                    </button>
                )}
            </div>
        </details>
    );
}
