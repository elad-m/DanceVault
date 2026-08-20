import { Film, LoaderCircle, LogIn } from "lucide-react";
import {
    type ReactNode,
    useEffect,
    useState,
} from "react";
import { Hub } from "aws-amplify/utils";
import {
    isUserAuthenticated,
    startSignIn,
} from "../auth/authentication";

type AuthenticationStatus =
    | "checking"
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

            setStatus(
                isAuthenticated
                    ? "authenticated"
                    : "unauthenticated"
            );
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
    }, []);

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

    return children;
}
