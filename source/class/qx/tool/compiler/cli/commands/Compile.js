/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2017 Zenesis Ltd

   License:
     MIT: https://opensource.org/licenses/MIT
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * John Spackman (john.spackman@zenesis.com, @johnspackman)
     * Henner Kollmann (Henner.Kollmann@gmx.de, @hkollmann)

************************************************************************ */

const process = require("process");
const child_process = require("child_process");
const path = require("path");

require("app-module-path").addPath(process.cwd() + "/node_modules");

/**
 * Handles compilation of the project
 * @ignore(setImmediate)
 */
qx.Class.define("qx.tool.compiler.cli.commands.Compile", {
  extend: qx.tool.compiler.cli.Command,

  statics: {
    /**
     * Creates and configures the CLI command for the compile subcommand
     * @param clazz {new () => qx.core.Object} the class to instantiate as the command handler
     * @return {Promise<qx.tool.cli.Command>} the configured command
     */
    async createCliCommand(clazz = this) {
      let cmd = await qx.tool.compiler.cli.Command.createCliCommand(clazz);
      cmd.set({
        name: "compile",
        description: "compiles the current application, using compile.json"
      });

      cmd.addFlag(
        new qx.tool.cli.Flag("download").set({
          shortCode: "d",
          description: "Whether to automatically download missing libraries",
          type: "boolean",
          value: true
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("update-po-files").set({
          shortCode: "u",
          description: "enables detection of translations and writing them out into .po files",
          type: "boolean",
          value: false
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("library-po").set({
          description: "The policy for updating translations in libraries",
          type: ["ignore", "untranslated", "all"],
          value: "ignore"
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("write-all-translations").set({
          description: "enables output of all translations, not just those that are explicitly referenced",
          type: "boolean"
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("target").set({
          shortCode: "t",
          description: "Set the target type: source or build or class name. Default is first target in config file",
          required: true,
          type: "string",
          value: "source"
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("output-path-prefix").set({
          description: "Sets a prefix for the output path of the target - used to compile a version into a non-standard directory",
          type: "string"
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("locale").set({
          shortCode: "l",
          description: "Compile for a given locale",
          array: true,
          type: "string",
          value: ["en"]
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("app-class").set({
          description: "sets the application class",
          array: true,
          type: "string"
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("app-theme").set({
          description: "sets the theme class for the current application",
          array: true,
          type: "string"
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("app-name").set({
          description: "sets the name of the current application",
          array: true,
          type: "string"
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("app-group").set({
          description: "which application groups to compile (defaults to all)",
          type: "string"
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("watch").set({
          description: "enables watching for changes and continuous compilation",
          type: "boolean",
          shortCode: "w",
          value: false
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("watch-debug").set({
          description: "enables debug messages for watching",
          type: "boolean",
          value: false
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("machine-readable").set({
          shortCode: "M",
          description: "output compiler messages in machine-readable format",
          type: "boolean",
          value: false
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("minify").set({
          shortCode: "m",
          description: "disables minification (build targets only)",
          type: ["off", "minify", "mangle", "beautify"],
          value: "mangle"
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("mangle-privates").set({
          description: "Whether to mangle private variables",
          type: "boolean"
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("save-source-in-map").set({
          description: "Saves the source code in the map file (build target only)",
          type: "boolean"
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("source-map-relative-paths").set({
          description:
            "If true, the source file will be saved in the map file if the target supports it. Can be overridden on a per application basis.",
          type: "boolean"
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("save-unminified").set({
          shortCode: "u",
          description: "Saves a copy of the unminified version of output files (build target only)",
          type: "boolean"
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("inline-external-scripts").set({
          description: "Inlines external Javascript",
          type: "boolean"
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("erase").set({
          shortCode: "e",
          description: "Enabled automatic deletion of the output directory when compiler version or environment variables change",
          type: "boolean",
          value: true
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("feedback").set({
          description: "Shows progress bar feedback",
          type: "boolean",
          shortCode: "f",
          value: false
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("typescript").set({
          shortCode: "T",
          description: "Outputs typescript definitions in qooxdoo.d.ts",
          type: "boolean"
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("add-created-at").set({
          description: "Adds code to populate object's $$createdAt",
          type: "boolean",
          value: false
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("clean").set({
          shortCode: "D",
          description: "Deletes the target dir before compile",
          type: "boolean",
          value: false
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("warn-as-error").set({
          shortCode: "w",
          description: "Handle compiler warnings as error",
          type: "boolean",
          value: false
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("write-library-info").set({
          shortCode: "I",
          description: "Write library information to the script, for reflection",
          type: "boolean",
          value: true
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("write-compile-info").set({
          description: "Write application summary information to the script, used mostly for unit tests",
          type: "boolean",
          value: false
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("bundling").set({
          shortCode: "b",
          description: "Whether bundling is enabled",
          type: "boolean",
          value: true
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("nJobs").set({
          shortCode: "j",
          description:
            "Number of threads to use for compilation. By default it's number of CPU cores / 2. If set to zero, uses only the main thread.",
          type: "integer",
          value: null,
          required: false
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("set").set({
          description: "sets an environment value for the compiler",
          type: "string",
          array: true
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("set-env").set({
          description: "sets an environment value for the application",
          type: "string",
          array: true
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("custom-inspect").set({
          description:
            "The inspect or inspect-brk flag to use when running a custom compiler in debug mode; this should be [inspect[-brk]=][0.0.0.0:]port",
          type: "string",
          value: null
        })
      );

      return cmd;
    }
  },

  properties: {},
  events: {
    /**
     * Fired when application writing starts; data is an array of objects, each containing:
     *   application {qx.tool.compiler.app.Application}
     *   analyzer {qx.tool.compiler.Analyzer}
     *   maker {qx.tool.compiler.makers.Maker}
     */
    writingApplications: "qx.event.type.Data",

    /**
     * Fired when writing of single application starts; data is an object containing:
     *   application {qx.tool.compiler.app.Application}
     *   analyzer {qx.tool.compiler.Analyzer}
     *   maker {qx.tool.compiler.makers.Maker}
     */
    writingApplication: "qx.event.type.Data",

    /**
     * Fired when writing of single application is complete; data is an object containing:
     *   application {qx.tool.compiler.app.Application}
     *   analyzer {qx.tool.compiler.Analyzer}
     *   maker {qx.tool.compiler.makers.Maker}
     */
    writtenApplication: "qx.event.type.Data",

    /**
     * Fired after writing of all applications; data is an array of objects, each containing:
     *   application {qx.tool.compiler.app.Application}
     *   analyzer {qx.tool.compiler.Analyzer}
     *   maker {qx.tool.compiler.makers.Maker}
     */
    writtenApplications: "qx.event.type.Data",

    /**
     * Fired when a class is about to be compiled.
     *
     * The event data is an object with the following properties:
     *
     * dbClassInfo: {Object} the newly populated class info
     * oldDbClassInfo: {Object} the previous populated class info
     * classFile - {ClassFile} the qx.tool.compiler.ClassFile instance
     */
    compilingClass: "qx.event.type.Data",

    /**
     * Fired when a class is compiled.
     *
     * The event data is an object with the following properties:
     * dbClassInfo: {Object} the newly populated class info
     * oldDbClassInfo: {Object} the previous populated class info
     * classFile - {ClassFile} the qx.tool.compiler.ClassFile instance
     */
    compiledClass: "qx.event.type.Data",

    /**
     * Fired when the database is been saved
     *
     *  data:
     * database: {Object} the database to save
     */
    saveDatabase: "qx.event.type.Data",

    /**
     * Fired after all enviroment data is collected
     *
     * The event data is an object with the following properties:
     *  application {qx.tool.compiler.app.Application} the app
     *  enviroment: {Object} enviroment data
     */
    checkEnvironment: "qx.event.type.Data",

    /**
     * Fired when making of apps begins. Data: the Maker instance.
     */
    making: "qx.event.type.Data",

    /**
     * Fired when making of apps is done. Data: the Maker instance.
     */
    made: "qx.event.type.Data",

    /**
     * Fired once when all makers have finished — after the last `made` event.
     */
    allDone: "qx.event.type.Event",

    /**
     * Fired when minification begins.
     *
     * The event data is an object with the following properties:
     *  application {qx.tool.compiler.app.Application} the app being minified
     *  part: {String} the part being minified
     *  filename: {String} the part filename
     */
    minifyingApplication: "qx.event.type.Data",

    /**
     * Fired when minification is done.
     *
     * The event data is an object with the following properties:
     *  application {qx.tool.compiler.app.Application} the app being minified
     *  part: {String} the part being minified
     *  filename: {String} the part filename
     */
    minifiedApplication: "qx.event.type.Data"
  },

  members: {
    /** @type {qx.tool.compiler.Compiler} the Compiler instance that will run the compile */
    __compiler: null,

    /**
     * @Override
     */
    async process() {
      if (this.argv.jobs != null && this.argv.jobs < 0) {
        qx.tool.compiler.Console.error("Number of jobs (-j) must be >= 0");
        process.exitCode = 1;
        return;
      }

      let compileConfig = this.getCompilerApi().getConfiguration();
      let hasCustomCompiler = compileConfig.applications.find(app => app.compiler);

      let compilerClassName = qx.core.Environment.get("qx.tool.compiler.Compiler.compilerClass");
      let isCustomCompiler = !!compilerClassName;
      let CompilerClass = qx.tool.compiler.Compiler;
      if (isCustomCompiler) {
        if (!hasCustomCompiler) {
          qx.tool.compiler.Console.error("This is a custom compiler but the configuration does not require a custom compiler");
          process.exitCode = 1;
          return;
        }

        if (!compilerClassName) {
          qx.tool.compiler.Console.error(
            "This application is a custom compiler which is intended to be created, compiled, and run solely by the qx application. " +
              "The environment setting qx.tool.compiler.Compiler.compilerClass is not set which suggests that you're not running the custom compiler correctly. " +
              "The most likely cause of this is that you are manually compiling and running the custom compiler instead of letting the qx application do it.  Don't :)"
          );
          process.exitCode = 1;
          return;
        }

        CompilerClass = qx.Class.getByName(compilerClassName);
        if (!CompilerClass) {
          qx.tool.compiler.Console.error("Could not find compiler class: " + compilerClassName);
          process.exitCode = 1;
          return;
        }
        if (!qx.Class.hasInterface(CompilerClass, qx.tool.compiler.ICompilerInterface)) {
          qx.tool.compiler.Console.error(
            `This is a custom compiler built using the class ${compilerClassName} but that class does not implement qx.tool.compiler.ICompilerInterface`
          );
          process.exitCode = 1;
          return;
        }
      }

      let qxVersion = await this.getQxVersion();
      if (this.argv.verbose) {
        console.log(`
Compiler:  v${this.getCompilerVersion()} in ${require.main.filename}
Framework: v${qxVersion} in ${await this.getQxPath()}`);
      }

      if (compileConfig.sass && compileConfig.sass.compiler !== undefined) {
        qx.tool.compiler.resources.ScssConverter.USE_V6_COMPILER = compileConfig.sass.compiler == "latest";
      } else {
        qx.tool.compiler.resources.ScssConverter.USE_V6_COMPILER = null;
      }
      if (compileConfig.sass && compileConfig.sass.copyOriginal) {
        qx.tool.compiler.resources.ScssConverter.COPY_ORIGINAL_FILES = true;
      }

      let data = {
        ...this.argv,
        config: compileConfig,
        targetType: this.getTargetType(),
        qxVersion: qxVersion
      };

      if (hasCustomCompiler && !isCustomCompiler) {
        qx.tool.compiler.Console.log(">>>Custom compiler detected - compiling custom compiler first...");
        //we will compile our custom compiler first, then run it in a child process and let that take over.
        let compilerCompiler = new qx.tool.compiler.Compiler({ ...data, compilerOnly: true, watch: false, nJobs: 0 });
        await compilerCompiler.compileOnce();

        let makers = compilerCompiler.getMakers();
        let target = makers[0].target;
        let app = makers[0].getApplications()[0];

        let nodeCmdArgs = [];

        if (this.argv.customInspect) {
          debugger;
          // customInspect should be in the format [inspect[-brk]=][ip:]port, e.g. "inspect=9229" or "inspect-brk=0.0.0.0:9231"
          let customInspect = this.argv.customInspect;
          let pos = customInspect.indexOf("=");
          let inspectType = "inspect";
          if (pos >= 0) {
            inspectType = this.argv.customInspect.substring(0, pos);
            if (inspectType !== "inspect" && inspectType !== "inspect-brk") {
              qx.tool.compiler.Console.error("Invalid inspect type in --custom-inspect: " + inspectType);
              process.exitCode = 1;
              return;
            }
            customInspect = this.argv.customInspect.substring(pos + 1);
          }
          pos = customInspect.indexOf(":");
          let host = null;
          let port = null;
          if (pos >= 0) {
            host = customInspect.substring(0, pos);
            port = customInspect.substring(pos + 1);
          } else {
            port = customInspect;
          }
          if (port) {
            port = parseInt(port, 10);
            if (isNaN(port) || port <= 0 || port > 65535) {
              qx.tool.compiler.Console.error("Invalid port in --custom-inspect: " + port);
              process.exitCode = 1;
              return;
            }
          }
          nodeCmdArgs.push(`--${inspectType}=${host ? host + ":" : ""}${port}`);
        }

        let compilerPath = path.join(target.getOutputDir(), app.getProjectDir(), "index.js");
        await compilerCompiler.stop();
        compilerCompiler.dispose();

        nodeCmdArgs.push(compilerPath);
        nodeCmdArgs = nodeCmdArgs.concat(
          process.argv.slice(2).filter(arg => !arg.startsWith("--custom-inspect") && !arg.startsWith("--customInspect"))
        );
        await new Promise(resolve => {
          if (this.argv.verbose) {
            qx.tool.compiler.Console.log(">>>Running custom compiler with command: " + process.execPath + " " + nodeCmdArgs.join(" "));
          }
          qx.tool.utils.Utils.spawnProcess(process.execPath, nodeCmdArgs, {
            env: {
              ...process.env,
              QOOXDOO_PARENT_COMPILER_PATH: require.main.filename
            },
            onClose: code => {
              resolve();
              process.exitCode = code;
              // exit process. The whole work is done by the custom compiler,
              // so we just need to exit with the correct code here.
              process.exit();
            }
          });
        });
        return;
      }

      let compiler;

      // If we are running as a custom compiler, we need to get and load the custom compiler class
      compiler = new CompilerClass(data);
      this.__compiler = compiler;

      //relay the events
      let events = Object.keys(qx.tool.compiler.ICompilerInterface.$$events);
      for (let event of events) {
        compiler.addListener(event, evt => this.dispatchEvent(evt.clone()));
      }

      qx.tool.compiler.Console.log(">>> Starting compilation of project...");
      await compiler.start(data);
      return new Promise((resolve, reject) => {
        this.addListener("allDone", () => {
          if (!this.argv.watch) {
            this._exit().then(resolve, reject);
          }
          //If we are watching, we never exit so this promise never resolves!
        });
      });
    },

    /**
     * Returns the list of makers to make, as POJO objects
     *
     * @return {qx.tool.compiler.Maker[]}
     */
    getMakers() {
      return this.__compiler.getMakers();
    },

    /**
     * Runs the finalization code ran on exit
     * @returns {integer} the process exit code
     */
    async _exit() {
      let makers = this.getMakers();
      let success = makers.every(maker => maker.success) && !this.__compiler.hasStartError();
      let hasWarnings = makers.some(maker => maker.hasWarnings);
      if (success && hasWarnings && this.argv.warnAsError) {
        success = false;
      }
      if (
        !this.argv.deploying &&
        !this.argv["machine-readable"] &&
        this.argv["feedback"] &&
        this.__outputDirWasCreated &&
        this.argv.target === "build"
      ) {
        qx.tool.compiler.Console.warn(
          "   *******************************************************************************************\n" +
            "   **                                                                                       **\n" +
            "   **  Your compilation will include temporary files that are only necessary during         **\n" +
            "   **  development; these files speed up the compilation, but take up space that you would  **\n" +
            "   **  probably not want to put on a production server.                                     **\n" +
            "   **                                                                                       **\n" +
            "   **  When you are ready to deploy, try running `qx deploy` to get a minimised version     **\n" +
            "   **                                                                                       **\n" +
            "   *******************************************************************************************"
        );
      }
      await this.__compiler.stop();
      return success ? 0 : 1;
    }
  },

  defer(statics) {
    qx.tool.compiler.Console.addMessageIds({
      "qx.tool.compiler.cli.compile.writingApplication": "Writing application %1",
      "qx.tool.compiler.cli.compile.minifyingApplication": "Minifying %1 %2",
      "qx.tool.compiler.cli.compile.compilingClass": "Compiling class %1",
      "qx.tool.compiler.cli.compile.compiledClass": "Compiled class %1 in %2s",
      "qx.tool.compiler.cli.compile.makeBegins": "Making applications...",
      "qx.tool.compiler.cli.compile.makeEnds": "Applications are made"
    });

    qx.tool.compiler.Console.addMessageIds(
      {
        "qx.tool.compiler.cli.compile.multipleDefaultTargets": "Multiple default targets found!",
        "qx.tool.compiler.cli.compile.unusedTarget": "Target type %1, index %2 is unused",
        "qx.tool.compiler.cli.compile.selectingDefaultApp":
          "You have multiple applications, none of which are marked as 'default'; the first application named %1 has been chosen as the default application",
        "qx.tool.compiler.cli.compile.legacyFiles": "File %1 exists but is no longer used",
        "qx.tool.compiler.cli.compile.deprecatedCompile": "The configuration setting %1 in compile.json is deprecated",
        "qx.tool.compiler.cli.compile.deprecatedCompileSeeOther": "The configuration setting %1 in compile.json is deprecated (see %2)",
        "qx.tool.compiler.cli.compile.deprecatedUri":
          "URIs are no longer set in compile.json, the configuration setting %1=%2 in compile.json is ignored (it's auto detected)",
        "qx.tool.compiler.cli.compile.deprecatedProvidesBoot":
          "Manifest.Json no longer supports provides.boot - only Applications can have boot; specified in %1",
        "qx.tool.compiler.cli.compile.deprecatedBabelOptions":
          "Deprecated use of `babelOptions` - these should be moved to `babel.options`",
        "qx.tool.compiler.cli.compile.deprecatedBabelOptionsConflicting":
          "Conflicting use of `babel.options` and the deprecated `babelOptions` (ignored)"
      },

      "warning"
    );
  }
});
