import { useEffect, useState } from "react";

/**
 * Session-scoped Write Mode: which targets the user has explicitly armed for mutating
 * operations *in this renderer session*. Deliberately NOT persisted — every new Freelens
 * session starts read-only. Main keeps the authoritative gate; this mirrors it for the UI.
 */
export class WriteModeStore {
  private readonly enabled = new Set<string>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly sync: (targetId: string, enabled: boolean) => Promise<unknown>) {}

  get(targetId: string | undefined): boolean {
    return Boolean(targetId && this.enabled.has(targetId));
  }

  async set(targetId: string, enabled: boolean): Promise<void> {
    await this.sync(targetId, enabled);
    if (enabled) this.enabled.add(targetId);
    else this.enabled.delete(targetId);
    this.emit();
  }

  /** Called when a session is closed on the Main side (credentials changed, disconnect). */
  forget(targetId: string): void {
    if (this.enabled.delete(targetId)) this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export function useWriteMode(store: WriteModeStore, targetId: string | undefined): boolean {
  const [enabled, setEnabled] = useState(() => store.get(targetId));
  useEffect(() => {
    const update = () => setEnabled(store.get(targetId));
    update();
    return store.subscribe(update);
  }, [store, targetId]);
  return enabled;
}
