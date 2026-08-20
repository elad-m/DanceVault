import { ArrowLeft, Film } from "lucide-react";
import { useEffect } from "react";
import {
    privacyNoticeHTML,
    termsOfUseHTML,
} from "../generated-legal/legalDocuments";

type LegalDocument = {
    html: string;
    title: string;
};

const legalDocumentsByPath: Record<string, LegalDocument> = {
    "/privacy": {
        html: privacyNoticeHTML,
        title: "Privacy Notice",
    },
    "/terms": {
        html: termsOfUseHTML,
        title: "Terms of Use",
    },
};

export function LegalPage() {
    const pathname = window.location.pathname.replace(/\/$/, "") || "/";
    const document = legalDocumentsByPath[pathname];

    useEffect(() => {
        if (!document) return;

        const previousTitle = window.document.title;
        window.document.title = `${document.title} | DanceVault`;

        return () => {
            window.document.title = previousTitle;
        };
    }, [document]);

    if (!document) return null;

    return (
        <main className="legal-screen">
            <header className="legal-header">
                <a className="legal-brand" href="/">
                    <span className="brand-mark" aria-hidden="true">
                        <Film size={20} />
                    </span>
                    <span>
                        <strong>DanceVault</strong>
                        <small>{document.title}</small>
                    </span>
                </a>
                <a className="secondary-button" href="/">
                    <ArrowLeft size={16} />
                    Back to app
                </a>
            </header>

            <article
                className="legal-document"
                // The Markdown source is trusted, version-controlled app content.
                dangerouslySetInnerHTML={{ __html: document.html }}
            />

            <footer className="legal-footer">
                <a href="/privacy">Privacy Notice</a>
                <a href="/terms">Terms of Use</a>
            </footer>
        </main>
    );
}
