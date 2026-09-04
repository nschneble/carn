// SPDX-License-Identifier: AGPL-3.0-or-later

type Waiter = { resolve: () => void };

export class Semaphore {
  #free: number;
  #waiting: Waiter[] = [];

  constructor(limit: number) {
    this.#free = limit;
  }

  acquire(signal?: AbortSignal): Promise<void> {
    if (this.#free > 0) {
      this.#free -= 1;
      return Promise.resolve();
    }

    if (signal?.aborted === true) {
      return Promise.reject(signal.reason);
    }

    return new Promise((resolve, reject) => {
      const waiter: Waiter = { resolve };
      this.#waiting.push(waiter);

      signal?.addEventListener(
        "abort",
        () => {
          const index = this.#waiting.indexOf(waiter);
          if (index === -1) {
            return;
          }

          this.#waiting.splice(index, 1);
          reject(signal.reason);
        },
        { once: true },
      );
    });
  }

  release(): void {
    const next = this.#waiting.shift();
    if (next === undefined) {
      this.#free += 1;
      return;
    }

    next.resolve();
  }
}
