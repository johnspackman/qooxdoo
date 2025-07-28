qx.Class.define("qx.tool.compiler.progress.AbstractProgress", {
  type: "abstract",
  extend: qx.core.Object,

  properties: {
    controller: {
      check: "qx.tool.compiler.Controller",
      nullable: true,
      event: "changeController"
    }
  },

  members: {
    update(type) {}
  },

  // prettier-ignore
  statics: {
    "class.compiling": { type: "info", msg: "Compiling class %1" },
    "class.compiled": { type: "info", msg: "Class %1 compiled" },
    "class.marker": { type: "info", msg: "%1: %2" },
    "class.error": { type: "error", msg: "Error compiling class %1: %2" },
    "class.skipped": { type: "info", msg: "Class %1 skipped" },
    "class.notfound": { type: "error", msg: "Class %1 not found" },
    "maker.writingApp": { type: "info", msg: "Making application %1" },
    "maker.writtenApp": { type: "info", msg: "Application %1 written" },
    "maker.writingApps": { type: "info", msg: "Making applications" },
    "maker.writtenApps": { type: "info", msg: "Applications written" }
  }
});
