const { Worker, isMainThread, parentPort } = require("worker_threads");
const os = require("os");

/**
 * This class manages a pool of workers which can transpile source files using Babel.
 *
 * @typedef {Object} WorkerTracker
 * @property {Worker} worker
 * @property {CallTracker|null} pendingCall
 * @property {boolean} ready
 * @property {number} replayIdx Index into __replayMessages during replay; advances to length when done
 * @property {boolean} replayDone True once all replay messages have been processed
 *
 * @typedef {Object} CallTracker
 * @property {string} methodName
 * @property {Array} args
 * @property {{resolve: Function, reject: Function}} promise
 */
qx.Class.define("qx.tool.compiler.TranspilerPool", {
  extend: qx.core.Object,
  /**
   *
   * @param {?number} size Number of workers in the pool. Defaults to number of CPU cores / 2
   * @param {?Function} workerFactory Optional factory function that creates a worker. Defaults to creating a Worker from the current process.
   */
  construct(size, workerFactory) {
    super();
    this.__poolSize = size || Math.round(os.cpus().length / 2);
    this.__workerFactory = workerFactory || (() => new Worker(process.argv[1], { argv: ["transpiler-worker"] }));
    this.__workers = [];
    this.__queue = [];
    this.__replayMessages = [];
  },

  destruct() {
    for (let workerTracker of this.__workers) {
      if (workerTracker.pendingCall) {
        this.warn("Terminating worker with pending call");
      }
      workerTracker.worker.terminate();
    }
    this.__workers = [];
    if (this.__queue.length > 0) {
      this.warn("There are still queued calls in the transpiler pool on destruction");
    }
    this.__queue = [];
  },
  
  events: {
    allReady: "qx.event.type.Event"
  },
  members: {
    /**
     * Number of ready workers
     */
    __nReady: 0,
    /**
     * @type {WorkerTracker[]}
     * Array of workers in the pool
     */
    __workers: null,

    /**
     * @type {number}
     */
    __poolSize: 0,

    /**
     * @type {CallTracker[]}
     * Calls which were requested but are waiting for an available worker
     */
    __queue: null,

    /**
     * @type {Array<{methodName: string, args: Array}>}
     * callAll messages to replay on lazily-created workers before they handle real work
     */
    __replayMessages: null,

    /**
     * Calls a remote method on an available worker.
     * Queues the call if no worker is available.
     * @param {string} methodName
     * @param {Array} args
     * @returns {Promise} A promise which resolves with the method's return value
     */
    callMethod(methodName, args) {
      args ??= [];
      return new Promise((resolve, reject) => {
        let tracker = {
          methodName: methodName,
          args: args,
          promise: { resolve, reject }
        };
        this.__queue.push(tracker);
        if (this.__workers.length < this.__poolSize && !this.__workers.some(w => w.ready)) {
          this.__createWorker();
        }
        this.__checkQueue();
      });
    },

    /**
     *
     * @param {string} methodName
     * @param {Array?} args
     * @returns {Promise<Array<*>>} Resolves when all workers have returned. Resolves to an array of return values.
     */
    callAll(methodName, args) {
      args ??= [];
      this.__replayMessages.push({ methodName, args });
      let promises = [];
      for (let workerTracker of this.__workers) {
        if (!workerTracker.ready) {
          throw new Error("Cannot call `callAll` when some are busy.");
        }
        let promise = new Promise((resolve, reject) => {
          let callTracker = {
            methodName: methodName,
            args: args,
            promise: { resolve, reject }
          };
          this.__callMethodOnWorker(callTracker, workerTracker);
        });
        promises.push(promise);
      }
      return Promise.all(promises);
    },

    /**
     * Creates a new worker and adds it to the pool
     */
    __createWorker() {
      let worker = this.__workerFactory();

      let tracker = {
        worker,
        pendingCall: null,
        ready: false,
        replayIdx: -1,
        replayDone: false
      };

      this.__workers.push(tracker);

      worker.addListener("message", msg => {
        if (msg.type === "methodReturn") {
          if (!tracker.replayDone) {
            tracker.replayIdx++;
            this.__sendNextReplay(tracker);
          } else {
            tracker.pendingCall.promise.resolve(msg.result);
            tracker.pendingCall = null;
            tracker.ready = true;
            this.__checkQueue(tracker);
          }
        } else if (msg.type === "ready") {
          tracker.replayIdx = 0;
          this.__sendNextReplay(tracker);
        }
      });
    },

    /**
     * Sends the next replay message to a worker, or marks it ready if all replays are done.
     * @param {WorkerTracker} tracker
     */
    __sendNextReplay(tracker) {
      if (tracker.replayIdx < this.__replayMessages.length) {
        let msg = this.__replayMessages[tracker.replayIdx];
        tracker.worker.postMessage({ type: "callMethod", methodName: msg.methodName, args: msg.args });
      } else {
        tracker.replayDone = true;
        tracker.ready = true;
        this.__checkQueue(tracker);
        if (++this.__nReady === this.__workers.length) {
          this.fireEvent("allReady");
        }
      }
    },

    /**
     *
     * @returns {Promise} A promise which resolved when all workers become ready
     */
    waitForAllReady() {
      if (this.__nReady === this.__workers.length) {
        return Promise.resolve();
      }

      return new Promise(resolve => {
        this.addListenerOnce("allReady", resolve);
      });
    },

    /**
     *
     * @param {CallTracker} callTracker
     * @param {WorkerTracker} workerTracker
     */
    __callMethodOnWorker(callTracker, workerTracker) {
      workerTracker.worker.postMessage({ type: "callMethod", methodName: callTracker.methodName, args: callTracker.args });
      workerTracker.pendingCall = callTracker;
      workerTracker.ready = false;
    },

    /**
     * Hands out queued method calls to available workers
     * @param {Object} worker Optional specific worker to check
     */
    __checkQueue(worker = null) {
      if (this.__queue.length === 0) {
        return;
      }
      let workers = worker ? [worker] : this.__workers;
      for (let workerTracker of workers) {
        if (this.__queue.length === 0) {
          return;
        }
        if (workerTracker.ready) {
          let callTracker = this.__queue.shift();
          this.__callMethodOnWorker(callTracker, workerTracker);
        }
      }
    }
  },
  statics: {
    /**
     * Registers an object which contains the methods to be called remotely from the main thread.
     * @param {Object} obj
     */
    register(obj) {
      if (isMainThread) {
        throw new Error("qx.tool.compiler.TranspilerPool.registerMethods() must be called in a Worker thread");
      }

      parentPort.on("message", async msg => {
        if (msg.type === "callMethod") {
          let result = await obj[msg.methodName].apply(obj, msg.args);
          parentPort.postMessage({ type: "methodReturn", result: result });
        }
      });

      parentPort.postMessage({ type: "ready" });
    }
  }
});
