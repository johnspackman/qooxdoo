qx.Interface.define("qx.tool.compiler.IClassTranspilerApi", {
  members: {
    async test() {},

    /**
     * Transpiles a class definition
     *
     * @typedef {Object} TranspileConfiguration Information regarding the source file to be compiled
     * @property {String} classname
     * @property {String} sourceFilename Absolute path of source file
     * @property {String} outputFilename Absolute path of output file
     * @property {String} manglePrefix The prefix used for mangling privates to make them distinct across different classes
     * @property {String} sourceTransformer the classname of the source transformer to use for this class, or null if no source transformer should be used
     * @property {Object} classFileConfig serialized version of `qx.tool.compiler.ClassFileConfig`
     *
     * @param {qx.tool.compiler.IClassTranspilerApi.TranspileConfiguration} transpileConfig
     * @returns {Promise<qx.tool.compiler.ClassFile.DbClassInfo>}
     */
    async transpileClass(transpileConfig) {}
  }
});
