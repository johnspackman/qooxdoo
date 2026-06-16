const { Worker, isMainThread, parentPort } = require("worker_threads");
const os = require("os");

qx.Class.define("qx.tool.worker.WorkerServer", {
  extend: qx.core.Object,

  construct() {
    super();
    this.__apisByApiName = {};
    if (qx.tool.worker.WorkerServer.__instance) {
      throw new Error("WorkerServer is a singleton and an instance already exists");
    }
    qx.tool.worker.WorkerServer.__instance = this;
  },

  members: {
    /** @type{Object<String, qx.core.Object>} list of API instances by name */
    __apisByApiName: null,

    /**
     * Called to start the worker server and listen for messages from the main thread.
     * This should only be called once, and only in a Worker thread.
     */
    start() {
      if (isMainThread) {
        throw new Error("qx.tool.worker.WorkerServer can only be used in a Worker thread");
      }

      parentPort.on("message", msg => this.__onMessage(msg));
      parentPort.postMessage({ type: "ready" });
    },

    /**
     * Handles messages from the main thread
     *
     * @param {*} msg The message from the main thread
     */
    __onMessage(msg) {
      if (msg.type === "callMethod") {
        let api = this.getApi(msg.apiName);
        let result = undefined;
        try {
          result = api[msg.methodName].apply(api, msg.args);
        } catch (error) {
          parentPort.postMessage({ type: "methodReturn", uuid: msg.uuid, error: error.message });
          return;
        }

        if (result instanceof Promise) {
          result
            .then(resolvedResult => {
              parentPort.postMessage({ type: "methodReturn", uuid: msg.uuid, result: resolvedResult });
            })
            .catch(error => {
              parentPort.postMessage({ type: "methodReturn", uuid: msg.uuid, error: error.message });
            });
        } else {
          parentPort.postMessage({ type: "methodReturn", uuid: msg.uuid, result: result });
        }
      }
    },

    /**
     * Returns an API instance for the given API name.  If the API instance does not exist, it will be created and cached.
     *
     * @param {String} apiName The name of the API class to get an instance of
     * @returns {qx.core.Object} An instance of the API class
     */
    getApi(apiName) {
      if (typeof apiName == "object" && typeof apiName.name == "string") {
        apiName = qx.tool.worker.AbstractClientApi.getApiNameFromInterface(apiName);
      }
      let api = this.__apisByApiName[apiName];
      if (!api) {
        let clazz = qx.Class.getByName(apiName);
        api = new clazz(this);
        this.__apisByApiName[apiName] = api;
      }
      return api;
    }
  },

  statics: {
    /** @type {qx.tool.worker.WorkerServer?} the singleton instance */
    __instance: null,

    /** @type{qx.tool.worker.WorkerServer?} Returns the singleton instance of the WorkerServer for this Worker thread */
    getThisServerInstance() {
      return qx.tool.worker.WorkerServer.__instance;
    },

    /**
     * Called to initialise as a worker; if this returns true, then this is a worker thread and the WorkerServer has been started.
     * If it returns false, then this is the main thread and the WorkerServer has not been started.
     *
     * This should be called from the `main` function in your node application, before any other code, and if it returns true
     * then you should return from the main function.
     */
    async initialise() {
      if (isMainThread) {
        return false;
      }
      let workerServer = new qx.tool.worker.WorkerServer();
      await workerServer.start();
      qx.tool.worker.WorkerServer.__promiseShutdown = new qx.Promise();
      return await qx.tool.worker.WorkerServer.__promiseShutdown;
    },

    /**
     * Shuts down the WorkerServer - anything awaiting on the initialise method will be resolved.
     */
    shutdown() {
      qx.tool.worker.WorkerServer.__promiseShutdown.resolve(true);
    }
  }
});
