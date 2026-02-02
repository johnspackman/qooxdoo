/**
 * Interface for source transformers used in the compilation process.
 * The can intercept the compilation, and translate the original source code to the source code that will be passed down to Babel.
 * Note 2026-FEB-02: For now, transformation is done synchronously.
 */
qx.Interface.define("qx.tool.compiler.ISourceTransformer", {  
  members: {
    /**
     * Function called once to initialize the source transformer.
     * @param {qx.tool.compiler.meta.MetaDatabase} metaDb The meta database
     */
    async init(metaDb) {},
    /**
     * Whether this transformer should transform the given source,
     * or leave it as is.
     * @param {qx.tool.compiler.Controller.SourceInfo} sourceInfo
     * @returns {boolean}
     */
    shouldTransform(sourceInfo) {},

    /**
     * Transforms the given source.
     * @param {qx.tool.compiler.Controller.SourceInfo} sourceInfo 
     * @returns {string} The resulting source code
     */
    transform(sourceInfo) {}
  }
});