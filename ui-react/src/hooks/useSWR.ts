import useSWR, { mutate, useSWRConfig } from "swr";
export { mutate };

import { api } from "../api/client";
import type { SourceSummary, DataResponse } from "../types/config";

const CACHE_KEY = "sources-with-data";

const fetcher = async (key: string) => {
  // Map key to the corresponding API method
  switch (key) {
    case "sources":
      return api.getSources();
    case "views":
      return api.getViews();
    case "settings":
      return api.getSettings();
    case "integration-files":
      return api.listIntegrationFiles();
    case "integration-presets":
      return api.listIntegrationPresets();
    case "integration-metadata":
      return api.listIntegrationFileMetadata();
    default:
      // Handle parameterized keys, such as "source-data-{id}"
      if (key.startsWith("source-data-")) {
        const sourceId = key.replace("source-data-", "");
        return api.getSourceData(sourceId);
      }
      if (key.startsWith("integration-file-")) {
        const filename = key.replace("integration-file-", "");
        return api.getIntegrationFile(filename);
      }
      if (key.startsWith("integration-sources-")) {
        const filename = key.replace("integration-sources-", "");
        return api.getIntegrationSources(filename);
      }
      throw new Error(`Unknown key: ${key}`);
  }
};

// Fetcher that gets sources AND their data (with optimized fetching based on updated_at)
// cachedData is passed from the useSources hook via closure
const sourcesWithDataFetcher = async (
  cachedData?: { sources: SourceSummary[]; dataMap: Record<string, DataResponse> }
): Promise<{
  sources: SourceSummary[];
  dataMap: Record<string, DataResponse>;
}> => {
  const sourcesData = await api.getSources();

  // If cache is empty, fetch details for all sources
  if (!cachedData) {
    const dataPromises = sourcesData.map((s) =>
      api.getSourceData(s.id).then((data) => ({ id: s.id, data }))
    );
    const results = await Promise.all(dataPromises);

    const dataMap: Record<string, DataResponse> = {};
    results.forEach(({ id, data }) => {
      dataMap[id] = data;
    });

    return { sources: sourcesData, dataMap };
  }

  // Optimization: request only sources newer than cached updated_at
  const needsUpdate = (source: SourceSummary): boolean => {
    const cachedSourceData = cachedData.dataMap?.[source.id];
    if (!cachedSourceData) return true; // no cache, must fetch
    if (!source.updated_at) return true; // missing updated_at, always fetch
    if (!cachedSourceData.updated_at) return true; // cached item missing updated_at, always fetch
    return source.updated_at > cachedSourceData.updated_at; // compare updated_at
  };

  const sourcesToFetch = sourcesData.filter(needsUpdate);
  const sourcesNeedingNoFetch = sourcesData.filter((s) => !needsUpdate(s));

  // Fetch details for stale sources in parallel
  const dataPromises = sourcesToFetch.map((s) =>
    api.getSourceData(s.id).then((data) => ({ id: s.id, data }))
  );
  const results = await Promise.all(dataPromises);

  // Build next dataMap by merging cache and fresh results
  const dataMap: Record<string, DataResponse> = {};

  // Insert freshly fetched sources first
  results.forEach(({ id, data }) => {
    dataMap[id] = data;
  });

  // Then add unchanged sources from cache
  sourcesNeedingNoFetch.forEach((s) => {
    if (cachedData.dataMap?.[s.id]) {
      dataMap[s.id] = cachedData.dataMap[s.id];
    }
  });

  return { sources: sourcesData, dataMap };
};

// --- Dashboard Hooks ---

export function useSources() {
  const { cache } = useSWRConfig();

  // Use a getter so each fetcher run sees the latest cache
  const getCachedData = () =>
    cache.get(CACHE_KEY) as
      | { sources: SourceSummary[]; dataMap: Record<string, DataResponse> }
      | undefined;

  const { data, error, isLoading, mutate: mutateSources } = useSWR(
    CACHE_KEY,
    () => sourcesWithDataFetcher(getCachedData()),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
  return {
    sources: data?.sources ?? [],
    dataMap: data?.dataMap ?? {},
    isLoading,
    isError: error,
    mutateSources,
  };
}

export function useSourceData(sourceId: string) {
  const { data, error, isLoading } = useSWR(
    sourceId ? `source-data-${sourceId}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
  return {
    data: data ?? null,
    isLoading,
    isError: error,
  };
}

export function useViews() {
  const { data, error, isLoading, mutate: mutateViews } = useSWR(
    "views",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
  return {
    views: data ?? [],
    isLoading,
    isError: error,
    mutateViews,
  };
}

// --- Settings Hooks ---

export function useSettings() {
  const { data, error, isLoading, mutate: mutateSettings } = useSWR(
    "settings",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
  return {
    settings: data ?? null,
    isLoading,
    isError: error,
    mutateSettings,
  };
}

// --- Integrations Hooks ---

export function useIntegrationFiles() {
  const { data, error, isLoading, mutate: mutateFiles } = useSWR(
    "integration-files",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
  return {
    files: data ?? [],
    isLoading,
    isError: error,
    mutateFiles,
  };
}

export function useIntegrationPresets() {
  const { data, error, isLoading } = useSWR(
    "integration-presets",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
  return {
    presets: data ?? [],
    isLoading,
    isError: error,
  };
}

export function useIntegrationMetadata() {
  const { data, error, isLoading } = useSWR(
    "integration-metadata",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
  return {
    metadata: data ?? [],
    isLoading,
    isError: error,
  };
}

export function useIntegrationFile(filename: string) {
  const { data, error, isLoading } = useSWR(
    filename ? `integration-file-${filename}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
  return {
    file: data ?? null,
    isLoading,
    isError: error,
  };
}

export function useIntegrationSources(filename: string) {
  const { data, error, isLoading } = useSWR(
    filename ? `integration-sources-${filename}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
  return {
    sources: data ?? [],
    isLoading,
    isError: error,
  };
}

// --- Utility Functions ---

export async function invalidateSources() {
  mutate(CACHE_KEY);
}

// Optimistically update sources cache for immediate UI feedback
export async function optimisticUpdateSources(
  updateFn: (data: { sources: SourceSummary[]; dataMap: Record<string, DataResponse> }) => { sources: SourceSummary[]; dataMap: Record<string, DataResponse> }
) {
  mutate(
    CACHE_KEY,
    async (currentData) => {
      if (!currentData) return currentData;
      return updateFn(currentData);
    },
    false
  );
}

// Optimistically remove a source from cache
export function optimisticRemoveSource(sourceId: string) {
  optimisticUpdateSources((data) => ({
    sources: data.sources.filter((s) => s.id !== sourceId),
    dataMap: Object.fromEntries(
      Object.entries(data.dataMap).filter(([id]) => id !== sourceId)
    ),
  }));
}

// Optimistically update a source's status (e.g., for refresh)
export function optimisticUpdateSourceStatus(
  sourceId: string,
  status: SourceSummary["status"]
) {
  optimisticUpdateSources((data) => ({
    sources: data.sources.map((s) =>
      s.id === sourceId ? { ...s, status } : s
    ),
    dataMap: data.dataMap,
  }));
}

export async function invalidateViews() {
  mutate("views");
}

export async function invalidateSettings() {
  mutate("settings");
}

export async function invalidateIntegrationFiles() {
  mutate("integration-files");
}

export async function invalidateIntegrationMetadata() {
  mutate("integration-metadata");
}

export async function invalidateAll() {
  mutate((key) => typeof key === "string" && key.startsWith(""));
}
