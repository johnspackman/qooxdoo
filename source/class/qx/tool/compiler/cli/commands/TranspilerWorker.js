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
 *
 *
 */
const { isMainThread, threadId } = require("worker_threads");
const fs = require("fs");
const path = require("path");

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
     * String showing the ranges of times when this thread was compiling
     */
    __stats: "",
    /**
     * @type {qx.tool.compiler.meta.MetaDatabase?}
     */
    __metaDb: null,
    /**
     * @type {number?}
     */
    __metaTimestamp: null,
    /**
     * Map of the hashcode of the maker to its class file config.
     * When the compiler initally starts, we pass in this data just once for optimization reasons.
     * Then each transpile call can look up its class file config because we may be compiling for different makers at once.
     * @type {Object<string, qx.tool.compiler.ClassFileConfig>}
     */
    __classFileConfigs: null,

    /**
     * @override
     */
    async process() {
      if (isMainThread) {
        console.error("The transpiler worker command is not supposed to be run by the user. It is used by the compiler internally.");
        process.exitCode = 1;
        return;
      }
      await super.process();

      qx.tool.compiler.TranspilerPool.registerMethods(
        {
          /**
           * @param {SourceInfo} sourceInfo
           * @param {string} makerId ID of the maker so that we can look up the correct class file config
           * @returns {qx.tool.compiler.ClassFile.CompileResult}
           */
          async transpile(sourceInfo, makerId) {
            let start = Date.now();
            if (!this.__initialStart) {
              this.__initialStart = start;
            }
            let out = await qx.tool.compiler.Controller.transpile(sourceInfo, this.__classFileConfigs[makerId], this.__metaDb);            
            let end = Date.now();
            this.__stats += `${start - this.__initialStart}-${end - this.__initialStart},`;
            return out;
          },

          getStats() {
            return {
              threadId: threadId,
              initialStart: this.__initialStart,
              stats: this.__stats
            };
          },
          /**
           *
           * @param {SharedArrayBuffer} serializedMetaData
           */
          updateClassMeta(serializedMetaData) {
            this.__metaDb = qx.tool.compiler.meta.MetaDatabase.deserialize(serializedMetaData);
          },

          resetStats() {
            this.__stats = "";
            this.__initialStart = null;
          },

          /**
           *
           * @param {Object<string, Object>} configs
           */
          setClassFileConfigs(configs) {
            this.__classFileConfigs = qx.lang.Object.map(configs, serialized => qx.tool.compiler.ClassFileConfig.deserialize(serialized));
          }
        },
        this
      );
      await new Promise(() => {}); //hang until process quits
    }
  }
});
