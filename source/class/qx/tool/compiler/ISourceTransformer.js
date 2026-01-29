/**
 * Interface for source transformers used in the compilation process.
 * The can intercept the compilation, and translate the original source code to the source code that will be passed down to Babel.
 */
qx.Interface.define("qx.tool.compiler.ISourceTransformer", {  
  members: {
    /**
     * Function called once to initialize the source transformer.
     */
    async init() {

    },
    /**
     * Whether this transformer should transform the given source,
     * or leave it as is.
     * @param {SourceInfo} sourceInfo 
     * @returns {boolean}
     */
    shouldTransform(sourceInfo) {
    },

    /**
     * Transforms the given source.
     * @param {*} sourceInfo 
     * @returns {string}
     */
    transform(sourceInfo) {
    }
  }
});