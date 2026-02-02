const { Worker, isMainThread, parentPort } = require("worker_threads");
const os = require("os");

/**
 * This class manages a pool of workers which can transpile source files using Babel.
 *
 * @typedef {Object} WorkerTracker
 * @property {Worker} worker
 * @property {CallTracker|null} pendingCall
 * @property {boolean} ready
 *
 * @typedef {Object} CallTracker
 * @property {string} methodName
 * @property {Array} args
 * @property {{resolve: Function, reject: Function}} promise
 */
qx.Class.define("qx.tool.compiler.TranspilerPool", {
  extend: qx.core.Object,
  construct(size) {
    super();
    this.__poolSize = size || os.cpus().length - 1;
    this.__workers = [];
    this.__queue = [];

    for (let i = 0; i < this.__poolSize; i++) {
      this.__createWorker();
    }
  },

  destruct() {
    for (let workerTracker of this.__workers) {
      workerTracker.worker.terminate();
    }
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
      let worker = new Worker(process.argv[1], {
        argv: ["transpiler-worker"]
      });

      let tracker = {
        worker,
        pendingCall: null,
        ready: false
      };

      this.__workers.push(tracker);

      worker.addListener("message", msg => {
        if (msg.type === "methodReturn") {
          tracker.pendingCall.promise.resolve(msg.result);
          tracker.pendingCall = null;
          tracker.ready = true;
          this.__checkQueue(tracker);
        } else if (msg.type === "ready") {
          tracker.ready = true;
          this.__checkQueue(tracker);
          if (++this.__nReady === this.__workers.length) {
            this.fireEvent("allReady");
          }
        }
      });
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
      if (this.__queue.length === 0) return;
      let workers = worker ? [worker] : this.__workers;
      for (let workerTracker of workers) {
        if (this.__queue.length === 0) return;
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
