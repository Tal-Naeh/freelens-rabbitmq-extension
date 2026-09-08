import { Renderer } from "@freelensapp/extensions";
import { TargetCache } from "./components/target-selection";
import { RabbitmqIcon } from "./icon";
import { RabbitmqIpcRenderer } from "./ipc-client";
import { RABBITMQ_CLUSTER_MENU_MANIFEST, RABBITMQ_CLUSTER_PAGE_MANIFEST, type RabbitmqPageId } from "./navigation";
import { ClustersPage, type ClustersPageProps } from "./pages/clusters-page";
import { ConnectionsPage, type ConnectionsPageProps } from "./pages/connections-page";
import { ExchangesPage, type ExchangesPageProps } from "./pages/exchanges-page";
import { OverviewPage, type OverviewPageProps } from "./pages/overview-page";
import { QueuesPage, type QueuesPageProps } from "./pages/queues-page";
import { WriteModeStore } from "./write-mode-store";

import type { PageDeps } from "./pages/page-deps";

export default class RabbitmqExtensionRenderer extends Renderer.LensExtension {
  private readonly cache = new TargetCache();
  private readonly writeMode = new WriteModeStore((targetId, enabled) =>
    this.client.writeModeSet({ clusterId: this.clusterId, targetId, enabled }),
  );

  private get client(): RabbitmqIpcRenderer {
    return RabbitmqIpcRenderer.createInstance(this);
  }

  /** Id of the cluster this frame is showing, so Main queries the right connected cluster. */
  private get clusterId(): string | undefined {
    return Renderer.Catalog.getActiveCluster()?.id;
  }

  private get deps(): PageDeps {
    return {
      kubernetesClusterId: this.clusterId,
      client: this.client,
      cache: this.cache,
      writeMode: this.writeMode,
      navigate: (pageId: RabbitmqPageId, params?: Record<string, string>) => {
        void this.navigate(pageId, params);
      },
    };
  }

  clusterPages = [
    {
      ...RABBITMQ_CLUSTER_PAGE_MANIFEST[0],
      components: {
        Page: ({ params }: Pick<ClustersPageProps, "params">) => <ClustersPage {...this.deps} params={params} />,
      },
    },
    {
      ...RABBITMQ_CLUSTER_PAGE_MANIFEST[1],
      components: {
        Page: ({ params }: Pick<OverviewPageProps, "params">) => <OverviewPage {...this.deps} params={params} />,
      },
    },
    {
      ...RABBITMQ_CLUSTER_PAGE_MANIFEST[2],
      components: {
        Page: ({ params }: Pick<QueuesPageProps, "params">) => <QueuesPage {...this.deps} params={params} />,
      },
    },
    {
      ...RABBITMQ_CLUSTER_PAGE_MANIFEST[3],
      components: {
        Page: ({ params }: Pick<ExchangesPageProps, "params">) => <ExchangesPage {...this.deps} params={params} />,
      },
    },
    {
      ...RABBITMQ_CLUSTER_PAGE_MANIFEST[4],
      components: {
        Page: ({ params }: Pick<ConnectionsPageProps, "params">) => <ConnectionsPage {...this.deps} params={params} />,
      },
    },
  ];

  clusterPageMenus = RABBITMQ_CLUSTER_MENU_MANIFEST.map(({ pageId, ...menu }, index) => ({
    ...menu,
    target: { pageId },
    components: index === 0 ? { Icon: RabbitmqIcon } : {},
  }));
}
