declare module "pusher" {
  interface PusherOptions {
    appId: string;
    key: string;
    secret: string;
    cluster: string;
    useTLS: boolean;
  }

  interface TriggerResult {
    event_id: string;
  }

  class Pusher {
    constructor(options: PusherOptions);
    trigger(channel: string, event: string, data: Record<string, unknown>): Promise<TriggerResult>;
    trigger(channels: string[], event: string, data: Record<string, unknown>): Promise<TriggerResult[]>;
  }

  export default Pusher;
}
