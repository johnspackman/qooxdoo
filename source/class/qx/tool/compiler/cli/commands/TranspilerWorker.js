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
 * @property {string} makerId
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
     * Map of the hashcode of the maker to its class file config
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
           * @returns {qx.tool.compiler.ClassFile.CompileResult}
           */
          transpile(sourceInfo) {
            let start = Date.now();
            if (!this.__initialStart) {
              this.__initialStart = start;
            }
            let { classname, outputFilename, sourceFilename, makerId } = sourceInfo;
            let classFileConfig = this.__classFileConfigs[makerId];

            let source = fs.readFileSync(sourceFilename, "utf8");

            let cf = new qx.tool.compiler.ClassFile(this.__metaDb, classFileConfig, classname);
            let compiled = cf.compile(source, sourceFilename);

            let mappingUrl;
            if (classFileConfig.applicationTypes.includes("browser")) {
              mappingUrl = path.basename(sourceFilename) + ".map?dt=" + Date.now();
            } else {
              mappingUrl = sourceFilename + ".map";
            }

            fs.mkdirSync(path.dirname(outputFilename), { recursive: true });
            if (compiled) {
              fs.writeFileSync(outputFilename, compiled.code + "\n\n//# sourceMappingURL=" + mappingUrl, "utf8");
              fs.writeFileSync(outputFilename + ".map", JSON.stringify(compiled.map, null, 2), "utf8");
            }
            let jsonFilename = outputFilename.replace(/\.js$/, ".json");
            fs.writeFileSync(jsonFilename, JSON.stringify(compiled.dbClassInfo, null, 2), "utf8");
            let end = Date.now();
            this.__stats += `${start - this.__initialStart}-${end - this.__initialStart},`;
            return { dbClassInfo: compiled.dbClassInfo };
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
