qx.Class.define("qx.tool.compiler.feedback.ConsoleFeedback", {
  extend: qx.core.Object,

  construct(controller) {
    super();
    this.__classStartTimes = {};

    let startTimes = {
      controller: 0,
      metaDb: 0,
      discovery: 0
    };
    const now = () => Date.now();
    const start = type => (startTimes[type] = now());
    const report = (type, name) => {
      let endTime = now();
      let time = endTime - startTimes[type];
      startTimes[type] = endTime;
      qx.tool.compiler.Console.log(`Startup for ${name} in ${time}ms`);
    };

    start("overall");
    controller.addListener("starting", () => start("controller"));
    controller.addListener("metaDbLoaded", () => report("controller", "Controller - Meta Database Loaded"));
    controller.addListener("discoveryStarted", () => report("controller", "Controller - Discovery Started"));
    controller.addListener("metaDbConfiguring", () => report("controller", "Controller - Meta Database Configuring"));
    controller.addListener("metaDbConfigured", () => report("controller", "Controller - Meta Database Configured"));
    controller.addListener("addedDiscoveredClasses", () => report("controller", "Controller - Add Discovered Classes"));
    controller.addListener("writtenMetaData", () => report("controller", "Controller - Writing meta data"));
    controller.addListener("started", () => {
      report("controller", "Controller - First compile");
      report("overall", "Overall Startup");
    });
    controller.getMetaDb().addListener("starting", () => start("metaDb"));
    controller.getMetaDb().addListener("started", () => report("metaDb", "Meta Database"));
    controller.getDiscovery().addListener("starting", () => start("discovery"));
    controller.getDiscovery().addListener("started", () => report("discovery", "File Discovery"));

    controller.addListener("classNeedsToBeCompiled", this.__onClassNeedsToBeCompiled, this);
    controller.addListener("compilingClass", this.__onCompilingClass, this);
    controller.addListener("compiledClass", this.__onCompiledClass, this);
    controller.getDiscovery().addListener("classAdded", this.__onClassAdded, this);
    controller.getDiscovery().addListener("classRemoved", this.__onClassRemoved, this);
    controller.getDiscovery().addListener("classChanged", this.__onClassChanged, this);
    controller.addListener("addMaker", this.__onAddMaker, this);
  },

  properties: {
    verbose: {
      check: "Boolean",
      init: false,
      event: "changeVerbose"
    }
  },

  members: {
    /** @type{Object<String,Integer>} start times in milliseconds of each class being compiled, indexed by classname */
    __classStartTimes: null,

    /**
     * Event handler for when a class file is detected
     *
     * @param {qx.event.type.Data} e
     */
    __onClassAdded(e) {
      let classname = e.getData();
      if (this.isVerbose()) {
        qx.tool.compiler.Console.log(`Added class ${classname} to discovery.`);
      }
    },

    /**
     * Event handler for when a class file is deleted
     *
     * @param {qx.event.type.Data} e
     */
    __onClassRemoved(e) {
      let classname = e.getData();
      if (this.isVerbose()) {
        qx.tool.compiler.Console.log(`Removed class ${classname} from discovery.`);
      }
    },

    /**
     * Event handler for when a class file is edited
     *
     * @param {qx.event.type.Data} e
     */
    __onClassChanged(e) {
      let classname = e.getData();
      if (this.isVerbose()) {
        qx.tool.compiler.Console.log(`Detected change to class ${classname} in discovery.`);
      }
    },

    /**
     * Event handler for when a class needs to be compiled
     *
     * @param {qx.event.type.Data} e
     */
    __onClassNeedsToBeCompiled(e) {
      let classname = e.getData();
      if (this.isVerbose()) {
        qx.tool.compiler.Console.log(`Class ${classname} needs to be compiled.`);
      }
    },

    /**
     * Event handler for when a class compilation starts
     *
     * @param {qx.event.type.Data} e
     */
    __onCompilingClass(e) {
      let data = e.getData();
      this.__classStartTimes[data.classname] = new Date().getTime();
      if (this.isVerbose()) {
        qx.tool.compiler.Console.log(`Compiling class ${data.classname}...`);
      }
    },

    /**
     * Event handler for when a class compilation finishes
     *
     * @param {qx.event.type.Data} e
     */
    __onCompiledClass(e) {
      let data = e.getData();
      let endTime = new Date().getTime();
      let startTime = this.__classStartTimes[data.classname];
      delete this.__classStartTimes[data.classname];

      if (this.isVerbose()) {
        qx.tool.compiler.Console.log(`Compiled class ${data.classname} in ${endTime - startTime}ms.`);
      }
    },

    /**
     * Event handler for when a maker is added
     *
     * @param {qx.event.type.Data} e
     */
    __onAddMaker(e) {
      let maker = e.getData();
      let id = maker.getTarget().getOutputDir();
      qx.tool.compiler.Console.log(`Maker added for: ${id}`);
      maker.addListener("writingApplications", () => qx.tool.compiler.Console.log(`${id}: Writing applications...`));      
      maker.addListener("writtenApplication", evt =>
        qx.tool.compiler.Console.log(`${id}: Written application ${evt.getData().application.getName()}...`)
      );
    }
  }
});
