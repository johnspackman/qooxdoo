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

const semver = require("semver");
const process = require("process");
const child_process = require("child_process");
const consoleControl = require("console-control-strings");
const path = require("path");
const fs = require("fs");

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
          description:
            "enables detection of translations and writing them out into .po files",
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
          description:
            "enables output of all translations, not just those that are explicitly referenced",
          type: "boolean"
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("target").set({
          shortCode: "t",
          description:
            "Set the target type: source or build or class name. Default is first target in config file",
          required: true,
          type: "string",
          value: "source"
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("output-path-prefix").set({
          description:
            "Sets a prefix for the output path of the target - used to compile a version into a non-standard directory",
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
          description:
            "enables watching for changes and continuous compilation",
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
          description:
            "Saves the source code in the map file (build target only)",
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
          description:
            "Saves a copy of the unminified version of output files (build target only)",
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
          description:
            "Enabled automatic deletion of the output directory when compiler version or environment variables change",
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
          type: "boolean",
          value: false
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
          description:
            "Write library information to the script, for reflection",
          type: "boolean",
          value: true
        })
      );

      cmd.addFlag(
        new qx.tool.cli.Flag("write-compile-info").set({
          description:
            "Write application summary information to the script, used mostly for unit tests",
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
          description: "Number of threads to use for compilation. By default it's number of CPU cores minus one. If set to zero, uses only the main thread.",
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

      return cmd;
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

    /** @type{String} the path to the root of the meta files by classname */
    __metaDir: null,

    /** @type{Boolean} whether the typescript output is enabled */
    __typescriptEnabled: false,

    /** @type{String} the name of the typescript file to generate, null = use default */
    __typescriptFile: null,

    /** @type{Boolean} whether the typescript watcher has already been attached (watch mode) */
    __typescriptWatcherAttached: false,

    /**
     * @Override
     */
    async process() {

      let compileConfig = this.getCompilerApi().getConfiguration();
      let data = {
        ...this.argv,
        config: compileConfig,
        targetType: this.getTargetType(),
        qxVersion: await this.getQxVersion()
      };

      let configDb = await qx.tool.compiler.cli.ConfigDb.getInstance();
      if (this.argv.set) {
        this.argv.set.forEach(function (kv) {
          var m = kv.match(/^([^=\s]+)(=(.+))?$/);
          if (m) {
            var key = m[1];
            var value = m[3];
            configDb.setOverride(key, value);
          } else {
            throw new qx.tool.utils.Utils.UserError(
              `Failed to parse environment setting commandline option '--set ${kv}'`
            );
          }
        });
      }

      if (this.argv["feedback"] === null) {
        this.argv["feedback"] = configDb.db("qx.default.feedback", true);
      }

      if (this.argv.jobs != null && this.argv.jobs < 0) {
        qx.tool.compiler.Console.error("Number of jobs (-j) must be >= 0");
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
        //we will compile our custom compiler first, then run it in a child process and communicate with it via IPC.
        let compilerCompiler = new qx.tool.compiler.Compiler();
        //make a backup of the config because it will be modified during compilation!
        let configBak = qx.lang.Object.clone(data.config, true) ;
        await compilerCompiler.compileOnce({...data, config: configBak, compilerOnly: true, watch: false});    

        let makers = await compilerCompiler.getMakers();
        let target = makers[0].target;
        let app = makers[0].applications[0];
        
        let compilerPath = path.join(target.outputDir, app.projectDir, "index.js");
        await compilerCompiler.stop();
        compilerCompiler.dispose();
        let cp = child_process.fork(compilerPath, ["compiler-server"]);

        compiler = new qx.tool.compiler.IpcCompilerInterface(cp);
      } else {
        compiler = new qx.tool.compiler.Compiler();
      }

      console.log(">>> Starting compilation of project...");
      compiler.start(data);
      await new Promise(resolve => {
        compiler.addListenerOnce("made", async () => {
          let makers = await compiler.getMakers();
          this.__makers = makers;
          this.fireEvent("made");
          if (!this.argv.watch) {
            this.__exit();
            compiler.stop();
            resolve();
          }
          //If we are watching, we never exit so this promise never resolves!
        })
      });
    },

    /**
     * Returns the list of makers to make, as POJO objects
     *
     * @return {Object[]}
     */
    getMakers() {
      return this.__makers;
    },

    /**
     * Exits the process with the correct exit code
     */
    __exit(success) {
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
        "qx.tool.compiler.cli.compile.multipleDefaultTargets":
          "Multiple default targets found!",
        "qx.tool.compiler.cli.compile.unusedTarget":
          "Target type %1, index %2 is unused",
        "qx.tool.compiler.cli.compile.selectingDefaultApp":
          "You have multiple applications, none of which are marked as 'default'; the first application named %1 has been chosen as the default application",
        "qx.tool.compiler.cli.compile.legacyFiles":
          "File %1 exists but is no longer used",
        "qx.tool.compiler.cli.compile.deprecatedCompile":
          "The configuration setting %1 in compile.json is deprecated",
        "qx.tool.compiler.cli.compile.deprecatedCompileSeeOther":
          "The configuration setting %1 in compile.json is deprecated (see %2)",
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
