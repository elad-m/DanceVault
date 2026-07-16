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

export const runtime: {
    environment: AppEnvironment;
} = {
    environment: getAppEnvironment(),
};