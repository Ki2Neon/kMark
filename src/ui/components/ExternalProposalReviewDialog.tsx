import { useCallback, useEffect, useMemo, useState } from "react";
import { createTauriExternalApiGateway } from "../../adapters/tauri/tauriExternalApiGateway";
import { type ExternalProposalReview } from "../../application/externalApi/externalApiPorts";

export function ExternalProposalReviewDialog() {
  const gateway = useMemo(createTauriExternalApiGateway, []);
  const [proposals, setProposals] = useState<readonly ExternalProposalReview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    if (!gateway.isSupported()) {
      return;
    }
    setProposals(await gateway.getPendingProposals());
  }, [gateway]);

  useEffect(() => {
    if (!gateway.isSupported()) {
      return;
    }
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void refresh().catch((loadError) => {
      if (!disposed) {
        setError(toMessage(loadError));
      }
    });
    void gateway.listenForProposal(() => {
      void refresh().catch((loadError) => setError(toMessage(loadError)));
    }).then((dispose) => {
      if (disposed) {
        dispose();
      } else {
        unlisten = dispose;
      }
    }).catch((listenError) => setError(toMessage(listenError)));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [gateway, refresh]);

  const submit = async (operation: () => Promise<unknown>) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await operation();
    } catch (submitError) {
      setError(toMessage(submitError));
    } finally {
      await refresh().catch((refreshError) => setError(toMessage(refreshError)));
      setIsSubmitting(false);
    }
  };

  const proposal = proposals[0] ?? null;
  if (proposal === null) {
    return null;
  }

  return (
    <div className="external-proposal__overlay">
      <section className="external-proposal" role="dialog" aria-modal="true" aria-label="外部変更案">
        <header className="external-proposal__header">
          <div>
            <h2>外部変更案</h2>
            <p>{proposal.fileName} · {proposalKindLabel(proposal.kind)}</p>
          </div>
          {proposals.length > 1 ? <span>{proposals.length}件</span> : null}
        </header>
        <pre className="external-proposal__diff" aria-label="変更差分">
          {proposal.unifiedDiff.length === 0
            ? <span className="external-proposal__diff-meta">本文変更なし</span>
            : proposal.unifiedDiff.split("\n").map((line, index) => (
              <span key={`${index}-${line}`} className={diffLineClass(line)}>{line}{"\n"}</span>
            ))}
        </pre>
        {error !== null ? <p className="external-proposal__error" role="alert">{error}</p> : null}
        <footer className="external-proposal__actions">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => void submit(() => gateway.rejectProposal(proposal.proposalId))}
          >
            却下
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => void submit(() => gateway.acceptProposal(proposal.proposalId))}
          >
            適用
          </button>
        </footer>
      </section>
    </div>
  );
}

function proposalKindLabel(kind: string): string {
  switch (kind) {
    case "create_document": return "新規Document";
    case "rename_document": return "名前変更";
    case "delete_document": return "削除";
    default: return "本文変更";
  }
}

function diffLineClass(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) {
    return "external-proposal__diff-meta";
  }
  if (line.startsWith("+")) {
    return "external-proposal__diff-add";
  }
  if (line.startsWith("-")) {
    return "external-proposal__diff-delete";
  }
  return "external-proposal__diff-context";
}

function toMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : "外部変更案を処理できませんでした。";
}
