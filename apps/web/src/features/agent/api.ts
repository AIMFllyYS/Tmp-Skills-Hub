import { apiRequest } from "@/lib/api-client";
import type { AgentModel } from "./types.js";

export interface AgentModelsResponse {
  ok: true;
  command: "agent-models";
  defaultModel: string;
  models: AgentModel[];
}

export async function fetchAgentModels(): Promise<AgentModelsResponse> {
  return apiRequest<AgentModelsResponse>("/api/agent/models");
}
