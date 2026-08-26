// SPDX-License-Identifier: AGPL-3.0-or-later

export class Semaphore {
  #free: number;
  #waiting: (() => void)[] = [];

  constructor(limit: number) {
    this.#free = limit;
  }

  acquire(): Promise<void> {
    if (this.#free > 0) {
      this.#free -= 1;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.#waiting.push(resolve);
    });
  }

  release(): void {
    const next = this.#waiting.shift();
    if (next === undefined) {
      this.#free += 1;
      return;
    }

    next();
  }
}
