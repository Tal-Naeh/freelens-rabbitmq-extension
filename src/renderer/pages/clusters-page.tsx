import { Renderer } from "@freelensapp/extensions";
import { useMemo } from "react";
import { EmptyState, ErrorPanel, LoadingState, PageShell, SearchBox, Toolbar } from "../components/page-shell";
import { matchesQuery } from "../format";
import { usePageParam } from "../hooks";
import { RABBITMQ_PAGE_IDS } from "../navigation";
import { useTargetPage } from "./page-deps";

import type { DiscoveredRabbitmqInfo } from "../../common/ipc";
import type { PageDeps, Param } from "./page-deps";

export interface ClustersPageProps extends PageDeps {
  params?: { query: Param };
}

function credentialLabel(target: DiscoveredRabbitmqInfo): string {
  const hint = target.credentialHint;
  switch (hint.kind) {
    case "operator-default-user":
      return `Secret ${hint.secret.name} (operator default user)`;
    case "secret":
      return `Secret ${hint.secret.name}`;
    case "guess":
      return `default user "${hint.username}" (guess)`;
    case "none":
      return "none discovered — manual";
  }
}

function readiness(target: DiscoveredRabbitmqInfo): { label: string; tone: "ok" | "warning" | "" } {
  const ready = target.conditions?.find((c) => c.type === "AllReplicasReady");
  if (ready)
    return ready.status === "True"
      ? { label: "All replicas ready", tone: "ok" }
      : { label: "Not all replicas ready", tone: "warning" };
  if (target.readyReplicas !== undefined && target.replicas !== undefined) {
    return target.readyReplicas >= target.replicas
      ? { label: `${target.readyReplicas}/${target.replicas} ready`, tone: "ok" }
      : { label: `${target.readyReplicas}/${target.replicas} ready`, tone: "warning" };
  }
  return { label: "", tone: "" };
}

export function ClustersPage(props: ClustersPageProps) {
  const page = useTargetPage(props, undefined);
  const [query, setQuery] = usePageParam(props.params?.query);
  const { discovery, targets, rediscover } = page.selection;
  const filtered = useMemo(
    () => targets.filter((t) => matchesQuery(query, t.name, t.namespace, t.provider, t.serviceName)),
    [targets, query],
  );

  return (
    <PageShell
      title="RabbitMQ clusters"
      subtitle="Auto-discovered from RabbitmqCluster resources and Services exposing the Management API"
      actions={<Renderer.Component.Button plain label="Rediscover" onClick={rediscover} disabled={discovery.loading} />}
    >
      <Toolbar>
        <SearchBox value={query} onChange={setQuery} placeholder="Filter by name, namespace, provider…" />
        <span className="RmqToolbarRight">
          {discovery.loading ? "Scanning…" : `${filtered.length} of ${targets.length} cluster(s)`}
        </span>
      </Toolbar>

      {discovery.error ? <ErrorPanel error={discovery.error} onRetry={rediscover} /> : null}
      {discovery.loading && targets.length === 0 ? <LoadingState label="Scanning the cluster for RabbitMQ…" /> : null}

      {!discovery.loading && !discovery.error && targets.length === 0 ? (
        <EmptyState icon="search_off" title="No RabbitMQ found in this cluster">
          <p>
            Discovery looks for <code>RabbitmqCluster</code> resources (RabbitMQ Cluster Operator) and for Services
            exposing port <code>15672</code>/<code>15671</code> next to an AMQP port. Make sure the management plugin is
            enabled.
          </p>
        </EmptyState>
      ) : null}

      <div className="RmqGrid2">
        {filtered.map((t) => {
          const ready = readiness(t);
          return (
            <section key={t.targetId} className="RmqPanel RmqClusterCard">
              <div className="RmqClusterHead">
                <div className="RmqClusterTitle">
                  <Renderer.Component.Icon material="mail" small />
                  <span className="RmqClusterName" title={`${t.namespace}/${t.name}`}>
                    {t.namespace}/{t.name}
                  </span>
                </div>
                <Renderer.Component.Button
                  primary
                  label="Open"
                  onClick={() => props.navigate(RABBITMQ_PAGE_IDS.overview, { target: t.targetId })}
                />
              </div>
              <div className="RmqClusterTags">
                <span className="RmqTag">{t.provider}</span>
                {ready.label ? <span className={`RmqTag ${ready.tone}`.trim()}>{ready.label}</span> : null}
                {t.version ? <span className="RmqTag">v{t.version}</span> : null}
              </div>
              <dl className="RmqClusterFacts">
                <div>
                  <dt>Replicas</dt>
                  <dd>{t.replicas ?? "?"}</dd>
                </div>
                <div>
                  <dt>Management</dt>
                  <dd>
                    {String(t.managementPort)}
                    {t.managementTls ? " (TLS)" : ""}
                  </dd>
                </div>
                <div>
                  <dt>AMQP</dt>
                  <dd>
                    {t.amqpPort ?? "?"}
                    {t.amqpTls ? " (TLS)" : ""}
                  </dd>
                </div>
                <div>
                  <dt>Service</dt>
                  <dd title={t.serviceName}>{t.serviceName ?? "—"}</dd>
                </div>
                <div className="RmqFactWide">
                  <dt>Credentials</dt>
                  <dd title={credentialLabel(t)}>{credentialLabel(t)}</dd>
                </div>
              </dl>
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}
