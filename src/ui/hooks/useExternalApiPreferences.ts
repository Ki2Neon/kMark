import { useCallback, useEffect, useMemo, useState } from "react";
import { createTauriExternalApiGateway } from "../../adapters/tauri/tauriExternalApiGateway";
import {
  type ExternalApiPreferences,
  type ExternalApiStatus,
} from "../../application/externalApi/externalApiPorts";

export function useExternalApiPreferences() {
  const gateway = useMemo(createTauriExternalApiGateway, []);
  const available = gateway.isSupported();
  const [preferences, setPreferences] = useState<ExternalApiPreferences | null>(null);
  const [status, setStatus] = useState<ExternalApiStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!available) {
      return;
    }
    setStatus(await gateway.getStatus());
  }, [available, gateway]);

  useEffect(() => {
    if (!available) {
      return;
    }
    let disposed = false;
    void Promise.all([gateway.getPreferences(), gateway.getStatus()])
      .then(([nextPreferences, nextStatus]) => {
        if (!disposed) {
          setPreferences(nextPreferences);
          setStatus(nextStatus);
        }
      })
      .catch((loadError) => {
        if (!disposed) {
          setError(errorMessage(loadError));
        }
      });
    return () => {
      disposed = true;
    };
  }, [available, gateway]);

  const persist = useCallback(async (next: ExternalApiPreferences) => {
    setIsSaving(true);
    setError(null);
    try {
      const saved = await gateway.setPreferences(next);
      setPreferences(saved);
      await refreshStatus();
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }, [gateway, refreshStatus]);

  const setEnabled = useCallback((enabled: boolean) => {
    if (preferences !== null) {
      void persist({ ...preferences, enabled });
    }
  }, [persist, preferences]);

  const addRoot = useCallback(async () => {
    if (preferences === null) {
      return;
    }
    try {
      const root = await gateway.pickRoot();
      if (root === null || preferences.roots.some((candidate) => candidate.id === root.id)) {
        return;
      }
      await persist({ ...preferences, roots: [...preferences.roots, root] });
    } catch (pickError) {
      setError(errorMessage(pickError));
    }
  }, [gateway, persist, preferences]);

  const removeRoot = useCallback((rootId: string) => {
    if (preferences !== null) {
      void persist({
        ...preferences,
        roots: preferences.roots.filter((root) => root.id !== rootId),
      });
    }
  }, [persist, preferences]);

  return {
    addRoot,
    available,
    error,
    isSaving,
    preferences,
    removeRoot,
    setEnabled,
    status,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : "外部API設定を更新できませんでした。";
}
