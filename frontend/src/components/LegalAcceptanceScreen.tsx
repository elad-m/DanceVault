import { FileCheck2, LoaderCircle, LogOut } from "lucide-react";
import { useState } from "react";
import type { LegalPolicyVersions } from "../api";

type LegalAcceptanceScreenProperties = {
    versions: LegalPolicyVersions;
    accepting: boolean;
    error: string | null;
    onAccept: () => Promise<void>;
    onSignOut: () => Promise<void>;
};

export function LegalAcceptanceScreen({
    versions,
    accepting,
    error,
    onAccept,
    onSignOut,
}: LegalAcceptanceScreenProperties) {
    const [agreed, setAgreed] = useState(false);

    return (
        <main className="authentication-screen">
            <section className="legal-acceptance-panel">
                <span className="authentication-brand-mark">
                    <FileCheck2 size={24} />
                </span>

                <div className="legal-acceptance-copy">
                    <span>Before continuing</span>
                    <h1>Review the current policies</h1>
                    <p>
                        Read the <a href="/terms" target="_blank" rel="noreferrer">Terms of Use</a>{" "}
                        and <a href="/privacy" target="_blank" rel="noreferrer">Privacy Notice</a>.
                    </p>
                </div>

                <label className="legal-acceptance-check">
                    <input
                        type="checkbox"
                        checked={agreed}
                        onChange={(event) => setAgreed(event.target.checked)}
                        disabled={accepting}
                    />
                    <span>
                        I agree to the Terms of Use and acknowledge the
                        Privacy Notice.
                    </span>
                </label>

                <p className="legal-version-note">
                    Terms {versions.termsOfUse} | Privacy {versions.privacyNotice}
                </p>

                {error && <p className="legal-acceptance-error" role="alert">{error}</p>}

                <div className="legal-acceptance-actions">
                    <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void onSignOut()}
                        disabled={accepting}
                    >
                        <LogOut size={16} />
                        Sign out
                    </button>
                    <button
                        type="button"
                        className="primary-button"
                        onClick={() => void onAccept()}
                        disabled={!agreed || accepting}
                    >
                        {accepting && <LoaderCircle className="spin" size={16} />}
                        {accepting ? "Saving..." : "Agree and continue"}
                    </button>
                </div>
            </section>
        </main>
    );
}
