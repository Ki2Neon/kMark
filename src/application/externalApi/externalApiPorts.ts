export type ExternalApiPreferences = {
  readonly enabled: boolean;
};

export type ExternalApiStatus = {
  readonly enabled: boolean;
  readonly instanceId: string;
  readonly endpoint: string | null;
};

export type ExternalProposalReview = {
  readonly proposalId: string;
  readonly sessionId: string | null;
  readonly kind: string;
  readonly status: string;
  readonly fileName: string;
  readonly unifiedDiff: string;
};

export type ExternalApiGateway = {
  isSupported(): boolean;
  getPreferences(): Promise<ExternalApiPreferences>;
  setPreferences(preferences: ExternalApiPreferences): Promise<ExternalApiPreferences>;
  getStatus(): Promise<ExternalApiStatus>;
  getPendingProposals(): Promise<readonly ExternalProposalReview[]>;
  listenForProposal(callback: () => void): Promise<() => void>;
  acceptProposal(proposalId: string): Promise<void>;
  rejectProposal(proposalId: string): Promise<void>;
};
