export type QueueKey = {
  timeMs: number;
  sequence: number;
  agentId: string;
};

export type QueueItem<T> = QueueKey & {
  payload: T;
};

/** Sort key for the shared timeline: time, then sequence, then agent id. */
export function compareQueueKeys(a: QueueKey, b: QueueKey): number {
  if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
  if (a.sequence !== b.sequence) return a.sequence - b.sequence;
  if (a.agentId < b.agentId) return -1;
  if (a.agentId > b.agentId) return 1;
  return 0;
}

export class EventQueue<T> {
  private items: QueueItem<T>[] = [];

  push(item: QueueItem<T>): void {
    this.items.push(item);
    this.items.sort(compareQueueKeys);
  }

  peek(): QueueItem<T> | undefined {
    return this.items[0];
  }

  pop(): QueueItem<T> | undefined {
    return this.items.shift();
  }

  get length(): number {
    return this.items.length;
  }
}
