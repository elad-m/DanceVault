export type Difficulty = "easy" | "medium" | "hard" | "very_hard";

export type Confidence = "low" | "medium" | "high";

export type PracticePriority = "low" | "medium" | "high";

export const difficultySchema = {
    type: "string",
    enum: ["easy", "medium", "hard", "very_hard"],
} as const;

export const confidenceSchema = {
    type: "string",
    enum: ["low", "medium", "high"],
} as const;

export const practicePrioritySchema = {
    type: "string",
    enum: ["low", "medium", "high"],
} as const;
