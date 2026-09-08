import pkg from "../../package.json";

/** Extension version, shown in the UI so a stale renderer bundle is obvious. */
export const EXTENSION_VERSION: string = (pkg as { version: string }).version;
