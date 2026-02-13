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

qx.Class.define("qx.tool.compiler.cli.commands.TranspilerWorker", {
  extend: qx.tool.compiler.cli.Command,
  statics: {
    async createCliCommand(clazz = this) {
      let cmd = await qx.tool.compiler.cli.Command.createCliCommand(clazz);
      cmd.set({
        name: "transpiler-worker"
      });
      return cmd;
    }
  },
  construct(...args) {
    super(...args);
    this.__metaDb = new qx.tool.compiler.meta.MetaDatabase();
  },
  members: {
    /**
     * String showing the ranges of times when this thread was compiling
     */
    __stats: "",
    /**
     * @type {qx.tool.compiler.meta.MetaDatabase}
     */
    __metaDb: null,
    /**
     * @type {number?}
     */
    __metaTimestamp: null,
    /**
     * Map of the hashcode of the maker to its related information (e.g. source transformer or class file config).
     * When the compiler initally starts, we pass in this data just once for optimization reasons.
     * Then each transpile call can look up its data because we may be compiling for different makers at once.
     * @type {Object.<string, qx.tool.compiler.Controller.MakerInfo>}
     */
    __infoByMaker: null,

    /**
     * @override
     */
    async process() {
      if (isMainThread) {
        console.error("The transpiler worker command is not supposed to be run by the user. It is used by the compiler internally.");
        process.exitCode = 1;
        return;
      }
      qx.tool.compiler.TranspilerPool.register(this);
      await new Promise(() => {}); //hang until process quits
    },

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
      let out = await qx.tool.compiler.Controller.transpile(sourceInfo, this.__infoByMaker[makerId], this.__metaDb);
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
      let newOne = qx.tool.compiler.meta.MetaDatabase.deserialize(serializedMetaData);
      this.__metaDb.move(newOne);
    },

    resetStats() {
      this.__stats = "";
      this.__initialStart = null;
    },

    /**
     * This function is called once when the worker starts up to give it information about the makers
     * such as their source transformers and class file configs.
     * When a worker is compiling a source file, it is just given the maker ID so that it can look up the correct info fast.
     * @param {Object<string, MakerInfoNative>} infoByMakerNative
     *
     * @typedef {Object} MakerInfoNative
     * @property {string} transformerClass
     * @property {Object} classFileConfig
     */
    async setMakerInfo(infoByMakerNative) {
      if (qx.core.Environment.get("qx.debug")) {
        if (this.__infoByMaker) {
          throw new Error("Maker info has already been set");
        }
      }
      let infoByMaker = (this.__infoByMaker = {});
      for (let key in infoByMakerNative) {
        let makerInfoNative = infoByMakerNative[key];
        let transformer = null;
        if (makerInfoNative.transformerClass) {
          let TransformerClass = qx.Class.getByName(makerInfoNative.transformerClass);
          if (!TransformerClass) {
            throw new Error("Could not find transformer class: " + makerInfoNative.transformerClass);
          }
          transformer = new TransformerClass();
          await transformer.init(this.__metaDb);
        }
        let thisMakerInfo = {
          transformer,
          classFileConfig: qx.tool.compiler.ClassFileConfig.deserialize(makerInfoNative.classFileConfig)
        };
        infoByMaker[key] = thisMakerInfo;
      }
    }
  }
});
