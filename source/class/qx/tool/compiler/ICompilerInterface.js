/**
 * @typedef {Object} CompilerData A large POJO containing all the options for the compiler.
 * It contains properties for all the command line options for `qx.tool.compiler.cli.commands.Compile`,
 * such as `watch`, `nJobs` as well as the following:
 * @property {Object} config The compiler configuration from the compiler API
 */
qx.Interface.define("qx.tool.compiler.ICompilerInterface", {
  events: {
    /**
     * Fired when the compiler starts making applications after compiling the classes.
     */
    making: "qx.event.type.Event",
    /**
     * Fired when all applications have been made
     */
    made: "qx.event.type.Event",
    /**
     * @type {string} application name
     */
    writtenApplication: "qx.event.type.Data",
  },
  members: {
    /**
     * Starts the compilation process
     * @param {qx.tool.compiler.ICompilerInterface.CompilerData} data
     */
    async start(data) {
    },

    /**
     * Stops the compilation process
     */
    async stop() {

    },

    /**
     * @returns {Promise<Object[]>} Information about the makers, in native Objects
     * 
     */
    async getMakers() {

    }
  }
});