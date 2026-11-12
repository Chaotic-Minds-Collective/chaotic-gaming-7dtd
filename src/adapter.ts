export interface AdapterConfig {
  serverId: string;
  coreBaseUrl: string;
  serviceToken: string;
}

export interface ServerHeartbeat {
  serverId: string;
  game: "7dtd";
  serverVersion: string;
  adapterVersion: string;
  online: boolean;
  observedAt: string;
}

export interface GameAdapter {
  readonly game: "7dtd";
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<{ connected: boolean; checkedAt: string }>;
}
