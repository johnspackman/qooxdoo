qx.Class.define("qx.tool.worker.WorkerServerApi", {
  extend: qx.core.Object,
  implement: [qx.tool.worker.IWorkerServerApi],

  members: {
    /**
     * Called to shutdown the node worker.
     */
    async shutdown() {
      await qx.tool.worker.WorkerServer.shutdown();
    }
  }
});
