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
      init: true,
      check: "Boolean"
    },

    symbols: {
      init: {},
      check: "Object"
    }
  },

  statics: {
    createFromAnalyser(analyser) {
      let config = new qx.tool.compiler.ClassFileConfig();
      config.setBabelConfig(analyser.getBabelConfig());
      config.setApplicationTypes(analyser.getApplicationTypes());
      config.setFontNames(analyser.getFontNames());
      config.setEnvironment(analyser.getEnvironment());
      config.setAddCreatedAt(analyser.getAddCreatedAt());
      config.setVerboseCreatedAt(analyser.getVerboseCreatedAt());
      config.setIgnores(analyser.getIgnores());

      let symbols;
      if (analyser.getGlobalSymbols().length) {
        symbols = analyser.getGlobalSymbols();
      } else {
        const CF = qx.tool.compiler.ClassFile;
        symbols = [...CF.QX_GLOBALS, ...CF.COMMON_GLOBALS, ...CF.BROWSER_GLOBALS];
      }
      config.setSymbols(symbols);

      let db = analyser.getDatabase();
      if (!db.manglePrefixes) {
        db.manglePrefixes = {
          nextPrefix: 1,
          classPrefixes: {}
        };
      }
      config.setManglePrefixes(db.manglePrefixes);
      config.setManglePrivates(analyser.getManglePrivates());

      return config;
    }
  }
});
