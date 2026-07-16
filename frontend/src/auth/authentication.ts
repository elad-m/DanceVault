import { Amplify } from "aws-amplify";
import {
    fetchAuthSession,
    signInWithRedirect,
    signOut,
} from "aws-amplify/auth";
import { runtime } from "../runtime";

export function configureAuthentication(): void {
    if (runtime.environment === "local") {
        return;
    }

    Amplify.configure({
        Auth: {
            Cognito: {
                userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
                userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
                loginWith: {
                    oauth: {
                        domain: import.meta.env.VITE_COGNITO_DOMAIN,
                        scopes: ["openid", "email"],
                        redirectSignIn: [
                            "http://localhost:5173/auth/callback",
                        ],
                        redirectSignOut: [
                            "http://localhost:5173/",
                        ],
                        responseType: "code",
                    },
                },
            },
        },
    });
}

export async function addAuthenticationHeaders(
    headers: Headers
): Promise<void> {
    if (runtime.environment === "local") {
        headers.set("x-user-id", "initial-user");
        return;
    }

    const session = await fetchAuthSession();
    const accessToken = session.tokens?.accessToken;

    if (!accessToken) {
        throw new Error("You are not signed in");
    }

    headers.set(
        "authorization",
        `Bearer ${accessToken.toString()}`
    );
}

export async function isUserAuthenticated(): Promise<boolean> {
    if (runtime.environment === "local") {
        return true;
    }

    try {
        const session = await fetchAuthSession();
        return session.tokens?.accessToken !== undefined;
    } catch {
        return false;
    }
}

export async function startSignIn(): Promise<void> {
    if (runtime.environment === "local") {
        return;
    }

    await signInWithRedirect();
}

export async function signOutUser(): Promise<void> {
    if (runtime.environment === "local") {
        return;
    }

    await signOut();
}
