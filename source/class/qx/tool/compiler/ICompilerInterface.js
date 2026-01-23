qx.Interface.define("qx.tool.compiler.ICompilerInterface", {
  events: {
    /**
     * Fired when all applications have been made
     */
    allAppsMade: "qx.event.type.Event"
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