import { openExternalLink as openInfraExternalLink } from "../../infra/externalLink";

export function openExternalLink(url: string): Promise<void> {
  return openInfraExternalLink(url);
}
