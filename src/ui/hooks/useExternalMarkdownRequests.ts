import { useEffect, useEffectEvent } from "react";
import {
  selectMostRecentExternalMarkdownDocument,
  type ExternalMarkdownDocument,
} from "../../domain/externalMarkdownDocument";

type UseExternalMarkdownRequestsOptions = {
  readonly clearPendingExternalDocuments: () => Promise<void>;
  readonly confirmDiscard: () => boolean;
  readonly onBeforeLoadExternalDocument: () => void;
  readonly onLoadExternalDocument: (document: ExternalMarkdownDocument) => void;
  readonly subscribeToExternalDocumentRequests: (callback: () => void) => Promise<() => void>;
  readonly takePendingExternalDocuments: () => Promise<readonly ExternalMarkdownDocument[]>;
};

export function useExternalMarkdownRequests({
  clearPendingExternalDocuments,
  confirmDiscard,
  onBeforeLoadExternalDocument,
  onLoadExternalDocument,
  subscribeToExternalDocumentRequests,
  takePendingExternalDocuments,
}: UseExternalMarkdownRequestsOptions) {
  const loadPendingExternalDocumentEvent = useEffectEvent(async (requiresDiscardConfirmation: boolean) => {
    if (requiresDiscardConfirmation && !confirmDiscard()) {
      await clearPendingExternalDocuments();
      return;
    }

    const pendingDocuments = await takePendingExternalDocuments();
    const nextDocument = selectMostRecentExternalMarkdownDocument(pendingDocuments);

    if (nextDocument === null) {
      return;
    }

    onBeforeLoadExternalDocument();
    onLoadExternalDocument(nextDocument);
  });

  useEffect(() => {
    void loadPendingExternalDocumentEvent(false);
  }, [loadPendingExternalDocumentEvent]);

  useEffect(() => {
    let isDisposed = false;
    let unlisten: (() => void) | null = null;

    void subscribeToExternalDocumentRequests(() => {
      void loadPendingExternalDocumentEvent(true);
    }).then((nextUnlisten) => {
      if (isDisposed) {
        nextUnlisten();
        return;
      }

      unlisten = nextUnlisten;
    });

    return () => {
      isDisposed = true;
      unlisten?.();
    };
  }, [loadPendingExternalDocumentEvent, subscribeToExternalDocumentRequests]);
}
