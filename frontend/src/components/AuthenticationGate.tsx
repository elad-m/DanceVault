import { LoaderCircle, LogIn } from "lucide-react";
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
                <LoaderCircle className="authentication-spinner" />
            </main>
        );
    }

    if (status === "unauthenticated") {
        return (
            <main className="authentication-screen">
                <section className="authentication-panel">
                    <h1>DanceVault</h1>
                    <p>Sign in to access your videos and practice queue.</p>

                    <button
                        type="button"
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
                </section>
            </main>
        );
    }

    return children;
}