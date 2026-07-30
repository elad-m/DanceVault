import awsLambdaFastify from "@fastify/aws-lambda";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app";

export function createLambdaHandler(app: FastifyInstance) {
    return awsLambdaFastify<APIGatewayProxyEventV2>(app, {
        decorateRequest: false,
    });
}

type DanceVaultLambdaHandler = ReturnType<
    typeof createLambdaHandler
>;

let liveHandler: DanceVaultLambdaHandler | undefined;

export const handler: DanceVaultLambdaHandler = async (
    event,
    context
) => {
    liveHandler ??= createLambdaHandler(buildApp());

    return liveHandler(event, context);
};