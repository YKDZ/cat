export interface PollResult {
  issueNumber: number;
  title: string;
  body: string;
  labels: string[];
  agentDefinition: string;
  agentProvider: string | null;
  agentModel: string | null;
  agentEffort: string | null;
  autoMerge: boolean;
}

export const pollIssues = async (
  repo: string,
  config: any,
  workspaceRoot: string,
): Promise<PollResult[]> => {
  return [];
};
