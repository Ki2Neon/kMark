import {
  isSupportedExternalLink as isSupportedInfraExternalLink,
  openExternalLink as openInfraExternalLink,
} from "../../infra/externalLink";

export function isSupportedExternalLink(url: string): boolean {
  return isSupportedInfraExternalLink(url);
}

export function openExternalLink(url: string): Promise<void> {
  return openInfraExternalLink(url);
}
