/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2026 Patryk Malinowski

   License:
     MIT: https://opensource.org/licenses/MIT
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * Patryk Malinowski (pmalinowski116@gmail.com)

************************************************************************ */
/**
 * This application runs in the compiler worker thread and creates an instance of ClassFile, which invokes Babel.
 *
 */

qx.Class.define("qx.tool.cli.commands.CompilerServer", {
  extend: qx.tool.cli.commands.Command,
  statics: {
    getYargsCommand() {
      return {
        command: "compiler-server"
      };
    }
  },
  members: {
    /**
     * @override
     */
    async process() {      
      await super.process();
      let compilerClassName = qx.core.Environment.get("qx.tool.compiler.Compiler.compilerClass") || "qx.tool.compiler.Compiler";
      let CompilerClass = qx.Class.getByName(compilerClassName);

      if (!CompilerClass) {
        throw new Error("Could not find compiler class: " + compilerClassName);
      }
      
      if (!qx.Class.isSubClassOf(CompilerClass, qx.tool.compiler.Compiler)) {
        throw new Error("Compiler class " + compilerClassName + " is not a subclass of qx.tool.compiler.Compiler");
      }

      let compiler = new CompilerClass();
      compiler.addListener("allAppsMade", () => {
        process.send({ type: "allAppsMade" });
      });

      process.on("message", async (msg) => {
        if (msg.type === "callMethod") {
          let error;
          let result = await Promise.resolve(compiler[msg.methodName](...msg.args)).catch(err => {
            error = err.message || String(err);
          });
          process.send({ type: "methodReturn", result, error, callId: msg.callId });
        } else {
          process.send({ type: "error", message: "Unknown command: " + msg.cmd });
        }
      });

      await new Promise(() => {}); //hang until process quits
    }
  }
});
