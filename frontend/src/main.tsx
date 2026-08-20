import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { configureAuthentication } from "./auth/authentication";
import { AuthenticationGate } from "./components/AuthenticationGate";
import App from "./App";
import "./styles.css";

const LegalPage = lazy(async () => {
    const module = await import("./components/LegalPage");
    return { default: module.LegalPage };
});
const pathname = window.location.pathname.replace(/\/$/, "") || "/";
const isPublicLegalPage = pathname === "/privacy" || pathname === "/terms";

if (!isPublicLegalPage) {
    configureAuthentication();
}

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        {isPublicLegalPage ? (
            <Suspense
                fallback={
                    <main className="authentication-screen">
                        Loading document...
                    </main>
                }
            >
                <LegalPage />
            </Suspense>
        ) : (
            <AuthenticationGate>
                <App />
            </AuthenticationGate>
        )}
    </StrictMode>
);
