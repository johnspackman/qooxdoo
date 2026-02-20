/**
 * This mixin add the property for a Source Transformer.
 * If one is added to the Meta Database, it will convert the source before the meta is parsed.
 * If one is added to a Maker, it will convert the source before compilation.
 */
qx.Mixin.define("qx.tool.compiler.MTransformerProperty", {
  properties: {
    /**
     * This class must implement the interface qx.tool.compiler.ISourceTransformer.
     * 
     * If specified, the class name of the source transformer to use,
     * which will transform source code.
     */
    transformerClass: {
      check: "String",
      init: null,
      nullable: true
    }
  },

  members: {
    /**
     * Gets the source transformer, creating if necessary
     * @returns {qx.tool.compiler.ISourceTransformer?} instance of the source transformer
     */
    getTransformer() {
      if (this.__transformer === undefined) {
        let transformerClassname = this.getTransformerClass();
        if (!transformerClassname) {
          return (this.__transformer = null);
        }
        let TransformerClass = qx.Class.getByName(transformerClassname);
        if (qx.core.Environment.get("qx.debug")) {
          if (!TransformerClass) {
            throw new Error("Could not find transformer class: " + transformerClassname);
          }
        }
        this.__transformer = new TransformerClass();        
      }
      return this.__transformer;
    }
  }
})