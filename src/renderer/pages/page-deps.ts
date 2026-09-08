import { useCallback, useMemo } from "react";
import { useTargetSelection } from "../components/target-selection";
import { usePageParam } from "../hooks";

import type { Renderer } from "@freelensapp/extensions";

import type { DiscoveredRabbitmqInfo, TargetRequest } from "../../common/ipc";
import type { TargetCache, TargetSelection } from "../components/target-selection";
import type { RabbitmqIpcRenderer } from "../ipc-client";
import type { RabbitmqPageId } from "../navigation";
import type { WriteModeStore } from "../write-mode-store";

/** Everything a page needs from the extension instance. */
export interface PageDeps {
  kubernetesClusterId?: string;
  client: RabbitmqIpcRenderer;
  cache: TargetCache;
  writeMode: WriteModeStore;
  navigate: (pageId: RabbitmqPageId, params?: Record<string, string>) => void;
}

export type Param = Renderer.Navigation.PageParam<string>;

export interface TargetPage {
  clusterKey: string;
  selection: TargetSelection;
  target?: DiscoveredRabbitmqInfo;
  /** Build a target-scoped IPC request. */
  request: <T extends object>(extra?: T) => TargetRequest & T;
}

/** Shared plumbing for every page that operates on one selected RabbitMQ target. */
export function useTargetPage(deps: PageDeps, targetParam: Param | undefined): TargetPage {
  const clusterKey = deps.kubernetesClusterId ?? "active";
  const [targetId, setTargetId] = usePageParam(targetParam);
  const discover = useCallback(
    () => deps.client.discover({ clusterId: deps.kubernetesClusterId }),
    [deps.client, deps.kubernetesClusterId],
  );
  const selection = useTargetSelection(clusterKey, deps.cache, discover, targetId, setTargetId);
  const target = selection.selected;
  const request = useMemo(
    () =>
      <T extends object>(extra?: T) =>
        ({
          clusterId: deps.kubernetesClusterId,
          target: target as DiscoveredRabbitmqInfo,
          ...(extra ?? {}),
        }) as TargetRequest & T,
    [deps.kubernetesClusterId, target],
  );
  return { clusterKey, selection, target, request };
}
