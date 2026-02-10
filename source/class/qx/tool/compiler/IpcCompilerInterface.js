/**
 * Interface for communicating with a compiler server process via IPC.
 */
qx.Class.define("qx.tool.compiler.IpcCompilerInterface", {
  implement: [qx.tool.compiler.ICompilerInterface],
  extend: qx.core.Object,

  /**
   * 
   * @param { import("child_process").ChildProcess} childProcess 
   */
  construct(childProcess) {
    super();
    this.__childProcess = childProcess;
    this.__childProcess.on("message", msg => {
      if (msg.type === "event") {
        if (msg.data !== undefined) {
          this.fireDataEvent(msg.event, msg.data);
        } else {
          this.fireEvent(msg.event);
        }
      }      
    });
  },
  events: {
    /** @override */
    made: "qx.event.type.Event",
    /** @override */
    making: "qx.event.type.Event",
    /** @override */
    writtenApplication: "qx.event.type.Data",
  },

  members: {
    /**
     * @type { import("child_process").ChildProcess}
     */
    __childProcess: null,
    __callId: 0,

    /**
     * 
     * @param {string} methodName 
     * @param {Array} args 
     * @returns {Promise<*>}
     */
    callMethod(methodName, args) {
      return new Promise((resolve, reject) => {
        const callId = ++this.__callId;
        const onMessage = msg => {
          if (msg.type === "methodReturn" && msg.callId === callId) {
            this.__childProcess.off("message", onMessage);
            if (msg.error) {
              reject(new Error(msg.error));
            } else {
              resolve(msg.result);
            }
          }
        };
        this.__childProcess.on("message", onMessage);
        this.__childProcess.send({ type: "callMethod", methodName, args, callId });
      });
    },
    /**
     * @override
     */
    async start(data) {
      return this.callMethod("start", [data]);
    },

    /**
     * @override
     */
    async stop() {
      return this.callMethod("stop", []);
    },

    /**
     * @override
     */
    async getMakers() {
      return this.callMethod("getMakers", []);
    }
  }
});