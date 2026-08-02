export type AppEnvironment = "local" | "dev";

function getAppEnvironment(): AppEnvironment {
    const viteMode = import.meta.env.MODE;

    if (viteMode === "local-development") { // because "local" is a reserved word in Vite, we use "local-development" as the mode for local development
        return "local";
    }

    if (viteMode === "dev") {
        return "dev";
    }

    throw new Error(
        "Vite mode must be local-development or dev"
    );
}

function getAPIBaseURL(
    environment: AppEnvironment
): string {
    if (environment === "local") {
        return "/api";
    }

    const apiBaseURL =
        import.meta.env.VITE_API_BASE_URL;

    if (!apiBaseURL) {
        throw new Error(
            "VITE_API_BASE_URL is not configured"
        );
    }

    return apiBaseURL;
}

const environment = getAppEnvironment();

export const runtime: {
    environment: AppEnvironment;
    apiBaseURL: string;
} = {
    environment,
    apiBaseURL: getAPIBaseURL(environment),
};
