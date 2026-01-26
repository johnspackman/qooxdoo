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

************************************************************************ */

const child_process = require("child_process");
const consoleControl = require("console-control-strings");
const path = require("path");

require("app-module-path").addPath(process.cwd() + "/node_modules");

/**
 * Handles compilation of the project
 * @ignore(setImmediate)//TODO this should not be needed
 */
qx.Class.define("qx.tool.cli.commands.Compile", {
  extend: qx.tool.cli.commands.Command,

  statics: {
    YARGS_BUILDER: {
      target: {
        alias: "t",
        describe: "Set the target type: source or build or class name. Default is first target in config file",
        requiresArg: true,
        type: "string"
      },

      "output-path-prefix": {
        describe: "Sets a prefix for the output path of the target - used to compile a version into a non-standard directory",
        type: "string"
      },

      download: {
        alias: "d",
        describe: "Whether to automatically download missing libraries",
        type: "boolean",
        default: true
      },

      locale: {
        alias: "l",
        describe: "Compile for a given locale",
        nargs: 1,
        requiresArg: true,
        type: "string",
        array: true
      },

      "update-po-files": {
        alias: "u",
        describe: "enables detection of translations and writing them out into .po files",
        type: "boolean",
        default: false
      },

      "library-po": {
        describe: "The policy for updating translations in libraries",
        type: ["ignore", "untranslated", "all"],
        default: "ignore"
      },

      "write-all-translations": {
        describe: "enables output of all translations, not just those that are explicitly referenced",
        type: "boolean"
      },

      "app-class": {
        describe: "sets the application class",
        nargs: 1,
        requiresArg: true,
        type: "string"
      },

      "app-theme": {
        describe: "sets the theme class for the current application",
        nargs: 1,
        requiresArg: true,
        type: "string"
      },

      "app-name": {
        describe: "sets the name of the current application",
        nargs: 1,
        requiresArg: true,
        type: "string"
      },

      "app-group": {
        describe: "which application groups to compile (defaults to all)",
        nargs: 1,
        requiresArg: true,
        type: "string"
      },

      "local-fonts": {
        describe: "whether to prefer local font files over CDN",
        type: "boolean"
      },

      watch: {
        describe: "enables watching for changes and continuous compilation",
        type: "boolean",
        alias: "w"
      },

      "watch-debug": {
        describe: "enables debug messages for watching",
        type: "boolean"
      },

      "machine-readable": {
        alias: "M",
        describe: "output compiler messages in machine-readable format",
        type: "boolean"
      },

      minify: {
        alias: "m",
        describe: "disables minification (build targets only)",
        choices: ["off", "minify", "mangle", "beautify"],
        default: "mangle"
      },

      "mangle-privates": {
        describe: "Whether to mangle private variables",
        default: true,
        type: "boolean"
      },

      "save-source-in-map": {
        describe: "Saves the source code in the map file (build target only)",
        type: "boolean",
        default: false
      },

      "source-map-relative-paths": {
        describe:
          "If true, the source file will be saved in the map file if the target supports it. Can be overridden on a per application basis.",
        type: "boolean",
        default: false
      },

      "save-unminified": {
        alias: "u",
        describe: "Saves a copy of the unminified version of output files (build target only)",
        type: "boolean",
        default: false
      },

      "inline-external-scripts": {
        describe: "Inlines external Javascript",
        type: "boolean"
      },

      erase: {
        alias: "e",
        describe: "Enabled automatic deletion of the output directory when compiler version or environment variables change",
        type: "boolean",
        default: true
      },

      feedback: {
        describe: "Shows gas-gauge feedback",
        type: "boolean",
        alias: "f"
      },

      typescript: {
        alias: "T",
        describe: "Outputs typescript definitions in qooxdoo.d.ts",
        type: "boolean",
        default: null
      },

      "add-created-at": {
        describe: "Adds code to populate object's $$createdAt",
        type: "boolean"
      },

      "verbose-created-at": {
        describe: "Adds additional detail to $$createdAt",
        type: "boolean"
      },

      clean: {
        alias: "D",
        describe: "Deletes the target dir before compile",
        type: "boolean"
      },

      "warn-as-error": {
        alias: "E",
        describe: "Handle compiler warnings as error",
        type: "boolean",
        default: false
      },

      "write-library-info": {
        alias: "I",
        describe: "Write library information to the script, for reflection",
        type: "boolean",
        default: true
      },

      "write-compile-info": {
        describe: "Write application summary information to the script, used mostly for unit tests",
        type: "boolean",
        default: false
      },

      bundling: {
        alias: "b",
        describe: "Whether bundling is enabled",
        type: "boolean",
        default: true
      },

      nJobs: {
        alias: "j",
        describe:
          "Number of threads to use for compilation. By default it's number of CPU cores minus one. If set to zero, uses only the main thread.",
        type: "number",
        default: null
      }
    },

    getYargsCommand() {
      return {
        command: "compile",
        describe: "compiles the current application, using compile.json",
        builder: qx.tool.cli.commands.Compile.YARGS_BUILDER
      };
    }
  },

  properties: {},
  events: {
    /**
     * Fired when all applications have made
     */
    "made": "qx.event.type.Event"
  },

  members: {    
    /**
     * @type {Object[]}  The makers created during compilation
     */
    __makers: null,

    /*
     * @Override
     */
    async process() {
      await super.process();

      let compileConfig = this.getCompilerApi().getConfiguration();
      let data = {
        ...this.argv,
        config: compileConfig,
        targetType: this.getTargetType(),
        qxVersion: await this.getQxVersion()
      };

      let configDb = await qx.tool.cli.ConfigDb.getInstance();
      if (this.argv["feedback"] === null) {
        this.argv["feedback"] = configDb.db("qx.default.feedback", true);
      }

      if (this.argv.nJobs != null && this.argv.nJobs < 0) {
        qx.tool.compiler.Console.error("Number of nJobs (-j) must be >= 0");
        process.exitCode = 1;
        return;
      }

      if (this.argv.verbose) {
        console.log(`
Compiler:  v${this.getCompilerVersion()} in ${require.main.filename}
Framework: v${await this.getQxVersion()} in ${await this.getQxPath()}`);
      }

      if (this.argv["machine-readable"]) {
        data.machineReadable = true;
      } else {
        let configDb = await qx.tool.cli.ConfigDb.getInstance();
        let color = configDb.db("qx.default.color", null);
        if (color) {
          let colorOn = consoleControl.color(color.split(" "));
          process.stdout.write(colorOn + consoleControl.eraseLine());
          let colorReset = consoleControl.color("reset");
          process.on("exit", () => process.stdout.write(colorReset + consoleControl.eraseLine()));

          let Console = qx.tool.compiler.Console.getInstance();
          Console.setColorOn(colorOn);
        }
      }

      let libPaths = this.getCompilerApi()
        .getLibraryApis()
        .map(lib => lib.getRootDir());
      data.libs = libPaths;

      let compiler;

      let customCompiler = compileConfig.applications.find(app => app.compiler);
      if (customCompiler) {
        let compilerCompiler = new qx.tool.compiler.Compiler();
        //make a backup of the config because it will be modified during compilation!
        let configBak = qx.lang.Object.clone(data.config, true);
        await compilerCompiler.compileOnce({ ...data, config: configBak, compilerOnly: true, watch: false });

        let makers = await compilerCompiler.getMakers();
        let target = makers[0].target;
        let app = makers[0].applications[0];

        let compilerPath = path.join(target.outputDir, app.projectDir, "index.js");

        await compilerCompiler.stop();
        compilerCompiler.dispose();
        let cp = child_process.fork(compilerPath, ["compiler-server"], {
          env: {
            //The compiler needs to be able to know where Qooxdoo is located,
            //So we pass it in the environment
            ...process.env,
            QOOXDOO_PARENT_COMPILER_PATH: process.argv[1]
          }
        });

        compiler = new qx.tool.compiler.IpcCompilerInterface(cp);
      } else {
        compiler = new qx.tool.compiler.Compiler();
      }

      console.log(">>> Starting compilation of project...");
      compiler.start(data);
      await new Promise(resolve => {
        compiler.addListenerOnce("allAppsMade", async () => {
          let makers = await compiler.getMakers();
          this.__makers = makers;
          this.fireEvent("made");
          if (!this.argv.watch) {
            this.__exit();
            compiler.stop();
            resolve();
          }
          //If we are watching, we never exit so this promise never resolves!
        });
      });
    },

    /**
     * Returns the list of makers to make
     *
     * @return  {qx.tool.compiler.Maker[]}
     */
    getMakers() {
      return this.__makers;
    },

    /**
     * Exits the process with the correct exit code
     */
    __exit() {
      let success = this.__makers.every(maker => maker.success);
      let hasWarnings = this.__makers.every(maker => maker.hasWarnings);
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
      process.exitCode = success ? 0 : 1;
    }
  }
});
