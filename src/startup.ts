export interface YazioLoginProbe {
  getUser(): Promise<unknown>;
}

/** Verify credentials before exposing an MCP transport. */
export async function verifyYazioLogin(api: YazioLoginProbe): Promise<void> {
  try {
    await api.getUser();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`YAZIO login failed: ${message}`);
  }
}
