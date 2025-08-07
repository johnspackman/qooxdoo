qx.Class.define("qx.tool.compiler.feedback.ConsoleFeedback", {
  extend: qx.core.Object,

  construct(controller) {
    super();
    controller.addListener("classNeedsToBeCompiled", this.__onClassNeedsToBeCompiled, this);
    controller.addListener("compilingClass", this.__onCompilingClass, this);
    controller.addListener("compiledClass", this.__onCompiledClass, this);
    controller.getDiscovery().addListener("classAdded", this.__onClassAdded, this);
    controller.getDiscovery().addListener("classRemoved", this.__onClassRemoved, this);
    controller.getDiscovery().addListener("classChanged", this.__onClassChanged, this);
    controller.addListener("addMaker", this.__onAddMaker, this);
  },

  members: {
    __onClassAdded(e) {
      let classname = e.getData();
      qx.tool.compiler.Console.log(`Added class ${classname} to discovery.`);
    },

    __onClassRemoved(e) {
      let classname = e.getData();
      qx.tool.compiler.Console.log(`Removed class ${classname} from discovery.`);
    },

    __onClassChanged(e) {
      let classname = e.getData();
      qx.tool.compiler.Console.log(`Detected change to class ${classname} in discovery.`);
    },

    __onClassNeedsToBeCompiled(e) {
      let classname = e.getData();
      qx.tool.compiler.Console.log(`Class ${classname} needs to be compiled.`);
    },

    __onCompilingClass(e) {
      let data = e.getData();
      qx.tool.compiler.Console.log(`Compiling class ${data.classname}...`);
    },

    __onCompiledClass(e) {
      let data = e.getData();
      qx.tool.compiler.Console.log(`Compiled class ${data.classname}.`);
    },

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
