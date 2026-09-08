import { RabbitmqError } from "../common/errors";

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const bounded = new Promise<T>((resolve, reject) => {
    timer = setTimeout(
      () => reject(new RabbitmqError("timeout", `${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    promise.then(resolve, reject);
  });
  return bounded.finally(() => {
    if (timer) clearTimeout(timer);
  });
}
