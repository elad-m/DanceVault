import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { configureAuthentication } from "./auth/authentication";
import { AuthenticationGate } from "./components/AuthenticationGate";
import App from "./App";
import "./styles.css";

configureAuthentication();
createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <AuthenticationGate>
            <App />
        </AuthenticationGate>
    </StrictMode>
);
