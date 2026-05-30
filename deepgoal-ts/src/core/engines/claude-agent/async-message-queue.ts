interface QueueWaiter<T> {
  resolve(value: IteratorResult<T>): void;
  reject(error: Error): void;
}

export class AsyncMessageQueue<T> implements AsyncIterable<T> {
  private readonly buffer: T[] = [];
  private readonly waiters: Array<QueueWaiter<T>> = [];
  private closed = false;
  private failure: Error | undefined;

  push(value: T): void {
    if (this.closed) {
      return;
    }
    const waiter = this.waiters.shift();
    if (waiter !== undefined) {
      waiter.resolve({ value, done: false });
      return;
    }
    this.buffer.push(value);
  }

  fail(error: Error): void {
    if (this.closed) {
      return;
    }
    this.failure = error;
    this.closed = true;
    while (this.waiters.length > 0) {
      this.waiters.shift()?.reject(error);
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    while (this.waiters.length > 0) {
      this.waiters.shift()?.resolve({ value: undefined as T, done: true });
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      const buffered = this.buffer.shift();
      if (buffered !== undefined) {
        yield buffered;
        continue;
      }

      if (this.failure !== undefined) {
        throw this.failure;
      }

      if (this.closed) {
        return;
      }

      const next = await new Promise<IteratorResult<T>>((resolve, reject) => {
        this.waiters.push({ resolve, reject });
      });
      if (next.done) {
        return;
      }
      yield next.value;
    }
  }
}
