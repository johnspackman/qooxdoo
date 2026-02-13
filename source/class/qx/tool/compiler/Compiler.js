const fs = qx.tool.utils.Promisify.fs;
const semver = require("semver");
const path = require("upath");

/**
 * @use(qx.core.BaseInit)
 * @use(qx.tool.*)
 * 
 */

qx.Class.define("qx.tool.compiler.Compiler", {
  implement: [qx.tool.compiler.ICompilerInterface],
  extend: qx.core.Object,
  events: {
    /**@override */
    made: "qx.event.type.Event",
    /**@override */
    writtenApplication: "qx.event.type.Data",
    /**@override */
    making: "qx.event.type.Event",
  },
  members: {
    /**
     * @type {qx.tool.compiler.ICompilerInterface.CompilerData} the data passed to the compiler
     */
    __data: null,
    /** @type {String} the path to the root of the meta files by classname */
    __metaDir: null,
    /**
     * @type {qx.tool.compiler.Controller} the controller instance
     */
    __controller: null,
    __makers: null,
    __libraries: null,
    __outputDirWasCreated: false,

    /** @type {Boolean} whether the typescript output is enabled */
    __typescriptEnabled: false,

    /** @type {String} the name of the typescript file to generate */
    __typescriptFile: null,

    /**
     * @override
     * @param {qx.tool.compiler.ICompilerInterface.CompilerData} data 
     */
    async start(data) {      
      this.__data = data;
      let configDb = await qx.tool.compiler.cli.ConfigDb.getInstance();
      if (data["feedback"] === null) {
        data["feedback"] = configDb.db("qx.default.feedback", true);
      }
      
      if (data.verbose) {
        console.log(`
          Compiler:  v${qx.tool.config.Utils.getCompilerVersion()}
          Framework: v${await this.getQxVersion()} in ${await this.getQxPath()}
        `);
      }

      if (data["machineReadable"]) {
        qx.tool.compiler.Console.getInstance().setMachineReadable(true);
      }

      let controller = await this._loadConfigAndCreateController();
      controller.addListener("allMakersMade", () => this.fireEvent("made"));
      this.__controller = controller;
      controller.start();
    },

    /**
     * @param {qx.tool.compiler.ICompilerInterface.CompilerData} data 
     * @returns 
     */
    async compileOnce(data) {
      await this.start(data);
      return new Promise((resolve, reject) => {
        this.__controller.addListenerOnce("allMakersMade", resolve);
      });
    },
    /**
     * @override
     */
    stop() {
      return this.__controller.stop();
    },

    /**
     * @override
     * @returns {Object[]}
     */
    getMakers() {
      const serializeTarget = target => ({
        type: target.getType(),
        outputDir: target.getOutputDir(),
        deployDir: target.getDeployDir?.() ?? null
      });

      const serializeApp = app => {
        let out = qx.util.Serializer.toNativeObject(app);
        out.projectDir = app.getProjectDir();
        out.browserApp = app.isBrowserApp();
        out.className = app.getClassName();
        return out;
      }

      const serializeMaker = maker => {
        let out = {
          ...qx.util.Serializer.toNativeObject(maker),
          target: serializeTarget(maker.getTarget()),
          applications: maker.getApplications().map(serializeApp)
        };
        return out;
      };
      return this.__makers.map(serializeMaker);
    },

    async _loadConfigAndCreateController() {
      var config = this.__data.config;
      var makers = (this.__makers = await this._createMakersFromConfig());
      if (!makers || !makers.length) {
        throw new qx.tool.utils.Utils.UserError("Error: Cannot find anything to make");
      }

      let controller = new qx.tool.compiler.Controller(this.__data.nJobs).set({
        metaDir: this.__metaDir
      });

      let countMaking = 0;

      new qx.tool.compiler.feedback.ConsoleFeedback(controller);

      await qx.Promise.all(
        makers.map(async maker => {
          var analyzer = maker.getAnalyzer();
          let cfg = await qx.tool.compiler.cli.ConfigDb.getInstance();
          analyzer.setWritePoLineNumbers(cfg.db("qx.translation.strictPoCompatibility", false));

          if (!(await fs.existsAsync(maker.getOutputDir()))) {
            this.__outputDirWasCreated = true;
          }
          if (this.__data["clean"]) {
            await maker.eraseOutputDir();
            await qx.tool.utils.files.Utils.safeUnlink(analyzer.getDbFilename());

            await qx.tool.utils.files.Utils.safeUnlink(analyzer.getResDbFilename());
          }
          if (config.ignores) {
            analyzer.setIgnores(config.ignores);
          }

          maker.addListener("writtenApplication", async evt => {
            await this.fireDataEventAsync("writtenApplication", evt.getData().application.getName());
          });

          let stat = await qx.tool.utils.files.Utils.safeStat("source/index.html");

          if (stat) {
            qx.tool.compiler.Console.print("qx.tool.cli.compile.legacyFiles", "source/index.html");
          }

          // Simple one of make
          if (!this.__data.watch) {
            maker.addListener("making", () => {
              countMaking++;
              if (countMaking == 1) {
                this.fireEvent("making");
              }
            });
            maker.addListener("made", () => {
              countMaking--;
              if (countMaking == 0) {
                this.fireEvent("made");
              }
            });
          }

          controller.addMaker(maker);
        })
      );

      return controller;
    },
    /**
     * Processes the configuration from a JSON data structure and creates a Maker
     *
     * @param {Object} config
     * @return {Promise<qx.tool.compiler.Maker[]>}
     */
    async _createMakersFromConfig() {
      let data = this.__data;
      let config = data.config;
      const Console = qx.tool.compiler.Console.getInstance();

      if (config.babelOptions) {
        if (!config?.babel?.options) {
          config.babel = config.babel || {};
          config.babel.options = config.babelOptions;
          qx.tool.compiler.Console.print("qx.tool.cli.compile.deprecatedBabelOptions");
        } else {
          qx.tool.compiler.Console.print("qx.tool.cli.compile.deprecatedBabelOptionsConflicting");
        }
        delete config.babelOptions;
      }

      if (qx.lang.Type.isBoolean(config?.meta?.typescript)) {
        this.__typescriptEnabled = config.meta.typescript;
      } else if (qx.lang.Type.isString(config?.meta?.typescript)) {
        this.__typescriptEnabled = true;
        this.__typescriptFile = path.relative(process.cwd(), path.resolve(config?.meta?.typescript));
      }
      if (qx.lang.Type.isBoolean(data.typescript)) {
        this.__typescriptEnabled = data.typescript;
      }

      var argvAppNames = null;
      if (config["app-name"]) {
        argvAppNames = {};
        config["app-name"].split(",").forEach(name => (argvAppNames[name] = true));
      }
      var argvAppGroups = null;
      if (config["app-group"]) {
        argvAppGroups = {};
        config["app-group"].split(",").forEach(name => (argvAppGroups[name] = true));
      }

      /*
       * Calculate the the list of targets and applications; this is a many to many list, where an
       * application can be compiled for many targets, and each target has many applications.
       *
       * Each target configuration is updated to have `appConfigs[]` and each application configuration
       * is updated to have `targetConfigs[]`.
       */

      //Ensure we only consider the compiler target if we are in compilerOnly mode, and the opposite if we're not
      config.targets = config.targets.filter(targetConfig => !!data.compilerOnly === !!targetConfig.compiler);
      config.targets.forEach((targetConfig, index) => (targetConfig.index = index));

      let targetConfigs = [];
      let defaultTargetConfig = null;
      config.targets.forEach(targetConfig => {
        if (targetConfig.type === data.targetType) {
          if (!targetConfig["application-names"] && !targetConfig["application-types"]) {
            if (defaultTargetConfig) {
              qx.tool.compiler.Console.print("qx.tool.cli.compile.multipleDefaultTargets");
            } else {
              defaultTargetConfig = targetConfig;
            }
          } else {
            targetConfigs.push(targetConfig);
          }
        }
      });

      let allAppNames = {};
      config.applications.forEach((appConfig, index) => {
        //Ensure we only consider the compiler application if we are in compilerOnly mode, and the opposite if we're not
        if (!!data.compilerOnly !== !!appConfig.compiler) {
          return;
        }

        if (appConfig.name) {
          if (allAppNames[appConfig.name]) {
            throw new qx.tool.utils.Utils.UserError(`Multiple applications with the same name '${appConfig.name}'`);
          }
          allAppNames[appConfig.name] = appConfig;
        }
        if (appConfig.group) {
          if (typeof appConfig.group == "string") {
            appConfig.group = [appConfig.group];
          }
        }
        appConfig.index = index;
        let appType = appConfig.type || "browser";
        let appTargetConfigs = targetConfigs.filter(targetConfig => {
          let appTypes = targetConfig["application-types"];
          if (appTypes && !qx.lang.Array.contains(appTypes, appType)) {
            return false;
          }

          let appNames = targetConfig["application-names"];
          if (appConfig.name && appNames && !qx.lang.Array.contains(appNames, appConfig.name)) {
            return false;
          }
          return true;
        });

        if (appTargetConfigs.length == 0) {
          if (defaultTargetConfig) {
            appTargetConfigs = [defaultTargetConfig];
          } else {
            throw new qx.tool.utils.Utils.UserError(
              `Cannot find any suitable targets for application #${index} (named ${appConfig.name || "unnamed"})`
            );
          }
        }

        appTargetConfigs.forEach(targetConfig => {
          if (!targetConfig.appConfigs) {
            targetConfig.appConfigs = [];
          }
          targetConfig.appConfigs.push(appConfig);
          if (!appConfig.targetConfigs) {
            appConfig.targetConfigs = [];
          }
          appConfig.targetConfigs.push(targetConfig);
        });
      });
      if (defaultTargetConfig && defaultTargetConfig.appConfigs) {
        targetConfigs.push(defaultTargetConfig);
      }

      let libraries = (this.__libraries = {});

      for await (const lib of data.libs) {
        var library = await qx.tool.compiler.app.Library.createLibrary(lib);

        libraries[library.getNamespace()] = library;
      }

      // Search for Qooxdoo library if not already provided
      var qxLib = libraries["qx"];
      if (!qxLib) {
        let qxPath = await qx.tool.config.Utils.getQxPath();
        var library = await qx.tool.compiler.app.Library.createLibrary(qxPath);
        libraries[library.getNamespace()] = library;
        qxLib = libraries["qx"];
      }
      if (data.verbose) {
        Console.log("Qooxdoo found in " + qxLib.getRootDir());
      }
      let errors = await this.__checkDependencies(Object.values(libraries), config.packages);

      if (errors.length > 0) {
        if (data.warnAsError) {
          throw new qx.tool.utils.Utils.UserError(errors.join("\n"));
        } else {
          qx.tool.compiler.Console.log(errors.join("\n"));
        }
      }

      /*
       * Figure out which will be the default application; this will need some work for situations
       * where there are multiple browser based targets
       */
      targetConfigs.forEach(targetConfig => {
        let hasExplicitDefaultApp = false;
        targetConfig.defaultAppConfig = null;
        if (targetConfig.appConfigs) {
          targetConfig.appConfigs.forEach(appConfig => {
            if (appConfig.type && appConfig.type != "browser") {
              return;
            }

            let setDefault;
            if (appConfig.writeIndexHtmlToRoot !== undefined) {
              qx.tool.compiler.Console.print(
                "qx.tool.cli.compile.deprecatedCompileSeeOther",
                "application.writeIndexHtmlToRoot",
                "application.default"
              );

              setDefault = appConfig.writeIndexHtmlToRoot;
            } else if (appConfig["default"] !== undefined) {
              setDefault = appConfig["default"];
            }

            if (setDefault !== undefined) {
              if (setDefault) {
                if (hasExplicitDefaultApp) {
                  throw new qx.tool.utils.Utils.UserError("Error: Can only set one application to be the default application!");
                }
                hasExplicitDefaultApp = true;
                targetConfig.defaultAppConfig = appConfig;
              }
            } else if (!targetConfig.defaultAppConfig) {
              targetConfig.defaultAppConfig = appConfig;
            }
          });
          if (!hasExplicitDefaultApp && targetConfig.appConfigs.length > 1) {
            targetConfig.defaultAppConfig = targetConfig.appConfigs[0];
          }
        }
      });

      /*
       * There is still only one target per maker, so convert our list of targetConfigs into an array of makers
       */
      let targetOutputPaths = {};
      let makers = [];

      this.__metaDir = config.meta?.output;
      if (!this.__metaDir) {
        this.__metaDir = path.relative(process.cwd(), path.resolve(targetConfigs[0].outputPath, "../meta"));
      }

      targetConfigs.forEach(targetConfig => {
        if (!targetConfig.appConfigs) {
          qx.tool.compiler.Console.print("qx.tool.cli.compile.unusedTarget", targetConfig.type, targetConfig.index);

          return;
        }
        let appConfigs = targetConfig.appConfigs.filter(appConfig => {
          if (argvAppGroups) {
            let groups = appConfig.group || [];
            if (!groups.find(groupName => !!argvAppGroups[groupName])) {
              return false;
            }
          }
          if (argvAppNames && appConfig.name) {
            if (!argvAppNames[appConfig.name]) {
              return false;
            }
          }
          return true;
        });
        if (!appConfigs.length) {
          return;
        }

        var outputPath = targetConfig.outputPath;
        if (data.outputPathPrefix) {
          outputPath = path.join(data.outputPathPrefix, outputPath);
        }
        if (!outputPath) {
          throw new qx.tool.utils.Utils.UserError("Missing output-path for target " + targetConfig.type);
        }
        let absOutputPath = path.resolve(outputPath);
        if (targetOutputPaths[absOutputPath]) {
          throw new qx.tool.utils.Utils.UserError(
            `Multiple output targets share the same target directory ${outputPath} - each target output must be unique`
          );
        }
        targetOutputPaths[absOutputPath] = true;

        var maker = new qx.tool.compiler.Maker();
        if (!data["erase"]) {
          maker.setNoErase(true);
        }

        var TargetClass = targetConfig.targetClass ? this.resolveTargetClass(targetConfig.targetClass) : null;
        if (!TargetClass && targetConfig.type) {
          TargetClass = this.resolveTargetClass(targetConfig.type);
        }
        if (!TargetClass) {
          throw new qx.tool.utils.Utils.UserError("Cannot find target class: " + (targetConfig.targetClass || targetConfig.type));
        }
        /* eslint-disable new-cap */
        var target = new TargetClass(outputPath);
        /* eslint-enable new-cap */
        if (targetConfig.uri) {
          qx.tool.compiler.Console.print("qx.tool.cli.compile.deprecatedUri", "target.uri", targetConfig.uri);
        }
        if (targetConfig.addTimestampsToUrls !== undefined) {
          target.setAddTimestampsToUrls(targetConfig.addTimestampsToUrls);
        } else {
          target.setAddTimestampsToUrls(target instanceof qx.tool.compiler.targets.BuildTarget);
        }
        if (targetConfig.writeCompileInfo || data.writeCompileInfo) {
          target.setWriteCompileInfo(true);
        }
        if (config.i18nAsParts) {
          target.setI18nAsParts(true);
        }
        target.setWriteLibraryInfo(data.writeLibraryInfo);
        target.setUpdatePoFiles(data.updatePoFiles);
        target.setLibraryPoPolicy(data.libraryPo);

        let fontsConfig = targetConfig.fonts || {};
        let preferLocalFonts = true;

        if (data.localFonts !== undefined) {
          preferLocalFonts = data.localFonts;
        } else if (fontsConfig.local !== undefined) {
          preferLocalFonts = fontsConfig.local;
        }
        target.setPreferLocalFonts(preferLocalFonts);
        if (fontsConfig.fontTypes !== undefined) {
          target.setFontTypes(fontsConfig.fontTypes);
        }
        // Take the command line for `minify` as most precedent only if provided
        var minify;
        if (process.argv.indexOf("--minify") > -1) {
          minify = data["minify"];
        }
        minify = minify || targetConfig["minify"] || data["minify"];
        if (typeof minify == "boolean") {
          minify = minify ? "minify" : "off";
        }
        if (!minify) {
          minify = "mangle";
        }
        if (typeof target.setMinify == "function") {
          target.setMinify(minify);
        }

        function chooseValue(...args) {
          for (let i = 0; i < args.length; i++) {
            if (args[i] !== undefined) {
              return args[i];
            }
          }
          return undefined;
        }

        // Take the command line for `saveSourceInMap` as most precedent only if provided
        var saveSourceInMap = chooseValue(targetConfig["save-source-in-map"], data["saveSourceInMap"]);

        if (typeof saveSourceInMap == "boolean" && typeof target.setSaveSourceInMap == "function") {
          target.setSaveSourceInMap(saveSourceInMap);
        }

        var sourceMapRelativePaths = chooseValue(targetConfig["source-map-relative-paths"], data["sourceMapRelativePaths"]);

        if (typeof sourceMapRelativePaths == "boolean" && typeof target.setSourceMapRelativePaths == "function") {
          target.setSourceMapRelativePaths(sourceMapRelativePaths);
        }

        var saveUnminified = chooseValue(targetConfig["save-unminified"], data["save-unminified"]);

        if (typeof saveUnminified == "boolean" && typeof target.setSaveUnminified == "function") {
          target.setSaveUnminified(saveUnminified);
        }

        var inlineExternal = chooseValue(targetConfig["inline-external-scripts"], data["inline-external-scripts"]);

        if (typeof inlineExternal == "boolean") {
          target.setInlineExternalScripts(inlineExternal);
        } else if (target instanceof qx.tool.compiler.targets.BuildTarget) {
          target.setInlineExternalScripts(true);
        }

        var deployDir = targetConfig["deployPath"];
        if (deployDir && typeof target.setDeployDir == "function") {
          target.setDeployDir(deployDir);
        }

        var deployMap = targetConfig["deploy-source-maps"];
        if (typeof deployMap == "boolean" && typeof target.setDeployDir == "function") {
          target.setDeployMap(deployMap);
        }

        maker.setTarget(target);

        var manglePrivates = chooseValue(targetConfig["mangle-privates"], data["mangle-privates"]);

        if (typeof manglePrivates == "string") {
          maker.getAnalyzer().setManglePrivates(manglePrivates);
        } else if (typeof manglePrivates == "boolean") {
          if (manglePrivates) {
            maker.getAnalyzer().setManglePrivates(target instanceof qx.tool.compiler.targets.BuildTarget ? "unreadable" : "readable");
          } else {
            maker.getAnalyzer().setManglePrivates("off");
          }
        }

        if (targetConfig["application-types"]) {
          maker.getAnalyzer().setApplicationTypes(targetConfig["application-types"]);
        }


        maker.setLocales(config.locales || ["en"]);
        if (config.writeAllTranslations) {
          maker.setWriteAllTranslations(config.writeAllTranslations);
        }

        if (typeof targetConfig.typescript == "string") {
          Console.warn(
            "The 'typescript' property inside a target definition is deprecated - please see top level 'meta.typescript' property"
          );

          if (this.__typescriptFile) {
            Console.warn(
              "Multiple conflicting locations for the Typescript output - choosing to write to " +
                this.__typescriptFile +
                " and NOT " +
                targetConfig.typescript
            );
          } else {
            this.__typescriptEnabled = true;
            this.__typescriptFile = path.relative(process.cwd(), path.resolve(targetConfig.typescript));
          }
        }

        if (config.environment) {
          maker.setEnvironment(config.environment);
        }
        if (targetConfig.environment) {
          target.setEnvironment(targetConfig.environment);
        }

        for (let ns in libraries) {
          maker.getAnalyzer().addLibrary(libraries[ns]);
        }

        let targetEnvironment = {
          "qx.version": maker.getAnalyzer().getQooxdooVersion(),
          "qx.compiler.targetType": target.getType(),
          "qx.compiler.outputDir": target.getOutputDir(),
          "qx.target.privateArtifacts": !!config["private-artifacts"]
        };
        if (config["private-artifacts"]) {
          target.setPrivateArtifacts(true);
        }

        qx.lang.Object.mergeWith(targetEnvironment, targetConfig.environment, false);
        target.setEnvironment(targetEnvironment);

        if (targetConfig.preserveEnvironment) {
          target.setPreserveEnvironment(targetConfig.preserveEnvironment);
        }

        if (config["path-mappings"]) {
          for (var from in config["path-mappings"]) {
            var to = config["path-mappings"][from];
            target.addPathMapping(from, to);
          }
        }

        function mergeArray(dest, ...srcs) {
          srcs.forEach(function (src) {
            if (src) {
              src.forEach(function (elem) {
                if (!qx.lang.Array.contains(dest, src)) {
                  dest.push(elem);
                }
              });
            }
          });
          return dest;
        }

        let babelConfig = qx.lang.Object.clone(config.babel || {}, true);
        babelConfig.options = babelConfig.options || {};
        qx.lang.Object.mergeWith(babelConfig.options, targetConfig.babelOptions || {});

        maker.getAnalyzer().setBabelConfig(babelConfig);

        let browserifyConfig = qx.lang.Object.clone(config.browserify || {}, true);
        browserifyConfig.options = browserifyConfig.options || {};
        qx.lang.Object.mergeWith(browserifyConfig.options, targetConfig.browserifyOptions || {});
        maker.getAnalyzer().setBrowserifyConfig(browserifyConfig);

        var addCreatedAt = targetConfig["addCreatedAt"] || data["addCreatedAt"];
        if (addCreatedAt) {
          maker.getAnalyzer().setAddCreatedAt(true);
        }
        const verboseCreatedAt = targetConfig["verboseCreatedAt"] || data["verboseCreatedAt"];
        if (verboseCreatedAt) {
          maker.getAnalyzer().setVerboseCreatedAt(true);
        }

        let allApplicationTypes = {};
        appConfigs.forEach(appConfig => {
          var app = (appConfig.app = new qx.tool.compiler.app.Application(appConfig["class"]));

          app.setTemplatePath(qx.tool.utils.Utils.getTemplateDir());

          [
            "type",
            "theme",
            "name",
            "environment",
            "outputPath",
            "bootPath",
            "loaderTemplate",
            "publish",
            "deploy",
            "standalone",
            "localModules"
          ].forEach(name => {
            if (appConfig[name] !== undefined) {
              var fname = "set" + qx.lang.String.firstUp(name);
              app[fname](appConfig[name]);
            }
          });
          allApplicationTypes[app.getType()] = true;
          if (appConfig.uri) {
            qx.tool.compiler.Console.print("qx.tool.cli.compile.deprecatedUri", "application.uri", appConfig.uri);
          }
          if (appConfig.title) {
            app.setTitle(appConfig.title);
          }
          if (appConfig.description) {
            app.setDescription(appConfig.description);
          }
          appConfig.localModules = appConfig.localModules || {};
          qx.lang.Object.mergeWith(appConfig.localModules, config.localModules || {}, false);

          if (!qx.lang.Object.isEmpty(appConfig.localModules)) {
            app.setLocalModules(appConfig.localModules);
          }

          var parts = appConfig.parts || targetConfig.parts || config.parts;
          if (parts) {
            if (!parts.boot) {
              throw new qx.tool.utils.Utils.UserError(
                "Cannot determine a boot part for application " + (appConfig.index + 1) + " " + (appConfig.name || "")
              );
            }
            for (var partName in parts) {
              var partData = parts[partName];
              var include = typeof partData.include == "string" ? [partData.include] : partData.include;
              var exclude = typeof partData.exclude == "string" ? [partData.exclude] : partData.exclude;
              var part = new qx.tool.compiler.app.Part(partName, include, exclude).set({
                combine: Boolean(partData.combine),
                minify: Boolean(partData.minify)
              });

              app.addPart(part);
            }
          }

          if (target.getType() == "source" && data.bundling) {
            var bundle = appConfig.bundle || targetConfig.bundle || config.bundle;
            if (bundle) {
              if (bundle.include) {
                app.setBundleInclude(bundle.include);
              }
              if (bundle.exclude) {
                app.setBundleExclude(bundle.exclude);
              }
            }
          }

          app.set({
            exclude: mergeArray([], config.exclude, targetConfig.exclude, appConfig.exclude),
            include: mergeArray([], config.include, targetConfig.include, appConfig.include)
          });

          maker.addApplication(app);
        });

        const ClassFile = qx.tool.compiler.ClassFile;
        let globalSymbols = [];
        qx.lang.Array.append(globalSymbols, ClassFile.QX_GLOBALS);
        qx.lang.Array.append(globalSymbols, ClassFile.COMMON_GLOBALS);
        if (allApplicationTypes["browser"]) {
          qx.lang.Array.append(globalSymbols, ClassFile.BROWSER_GLOBALS);
        }
        if (allApplicationTypes["node"]) {
          qx.lang.Array.append(globalSymbols, ClassFile.NODE_GLOBALS);
        }
        if (allApplicationTypes["rhino"]) {
          qx.lang.Array.append(globalSymbols, ClassFile.RHINO_GLOBALS);
        }
        maker.getAnalyzer().setGlobalSymbols(globalSymbols);

        if (
          targetConfig.defaultAppConfig &&
          targetConfig.defaultAppConfig.app &&
          (targetConfig.defaultAppConfig.type || "browser") === "browser"
        ) {
          targetConfig.defaultAppConfig.app.setWriteIndexHtmlToRoot(true);
        } else {
          qx.tool.utils.files.Utils.safeUnlink(target.getOutputDir() + "index.html");
        }

        makers.push(maker);
      });

      return makers;
    },
    /**
     * Resolves the target class instance from the type name; accepts "source" or "build" or
     * a class name
     * @param type {String}
     * @returns {qx.tool.compiler.Maker}
     */
    resolveTargetClass(type) {
      if (!type) {
        return null;
      }
      if (type.$$type == "Class") {
        return type;
      }
      if (type == "build") {
        return qx.tool.compiler.targets.BuildTarget;
      }
      if (type == "source") {
        return qx.tool.compiler.targets.SourceTarget;
      }
      if (type) {
        var TargetClass;
        if (type.indexOf(".") < 0) {
          TargetClass = qx.Class.getByName("qx.tool.compiler.targets." + type);
        } else {
          TargetClass = qx.Class.getByName(type);
        }
        return TargetClass;
      }
      return null;
    },

    /**
     * Checks the dependencies of the current library
     * @param  {qx.tool.compiler.app.Library[]} libs
     *    The list of libraries to check
     * @param {Object|*} packages
     *    If given, an object mapping library uris to library paths
     * @return {Promise<Array>} Array of error messages
     * @private
     */
    async __checkDependencies(libs, packages) {
      const Console = qx.tool.compiler.Console.getInstance();
      let data = this.__data;
      let errors = [];
      // check all requires
      for (let lib of libs) {
        let requires = lib.getRequires();
        if (!requires) {
          requires = {};
        }
        if (!packages) {
          packages = {};
        }
        // check for qooxdoo-range
        let range = lib.getLibraryInfo()["qooxdoo-range"];
        if (range) {
          if (data.verbose) {
            Console.warn(
              `${lib.getNamespace()}: The configuration setting "qooxdoo-range" in Manifest.json has been deprecated in favor of "requires.@qooxdoo/framework".`
            );
          }
          if (!requires["@qooxdoo/framework"]) {
            requires["@qooxdoo/framework"] = range;
          }
        }

        // Find the libraries that we need, not including the libraries which we have been given explicitly
        //  in the compile.json's `libraries` property
        let requires_uris = Object.getOwnPropertyNames(requires).filter(uri => !libs.find(lib => lib.getLibraryInfo().name === uri));

        let urisToInstall = requires_uris.filter(name => name !== "@qooxdoo/framework" && name !== "@qooxdoo/compiler");

        let pkg_libs = Object.getOwnPropertyNames(packages);
        if (urisToInstall.length > 0 && pkg_libs.length === 0) {
          // if we don't have package data
          if (data.download) {
            if (!fs.existsSync(qx.tool.config.Manifest.config.fileName)) {
              Console.error(
                "Libraries are missing and there is no Manifest.json in the current directory so we cannot attempt to install them; the missing libraries are: \n     " +
                  urisToInstall.join("\n     ") +
                  "\nThe library which refers to the missing libraries is " +
                  lib.getNamespace() +
                  " in " +
                  lib.getRootDir()
              );

              process.exit(1);
            }
            // but we're instructed to download the libraries
            if (data.verbose) {
              Console.info(`>>> Installing latest compatible version of libraries ${urisToInstall.join(", ")}...`);
            }
            const installer = new qx.tool.cli.commands.package.Install({
              verbose: data.verbose,
              save: false // save to lockfile only, not to manifest
            });
            await installer.process();
            throw new qx.tool.utils.Utils.UserError(
              `Library ${lib.getNamespace()} requires ${urisToInstall.join(
                ","
              )} - we have tried to download and install these additional libraries, please restart the compilation.`
            );
          } else {
            throw new qx.tool.utils.Utils.UserError("No library information available. Try 'qx compile --download'");
          }
        }

        for (let reqUri of requires_uris) {
          let requiredRange = requires[reqUri];
          const rangeIsCommitHash = /^[0-9a-f]{40}$/.test(requiredRange);
          switch (reqUri) {
            case "@qooxdoo/compiler":
              // ignore
              break;
            case "@qooxdoo/framework": {
              let qxVersion = await data.qxVersion;
              if (!semver.satisfies(qxVersion, requiredRange, { loose: true })) {
                errors.push(`${lib.getNamespace()}: Needs @qooxdoo/framework version ${requiredRange}, found ${qxVersion}`);
              }
              break;
            }
            // github repository release or commit-ish identifier
            default: {
              let l = libs.find(entry => path.relative("", entry.getRootDir()) === packages[reqUri]);

              if (!l) {
                errors.push(`${lib.getNamespace()}: Cannot find required library '${reqUri}'`);

                break;
              }
              // github release of a package
              let libVersion = l.getLibraryInfo().version;
              if (!semver.valid(libVersion, { loose: true })) {
                if (!data.quiet) {
                  Console.warn(`${reqUri}: Version is not valid: ${libVersion}`);
                }
              } else if (rangeIsCommitHash) {
                if (!data.quiet) {
                  Console.warn(`${reqUri}: Cannot check whether commit hash ${requiredRange} corresponds to version ${libVersion}`);
                }
              } else if (!semver.satisfies(libVersion, requiredRange, { loose: true })) {
                errors.push(`${lib.getNamespace()}: Needs ${reqUri} version ${requiredRange}, found ${libVersion}`);
              }
              break;
            }
          }
        }
      }
      return errors;
    }
  },
  defer(statics) {
    qx.tool.compiler.Console.addMessageIds({
      "qx.tool.compiler.cli.compile.minifyingApplication": "Minifying %1 %2",
      "qx.tool.compiler.cli.compile.compiledClass": "Compiled class %1 in %2s",
      "qx.tool.compiler.cli.compile.makeBegins": "Making applications...",
      "qx.tool.compiler.cli.compile.makeEnds": "Applications are made"
    });

    qx.tool.compiler.Console.addMessageIds(
      {
        "qx.tool.cli.compile.multipleDefaultTargets": "Multiple default targets found!",
        "qx.tool.cli.compile.unusedTarget": "Target type %1, index %2 is unused",
        "qx.tool.cli.compile.selectingDefaultApp":
          "You have multiple applications, none of which are marked as 'default'; the first application named %1 has been chosen as the default application",
        "qx.tool.cli.compile.legacyFiles": "File %1 exists but is no longer used",
        "qx.tool.cli.compile.deprecatedCompile": "The configuration setting %1 in compile.json is deprecated",
        "qx.tool.cli.compile.deprecatedCompileSeeOther": "The configuration setting %1 in compile.json is deprecated (see %2)",
        "qx.tool.cli.compile.deprecatedUri":
          "URIs are no longer set in compile.json, the configuration setting %1=%2 in compile.json is ignored (it's auto detected)",
        "qx.tool.compiler.cli.compile.deprecatedProvidesBoot":
          "Manifest.Json no longer supports provides.boot - only Applications can have boot; specified in %1",
        "qx.tool.cli.compile.deprecatedBabelOptions": "Deprecated use of `babelOptions` - these should be moved to `babel.options`",
        "qx.tool.cli.compile.deprecatedBabelOptionsConflicting":
          "Conflicting use of `babel.options` and the deprecated `babelOptions` (ignored)"
      },

      "warning"
    );
  }
});
