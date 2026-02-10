qx.Interface.define("qx.tool.compiler.ICompilerInterface", {
  events: {
    /**
     * Fired when all applications have been made
     */
    made: "qx.event.type.Event",
    making: "qx.event.type.Event",
    /**
     * @type {string} application name
     */
    writtenApplication: "qx.event.type.Data",
  },
  members: {
    /**
     * Starts the compilation process
     * @param {qx.tool.compiler.Compiler.CompilerData} data 
     */
    async start(data) {
    },

    /**
     * Stops the compilation process
     */
    async stop() {

    },

    /**
     * @returns {Promise<Object[]>}
     */
    async getMakers() {

    }
  }
});