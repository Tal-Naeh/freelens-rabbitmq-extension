import { useCallback, useEffect, useMemo, useState } from "react";
import { useResource } from "../hooks";

import type { DiscoveredRabbitmqInfo } from "../../common/ipc";
import type { ResourceState } from "../hooks";

/** Discovery result cache shared by every page in a renderer session (per Kubernetes cluster). */
export class TargetCache {
  private readonly entries = new Map<string, Promise<DiscoveredRabbitmqInfo[]>>();

  load(
    clusterKey: string,
    loader: () => Promise<DiscoveredRabbitmqInfo[]>,
    force = false,
  ): Promise<DiscoveredRabbitmqInfo[]> {
    if (force) this.entries.delete(clusterKey);
    let entry = this.entries.get(clusterKey);
    if (!entry) {
      entry = loader().catch((err) => {
        this.entries.delete(clusterKey);
        throw err;
      });
      this.entries.set(clusterKey, entry);
    }
    return entry;
  }

  invalidate(clusterKey?: string): void {
    if (clusterKey) this.entries.delete(clusterKey);
    else this.entries.clear();
  }
}

export interface TargetSelection {
  discovery: ResourceState<DiscoveredRabbitmqInfo[]>;
  targets: DiscoveredRabbitmqInfo[];
  selected?: DiscoveredRabbitmqInfo;
  select: (targetId: string) => void;
  rediscover: () => void;
}

/**
 * Resolve the page's selected target from the `target` URL param (falling back to the first
 * discovered target) and expose discovery state for the selector.
 */
export function useTargetSelection(
  clusterKey: string,
  cache: TargetCache,
  discover: () => Promise<DiscoveredRabbitmqInfo[]>,
  targetParam: string,
  setTargetParam: (id: string) => void,
): TargetSelection {
  const [force, setForce] = useState(false);
  const discovery = useResource(`discovery:${clusterKey}`, () => cache.load(clusterKey, discover, force));
  const targets = useMemo(() => discovery.data ?? [], [discovery.data]);
  const selected = useMemo(() => targets.find((t) => t.targetId === targetParam) ?? targets[0], [targets, targetParam]);

  // Keep the URL in sync when we fell back to the first target.
  useEffect(() => {
    if (selected && selected.targetId !== targetParam) setTargetParam(selected.targetId);
  }, [selected, targetParam, setTargetParam]);

  const rediscover = useCallback(() => {
    setForce(true);
    cache.invalidate(clusterKey);
    discovery.reload();
  }, [cache, clusterKey, discovery.reload]);

  return { discovery, targets, selected, select: setTargetParam, rediscover };
}
