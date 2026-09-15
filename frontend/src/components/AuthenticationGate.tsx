import {
    Film,
    LoaderCircle,
    LogIn,
    LogOut,
    RefreshCw,
} from "lucide-react";
import {
    type ReactNode,
    useEffect,
    useState,
} from "react";
import { Hub } from "aws-amplify/utils";
import {
    isUserAuthenticated,
    startSignIn,
    signOutUser,
} from "../auth/authentication";
import {
    acceptLegalPolicies,
    getLegalAcceptanceStatus,
    type LegalPolicyVersions,
} from "../api";
import { runtime } from "../runtime";
import { LegalAcceptanceScreen } from "./LegalAcceptanceScreen";

type AuthenticationStatus =
    | "checking"
    | "acceptance-error"
    | "acceptance-required"
    | "authenticated"
    | "unauthenticated";

type AuthenticationGateProperties = {
    children: ReactNode;
};

export function AuthenticationGate({
    children,
}: AuthenticationGateProperties) {
    const [status, setStatus] =
        useState<AuthenticationStatus>("checking");
    const [error, setError] = useState<string | null>(null);
    const [currentVersions, setCurrentVersions] =
        useState<LegalPolicyVersions | null>(null);
    const [accepting, setAccepting] = useState(false);
    const [authenticationCheck, setAuthenticationCheck] = useState(0);

    useEffect(() => {
        let isMounted = true;

        async function refreshAuthenticationStatus() {
            const isAuthenticated = await isUserAuthenticated();

            if (!isMounted) {
                return;
            }

            if (
                isAuthenticated &&
                window.location.pathname === "/auth/callback"
            ) {
                window.history.replaceState({}, "", "/practice");
            }

            if (!isAuthenticated) {
                setStatus("unauthenticated");
                return;
            }

            if (runtime.environment === "local") {
                setStatus("authenticated");
                return;
            }

            try {
                const legalStatus =
                    await getLegalAcceptanceStatus();

                if (!isMounted) return;

                setCurrentVersions(legalStatus.currentVersions);
                setStatus(
                    legalStatus.required
                        ? "acceptance-required"
                        : "authenticated"
                );
            } catch {
                if (!isMounted) return;
                setError("Could not check the current legal policies");
                setStatus("acceptance-error");
            }
        }

        const stopListening = Hub.listen(
            "auth",
            ({ payload }) => {
                switch (payload.event) {
                    case "signedIn":
                    case "signInWithRedirect":
                        void refreshAuthenticationStatus();
                        break;
                    case "signedOut":
                        setStatus("unauthenticated");
                        break;
                    case "signInWithRedirect_failure":
                        setError("Cognito sign-in failed");
                        setStatus("unauthenticated");
                        break;
                }
            }
        );

        void refreshAuthenticationStatus();

        return () => {
            isMounted = false;
            stopListening();
        };
    }, [authenticationCheck]);

    async function handleAcceptLegalPolicies() {
        if (!currentVersions) return;

        setAccepting(true);
        setError(null);

        try {
            await acceptLegalPolicies(currentVersions);
            setStatus("authenticated");
        } catch {
            setError("Could not save your acceptance. Please try again.");
        } finally {
            setAccepting(false);
        }
    }

    async function handleAcceptanceSignOut() {
        setError(null);
        try {
            await signOutUser();
        } catch {
            setError("Could not sign out");
        }
    }

    if (status === "checking") {
        return (
            <main className="authentication-screen">
                <div className="authentication-loading" aria-label="Checking sign-in status">
                    <span className="authentication-brand-mark">
                        <Film size={22} />
                    </span>
                    <LoaderCircle className="authentication-spinner" />
                </div>
            </main>
        );
    }

    if (status === "unauthenticated") {
        return (
            <main className="authentication-screen">
                <section className="authentication-panel">
                    <div className="authentication-brand">
                        <span className="authentication-brand-mark">
                            <Film size={24} />
                        </span>
                        <strong>DanceVault</strong>
                    </div>
                    <div className="authentication-copy">
                        <span>Private video practice</span>
                        <h1>Sign in to DanceVault</h1>
                        <p>
                            Access your videos, segments, and practice queue.
                        </p>
                    </div>

                    <button
                        type="button"
                        className="primary-button authentication-sign-in"
                        onClick={() => {
                            setError(null);
                            void startSignIn().catch(() => {
                                setError("Could not start sign-in");
                            });
                        }}
                    >
                        <LogIn size={18} />
                        Sign in
                    </button>

                    {error && <p role="alert">{error}</p>}

                    <nav className="authentication-legal" aria-label="Legal">
                        <a href="/privacy">Privacy Notice</a>
                        <a href="/terms">Terms of Use</a>
                    </nav>
                </section>
            </main>
        );
    }

    if (status === "acceptance-required" && currentVersions) {
        return (
            <LegalAcceptanceScreen
                versions={currentVersions}
                accepting={accepting}
                error={error}
                onAccept={handleAcceptLegalPolicies}
                onSignOut={handleAcceptanceSignOut}
            />
        );
    }

    if (status === "acceptance-error") {
        return (
            <main className="authentication-screen">
                <section className="authentication-panel">
                    <span className="authentication-brand-mark">
                        <Film size={24} />
                    </span>
                    <div className="authentication-copy">
                        <span>Account check unavailable</span>
                        <h1>Could not open DanceVault</h1>
                        <p role="alert">{error}</p>
                    </div>
                    <div className="legal-acceptance-actions">
                        <button
                            type="button"
                            className="secondary-button"
                            onClick={() => void handleAcceptanceSignOut()}
                        >
                            <LogOut size={16} />
                            Sign out
                        </button>
                        <button
                            type="button"
                            className="primary-button"
                            onClick={() => {
                                setError(null);
                                setStatus("checking");
                                setAuthenticationCheck((value) => value + 1);
                            }}
                        >
                            <RefreshCw size={16} />
                            Try again
                        </button>
                    </div>
                </section>
            </main>
        );
    }

    return children;
}
