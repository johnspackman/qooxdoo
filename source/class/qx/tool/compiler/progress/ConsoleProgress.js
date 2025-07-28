qx.Class.define("qx.tool.compiler.progress.ConsoleProgress", {
  extend: qx.tool.compiler.progress.AbstractProgress,

  properties: {
    verbose: {
      init: false,
      check: "Boolean"
    }
  },

  members: {
    /**
     * @Override
     */
    update(type, ...args) {
      let info = qx.tool.compiler.progress.AbstractProgress[type] || null;
      let msg = null;
      let messageType = msg?.type || "error";
      if (info) {
        msg = qx.lang.String.format(info.msg, args || []);
      } else {
        msg = "Unknown progress type: " + type + " :: " + JSON.stringify(args);
      }
      if (messageType == "info") {
        messageType = "log";
      }
      console[messageType](msg);

      if (type == "maker.writtenApps" && this.getVerbose()) {
        console.log("\nCompleted all applications, libraries used are:");

        Object.values(this.getController().getLibraries()).forEach(lib => {
          console.log(`   ${lib.getNamespace()} (${lib.getRootDir()})`);
        });
      }
    }
  }
});
