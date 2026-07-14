export type AppEnvironment = "local" | "dev";

function readAppEnvironment(): AppEnvironment {
    const value = process.env.APP_ENVIRONMENT ?? "local";

    if (value !== "local" && value !== "dev") {
        throw new Error("APP_ENVIRONMENT must be local or dev");
    }

    return value;
}

export const runtime: {
    environment: AppEnvironment;
} = {
    environment: readAppEnvironment(),
};

export function setRuntimeForTest(input: { environment: AppEnvironment }) {
    runtime.environment = input.environment;
}

export function resetRuntimeForTest() {
    runtime.environment = readAppEnvironment();
}
