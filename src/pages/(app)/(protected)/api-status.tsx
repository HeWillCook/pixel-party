import { useAsyncResource, integration } from 'deepspace'

interface IntegrationCatalog {
  integrations?: Record<string, unknown> | unknown[]
}

export default function ApiStatusPage() {
  const catalog = useAsyncResource<IntegrationCatalog>(
    async (signal) => {
      const res = await integration.get<IntegrationCatalog>('', undefined, { signal })
      if (!res.success) throw new Error(res.error)
      return res.data ?? {}
    },
    [],
    { retry: 1, retryDelayMs: 500 },
  )

  const integrationCount = Array.isArray(catalog.data?.integrations)
    ? catalog.data.integrations.length
    : Object.keys(catalog.data?.integrations ?? {}).length

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div>
        <h1 className="pp-word text-3xl uppercase">API status</h1>
        <p className="mt-1 text-base text-muted-foreground">
          A scaffolded pattern for server-backed resources with explicit loading, error, empty, and retry states.
        </p>
      </div>

      {catalog.error && catalog.data && (
        <div className="pp-wood-panel px-4 py-3">
          <p className="text-lg uppercase text-[var(--sunset-1)]">Showing the last loaded catalog</p>
          <p className="mt-1 text-base text-muted-foreground">{catalog.error}</p>
        </div>
      )}

      {catalog.status === 'loading' ? (
        <div className="pp-wood-panel flex items-center justify-center gap-3 p-8 text-base text-muted-foreground">
          <span className="h-4 w-4 animate-spin border-2 border-current border-t-transparent" aria-hidden />
          Loading integration catalog...
        </div>
      ) : catalog.status === 'error' ? (
        <div className="pp-wood-panel px-4 py-3">
          <p className="text-lg uppercase text-destructive">Could not load API data</p>
          <div className="mt-1 flex flex-col gap-3 text-base text-muted-foreground">
            <span>{catalog.error}</span>
            {catalog.retryCount > 0 && (
              <span>Retried {catalog.retryCount} time{catalog.retryCount === 1 ? '' : 's'} automatically.</span>
            )}
            <button
              type="button"
              onClick={catalog.reload}
              className="pp-btn w-fit px-4 py-1.5 text-base uppercase"
            >
              Retry
            </button>
          </div>
        </div>
      ) : integrationCount === 0 ? (
        <div className="pp-wood-panel flex flex-col items-center justify-center px-4 py-16 text-center">
          <h3 className="text-2xl uppercase text-[var(--sunset-2)]">No integrations available</h3>
          <p className="mt-2 max-w-sm text-base text-muted-foreground">
            The catalog loaded, but it did not return any integration definitions.
          </p>
        </div>
      ) : (
        <section className="pp-wood-panel p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl uppercase text-[var(--sunset-2)]">Integration catalog ready</h2>
              <p className="mt-1 text-base text-muted-foreground">
                {integrationCount} integration{integrationCount === 1 ? '' : 's'} available.
              </p>
            </div>
            {catalog.isRefreshing && (
              <span className="pp-chip px-2.5 py-0.5 text-sm uppercase">
                Refreshing
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={catalog.reload}
            className="pp-btn mt-4 px-4 py-1.5 text-base uppercase"
          >
            Refresh
          </button>
        </section>
      )}
    </div>
  )
}
