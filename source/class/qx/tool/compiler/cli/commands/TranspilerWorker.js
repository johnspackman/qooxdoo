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
 * @typedef {Object} SourceInfo
 * @property {string} classname
 * @property {string} filename Absolute path of source file
 * @property {string} source The source code itself
 *
 * @typedef {Object} CompilationContext
 * @property {number} metaTimestamp
 * @property {SharedArrayBuffer} metaData Serialized MetaDatabase
 * @property {Object} classFileConfig Serialized instance of qx.tool.compiler.ClassFileConfig, using toNativeObject()
 * 
 */
const workerpool = require("workerpool");
const { isMainThread, threadId } = require("worker_threads");

qx.Class.define("qx.tool.cli.commands.TranspilerWorker", {
  extend: qx.tool.cli.commands.Command,
  statics: {
    getYargsCommand() {
      return {
        command: "transpiler-worker"
      };
    }
  },
  members: {
    /**
     * @type {qx.tool.compiler.meta.MetaDatabase?}
     */
    __metaDb: null,
    /**
     * @type {number?}
     */
    __metaTimestamp: null,
    /**
     * @type {qx.tool.compiler.ClassFileConfig?}
     */
    __classFileConfig: null,

    /**
     * @override
     */
    async process() {
      if (isMainThread) {
        console.error("The transpiler worker command is not supposed to be run by the user. It is used by the compiler internally.");
        process.exitCode = 1;
        return;
      }

      workerpool.worker({
        /**
         * @param {SourceInfo} sourceInfo
         * @param {CompilationContext} context
         * @returns {qx.tool.compiler.ClassFile.CompileResult}
         */
        translate(sourceInfo, context) {
          //We check if the meta database has changed by comparing timestamps
          //For optimization reasons, we only re-create the meta database if it has changed
          if (context.metaTimestamp !== this.__metaTimestamp) {
            this.__metaDb = qx.tool.compiler.meta.MetaDatabase.deserialize(context.metaData);
            this.__metaTimestamp = context.metaTimestamp;
          }

          if (!this.__classFileConfig) {
            //assume classFileConfig will never change during program's lifetime
            this.__classFileConfig = qx.tool.compiler.ClassFileConfig.deserialize(context.classFileConfig);
          }
          let cf = new qx.tool.compiler.ClassFile(this.__metaDb, this.__classFileConfig, sourceInfo.classname);
          let result = cf.compile(sourceInfo.source, sourceInfo.filename);
          return result;
        }
      });
      await new Promise(() => {}); //hang until process quits
    }
  }
});
