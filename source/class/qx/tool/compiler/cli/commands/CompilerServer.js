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

qx.Class.define("qx.tool.compiler.cli.commands.CompilerServer", {
  extend: qx.tool.compiler.cli.Command,
  statics: {
    async createCliCommand(clazz = this) {
      let cmd = await qx.tool.compiler.cli.Command.createCliCommand(clazz);
      cmd.set({
        name: "compiler-server"
      });
      return cmd;
    }
  },
  members: {
    /**
     * @override
     */
    async process() {
      let compilerClassName = qx.core.Environment.get("qx.tool.compiler.Compiler.compilerClass") || "qx.tool.compiler.Compiler";
      let CompilerClass = qx.Class.getByName(compilerClassName);

      if (!CompilerClass) {
        throw new Error("Could not find compiler class: " + compilerClassName);
      }

      if (!qx.Class.isSubClassOf(CompilerClass, qx.tool.compiler.Compiler)) {
        throw new Error("Compiler class " + compilerClassName + " is not a subclass of qx.tool.compiler.Compiler");
      }

      let compiler = new CompilerClass();
      let events = Object.keys(qx.tool.compiler.ICompilerInterface.$$events);
      
      for (let event of events) {
        compiler.addListener(event, evt => {
          process.send({ type: "event", event: event, data: evt.getData?.() });
        });
      }
        
      process.on("message", async msg => {
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
