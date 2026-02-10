qx.Class.define("qx.tool.compiler.ClassFileConfig", {
  extend: qx.core.Object,

  properties: {
    babelConfig: {
      check: "Object"
    },

    applicationTypes: {
      init: ["browser", "node"],
      check: "Array"
    },

    fontNames: {
      init: [],
      check: "Array"
    },

    environment: {},

    addCreatedAt: {
      init: false,
      check: "Boolean"
    },

    verboseCreatedAt: {
      init: false,
      check: "Boolean"
    },

    manglePrefixes: {},

    ignores: {
      init: [],
      check: "Array"
    },

    manglePrivates: {
      init: "readable",
      check: ["off", "readable", "unreadable"]
    },

    symbols: {
      init: {},
      check: "Object"
    }
  },

  members: {
    /**
     * Converts the config to a native object
     * @returns {Object}
     */
    serialize() {
      //We will use the qx.util.Serializer for now, but this may change later
      return qx.util.Serializer.toNativeObject(this);
    }
  },

  statics: {
    createFromAnalyzer(analyzer) {
      let config = new qx.tool.compiler.ClassFileConfig();
      config.setBabelConfig(analyzer.getBabelConfig());
      config.setApplicationTypes(analyzer.getApplicationTypes());
      config.setFontNames(Object.keys(analyzer.getFonts()));
      config.setEnvironment(analyzer.getEnvironment());
      config.setAddCreatedAt(analyzer.getAddCreatedAt());
      config.setVerboseCreatedAt(analyzer.getVerboseCreatedAt());
      config.setIgnores(analyzer.getIgnores());

      let symbols;
      if (analyzer.getGlobalSymbols().length) {
        symbols = analyzer.getGlobalSymbols();
      } else {
        const CF = qx.tool.compiler.ClassFile;
        symbols = [...CF.QX_GLOBALS, ...CF.COMMON_GLOBALS, ...CF.BROWSER_GLOBALS];
      }
      config.setSymbols(symbols);

      let db = analyzer.getDatabase();
      if (!db.manglePrefixes) {
        db.manglePrefixes = {
          nextPrefix: 1,
          classPrefixes: {}
        };
      }
      config.setManglePrefixes(db.manglePrefixes);
      config.setManglePrivates(analyzer.getManglePrivates());

      return config;
    },
    /**
     * Reconstructs a ClassFileConfig from a native object
     * @param {Object} obj
     * @returns {qx.tool.compiler.ClassFileConfig}
     */
    deserialize(obj) {
      return new qx.tool.compiler.ClassFileConfig().set(obj);
    }
  }
});
