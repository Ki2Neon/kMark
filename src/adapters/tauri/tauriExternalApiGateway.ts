import { type ExternalApiGateway } from "../../application/externalApi/externalApiPorts";
import {
  acceptExternalProposal,
  getExternalApiPreferences,
  getExternalApiStatus,
  getPendingExternalProposals,
  listenForExternalProposalCreated,
  pickExternalApiRoot,
  rejectExternalProposal,
  setExternalApiPreferences,
} from "../../infra/externalApi";
import { isTauri } from "../../runtime/runtime";

export function createTauriExternalApiGateway(): ExternalApiGateway {
  return {
    isSupported: isTauri,
    getPreferences: getExternalApiPreferences,
    setPreferences: setExternalApiPreferences,
    getStatus: getExternalApiStatus,
    pickRoot: pickExternalApiRoot,
    getPendingProposals: async () => (await getPendingExternalProposals()).proposals,
    listenForProposal: listenForExternalProposalCreated,
    acceptProposal: async (proposalId) => {
      await acceptExternalProposal(proposalId);
    },
    rejectProposal: rejectExternalProposal,
  };
}
