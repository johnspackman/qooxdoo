/* ************************************************************************
 *
 *    qooxdoo-compiler - node.js based replacement for the Qooxdoo python
 *    toolchain
 *
 *    https://github.com/qooxdoo/qooxdoo
 *
 *    Copyright:
 *      2011-2025 Zenesis Limited, http://www.zenesis.com
 *
 *    License:
 *      MIT: https://opensource.org/licenses/MIT
 *
 *      This software is provided under the same licensing terms as Qooxdoo,
 *      please see the LICENSE file in the Qooxdoo project's top-level directory
 *      for details.
 *
 *    Authors:
 *      * John Spackman (john.spackman@zenesis.com, @johnspackman)
 *
 * *********************************************************************** */

const fs = require("fs");
const path = require("upath");

/**
 * Controller for managing the discovery of class files, reading their metadata,
 * compiling them for targets, and relaying information about modifications to the
 * makers
 * 
 * @use(qx.tool.compiler.qxx.Preprocessor)
 * 
 * @typedef {Object} SourceInfo Information regarding the source file to be compiled
 * @property {string} classname
 * @property {string} filename Absolute path of source file
 * @property {string} source The source code itself
 * @property {string} manglePrefix The prefix used for mangling privates to make them distinct across different classes
 * 
 * 
 * @typedef {Object} MakerInfo
 * @property {qx.tool.compiler.ISourceTransformer?} transformer
 * @property {qx.tool.compiler.ClassFileConfig} classFileConfig
 * 
 * @typedef {{ dbClassInfo: qx.tool.compiler.ClassFile.DbClassInfo, cached: boolean}} CompilationResult
 * 
 */
qx.Class.define("qx.tool.compiler.Controller", {
  extend: qx.core.Object,

  /**
   *
   * @param {Object} options Options for the controller
   * 
   * @typedef {Object} Options
   * @property {string} metaDir The directory where the meta database is stored
   * @property {number} [nTranspilerThreads] The number of threads to use for transpilation.  If not specified, will default to the number of CPU cores.  If set to 0 or a negative number, transpilation will be done in the main thread.
   * @property {boolean} [typescriptEnabled] Whether to enable TypeScript generation
   * @property {string} [typescriptFile] The output file for the generated TypeScript definitions (only applicable if typescriptEnabled is true).  Defaults to "qooxdoo.d.ts" in the parent directory of metaDir.
   */
  construct(options) {
    super();
    this.__libraries = {};
    this.__makers = [];
    this.__discovery = new qx.tool.compiler.meta.Discovery();
    this.__dbClassInfoCache = {};
    this.__changedFiles = {};
    this.__compilingClasses = {};
    this.__dirtyClasses = {};
    this.__dirtyMakers = {};
    this.__makingMakers = {};

    this.__metaDb = new qx.tool.compiler.meta.MetaDatabase().set({
      rootDir: options.metaDir
    });

    if (options.nTranspilerThreads == null || options.nTranspilerThreads > 0) {
      this.__transpilerPool = new qx.tool.compiler.TranspilerPool(options.nTranspilerThreads);
    }

    if (options.typescriptEnabled) {
      this.__typescriptEnabled = true;
      this.__typescriptWriter = new qx.tool.compiler.targets.TypeScriptWriter(this.__metaDb);
      this.__typescriptWriter.setOutputTo(options.typescriptFile ?? path.join(options.metaDir, "..", "qooxdoo.d.ts"));
    }

    this.__watch = !!options.watch;
  },

  events: {
    /**
     * Fired when the watcher detects changes to the source files
     */
    changesDetected: "qx.event.type.Event",
    /** Fired when a maker is added, data is the `qx.tool.compiler.Maker` */
    addMaker: "qx.event.type.Data",

    /** Fired when a class needs to be recompiled, the data is the classname */
    classNeedsToBeCompiled: "qx.event.type.Data",

    /**
     * @typedef {Object} CompilingClassEventData
     * @property {String} classname - The classname being compiled
     * @property {qx.tool.compiler.Analyzer} analyzer - The analyzer for the class
     *
     * Fired when a class is being compiled, the data is {CompilingClassEventData}
     */
    compilingClass: "qx.event.type.Data",

    /** Fired when a class needs to be recompiled, the data is {CompilingClassEventData} */
    compiledClass: "qx.event.type.Data",

    /**
     * Fired after writing of all meta data; data is an object containing:
     *   maker {qx.tool.compiler.Maker}
     */
    writtenMetaData: "qx.event.type.Data",

    /** Fired when everything has been built and the controller is now idle */
    allMakersMade: "qx.event.type.Event",

    /** Fired when starting */
    starting: "qx.event.type.Event",

    /** Fired when startup is complete, initial compile has finished, and watching for changes */
    started: "qx.event.type.Event",
    metaDbLoaded: "qx.event.type.Event",
    discoveryStarted: "qx.event.type.Event",
    metaDbConfiguring: "qx.event.type.Event",
    metaDbConfigured: "qx.event.type.Event",
    addedDiscoveredClasses: "qx.event.type.Event"
  },

  members: {
    /**
     * Whether this controller has encountered an error during calling the `start()` method
     */
    __startError: false,
    /**
     * Whether to watch for file changes
     */
    __watch: false,

    isWatch() {
      return this.__watch;
    },
    /**
     * Whether TypeScript generation has been enabled
     */
    __typescriptEnabled: false,

    /**
     * @type {qx.tool.compiler.targets.TypeScriptWriter|null}
     * The TypeScript writer instance, responsible for generating TypeScript definitions
     */
    __typescriptWriter: null,
    /**
     * @type {Object.<string, '+' | '-'>} List of changed files, indexed by file name,
     * with value "+" for added/changed files and "-" for removed files
     * These are for the classes that have been queued up for compilation but are not yet being compiled
     */
    __changedFiles: null,
    /**
     * @type {qx.tool.compiler.TranspilerPool}
     * The pool of transpiler workers which invoke Babel to do the transpilation
     */
    __transpilerPool: null,
    /**
     * @type {qx.tool.compiler.meta.MetaDatabase}
     */
    __metaDb: null,
    /** @type {Object<String, qx.tool.compiler.app.Library} */
    __libraries: null,

    /** @type {qx.tool.compiler.Maker[]} list of makers */
    __makers: null,

    /** @type {Object<string,qx.tool.compiler.ClassFile.DbClassInfo>} list of cached dbClassInfo, indexed by a hash key which is the target directory and classname, eg "source:mypkg.MyClass" */
    __dbClassInfoCache: null,

    /** @type {Object<String,Promise>} classes currently being compiled, index by hash of target directory and classname eg "source:mypkg.MyClass" */
    __compilingClasses: null,

    /** @type {Object<String,Boolean>} classes which are dirty and must be recompiled */
    __dirtyClasses: null,

    /** @type {Object<String,qx.tool.compiler.Maker>} list of makers which need to be 'made', indexed by hash code */
    __dirtyMakers: null,

    /** @type {Object<String,Promise>} list of makers currently making, indexed by hash code */
    __makingMakers: null,

    /**
     * Adds a maker to the discovery process, which will then
     * add all libraries that the maker uses to the discovery.
     */
    addMaker(maker) {
      this.__makers.push(maker);
      maker.getAnalyzer().setController(this);
      for (let lib of maker.getAnalyzer().getLibraries()) {
        this.addLibrary(lib);
      }
      this.fireDataEvent("addMaker", maker);
    },

    /**
     * Adds a library to the discovery process.
     *
     * @param {qx.tool.compiler.app.Library} lib
     */
    addLibrary(lib) {
      if (this.__libraries[lib.getNamespace()]) {
        return;
      }

      let dir = path.join(lib.getRootDir(), lib.getSourcePath());
      try {
        let stat = fs.statSync(dir);
        if (stat.isDirectory()) {
          this.__discovery.addPath(dir);
          this.__libraries[lib.getNamespace()] = lib;
        }
      } catch (ex) {
        if (ex.code !== "ENOENT") {
          throw ex; // rethrow if it's not a "file not found" error
        }
      }
    },

    /**
     * Starts the discovery process, which will scan the libraries and
     * populate the meta database with class metadata, and trigger events
     * as files are added/edited/removed.
     */
    async start() {
      let metaDb = this.__metaDb;

      this.fireEvent("starting");
      await metaDb.load();
      this.fireEvent("metaDbLoaded");
      await this.__discovery.start();
      this.fireEvent("discoveryStarted");

      // Store the libraries in the meta database
      this.fireEvent("metaDbConfiguring");
      metaDb.getDatabase().libraries = {};
      let environmentChecks = {};
      for (let lib of Object.values(this.__libraries)) {
        let dir = path.join(lib.getRootDir(), lib.getSourcePath());
        metaDb.getDatabase().libraries[lib.getNamespace()] = {
          sourceDir: dir
        };
        let libChecks = lib.getEnvironmentChecks();
        for (let checkName in libChecks) {
          environmentChecks[checkName] = libChecks[checkName];
        }
      }
      metaDb.getDatabase().environmentChecks = environmentChecks;
      this.fireEvent("metaDbConfigured");

      // Scan the discovered classes and add them to the meta database
      let discoveredFiles = this.__discovery.getDiscoveredFiles();
      let addMetaResults = await Promise.all(discoveredFiles.map(file => metaDb.fastAddFile(file, false)));
      this.__startError ??= addMetaResults.any(x => !x);
      this.fireEvent("addedDiscoveredClasses");

      
      /**
       * Updates the meta database and compiles the classes that have been queued up
       */

      let debounceProcessChangedFiles = new qx.util.Debounce(() => this.__processChangedFiles(), 100);

      /**
       * Adds a class to the compilation queue
       * @param {qx.event.type.Data} evt
       */
      const onFileChange = async evt => {
        let filename = evt.getData();
        this.__changedFiles[filename] = '+';
        debounceProcessChangedFiles.trigger();
      };

      if (this.__watch) {        
        this.__discovery.addListener("fileAdded", onFileChange);
        this.__discovery.addListener("fileChanged", onFileChange);
        this.__discovery.addListener("fileRemoved", async evt => {
          let filename = evt.getData();
          this.__changedFiles[filename] = "-";
          debounceProcessChangedFiles.trigger();
        });
      }

      // Process the meta data and save to disk
      await metaDb.reparseAll();
      await metaDb.save();
      await this.fireDataEventAsync("writtenMetaData", metaDb);

      if (this.__typescriptEnabled) {
        qx.tool.compiler.Console.info(`Generating typescript output ...`);
        await this.__typescriptWriter.process();
      }

      if (this.__transpilerPool) {
        await this.__transpilerPool.waitForAllReady();
        await this.__transpilerPool.callAll("updateClassMeta", [this.__metaDb.getSerialized()]);
      }

      let makers = this.__makers;

      //If we are using Node workers, we need to send the maker info to the workers
      let infoByMaker = {};
      
      await Promise.all(
        makers.map(async maker => {
          makers.push(maker);
          await maker.init();
          if (this.__transpilerPool) {
            infoByMaker[maker.toHashCode()] = {
              classFileConfig: maker.getAnalyzer().getClassFileConfig().serialize(),
              transformerClass: maker.getTransformerClass()
            };
          }

          if (maker.getTransformer()) {
            await maker.getTransformer().init(metaDb);
          }
        })
      );

      if (this.__transpilerPool) {
        await this.__transpilerPool.callAll("setMakerInfo", [infoByMaker]);
      }
      
      for (let maker of makers) {
        this.__makeMaker(maker);
      }
      this.fireEvent("started");
    },

    /**
     * 
     * @returns {boolean}
     */
    hasStartError() {
      return this.__startError;
    },

    async stop() {
      await this.__discovery.stop();
      if (this.__transpilerPool) {
        this.__transpilerPool.dispose();
      }
    },

    /**
     * Regenerates the meta database with the file changes,
     * generates the TypeScript file if TypeScript is enabled,
     * and triggers recompilation
     * @returns 
     */
    async __processChangedFiles() {
      let metaDb = this.__metaDb;
      this.fireEvent("changesDetected");
      let changedFiles = this.__changedFiles;
      let added = [];
      this.__changedFiles = {};

      await Promise.all(Object.entries(changedFiles).map(async ([filename, changeType]) => {        
        if (changeType === "+") {
          let classname = this.__discovery.getClassnameForFile(filename);
          added.push(classname);
          await metaDb.addFile(filename, true);
        } else {
          await metaDb.removeFile(filename);
        }
      }));

      await metaDb.reparseAll();
      await metaDb.save();

      if (this.__typescriptEnabled) {
        qx.tool.compiler.Console.logVerbose(`Generating typescript output ...`);
        await this.__typescriptWriter.process();
      }

      let compilationRequired = false;
      for (let maker of this.__makers) {
        for (let app of maker.getApplications()) {
          let dependencies = app.getDependencies() || [];
          for (let classname of added) {
            if (dependencies.includes(classname) || app.getRequiredClasses().includes(classname) || app.getTheme() == classname) {
              compilationRequired = true;
              let hashKey = maker.getAnalyzer().toHashCode() + ":" + classname;
              this.__dirtyClasses[hashKey] = true;
              this.compileClass(maker.getAnalyzer(), classname, true);
              this.fireDataEvent("classNeedsToBeCompiled", { maker, classname });
              break;
            }
          }
        }
      }

      if (!compilationRequired) {
        this.fireEvent("allMakersMade");
      }
    },

    /**
     * Handler for when a class has been compiled.
     *
     * @param {qx.tool.compiler.Analyzer} analyzer
     * @param {String} classname
     * @param {CompilationResult} result Result of the compilation
     */
    _onClassCompiled(analyzer, classname, result) {      
      if (!result.cached) {
        this.fireDataEvent("compiledClass", { classname, analyzer });
        for (let maker of this.__makers) {
          if (maker.getAnalyzer() === analyzer) {
            for (let app of maker.getApplications()) {
              let dependencies = app.getDependencies() || [];
              if (dependencies.includes(classname) || app.getRequiredClasses().includes(classname) || app.getTheme() == classname) {
                this.__dirtyMakers[maker.toHashCode()] = maker;
                break;
              }
            }
          }
        }
      }

      //Only print the markers when we are making,
      //because all the classes get re-checked anyway when we make
      //and this will prevent duplicated markers being printed
      if (Object.keys(this.__makingMakers).length > 0) {
        let markers = result.dbClassInfo.markers;
        if (markers) {
          markers.forEach(function (marker) {
            var str = qx.tool.compiler.Console.decodeMarker(marker);
            qx.tool.compiler.Console.warn(classname + ": " + str + ` (${analyzer.getMaker().getTarget().getOutputDir()})`);
          });
        }
      }

      let makers = Object.values(this.__dirtyMakers);
      if (makers.length === 0 || Object.keys(this.__compilingClasses).length != 0) {
        return;
      }
      this.__dirtyMakers = {};
      for (let maker of makers) {
        this.__makeMaker(maker);
      }
    },

    __makeMaker(maker) {
      let hashKey = maker.toHashCode();
      if (this.__makingMakers[hashKey]) {
        return this.__makingMakers[hashKey];
      }

      let promise = maker.make();
      promise = promise
        .then(() => {
          delete this.__makingMakers[hashKey];
          if (
            Object.keys(this.__makingMakers).length === 0 &&
            Object.keys(this.__dirtyMakers).length === 0 &&
            Object.keys(this.__compilingClasses).length === 0
          ) {
            if (this.__transpilerPool) {
              //after the initial build, we won't be using worker threads anymore (at least for now) to make things simpler
              this.__transpilerPool.dispose();
              this.__transpilerPool = null;
            }
            this.fireEvent("allMakersMade");
          }
          return true;
        })
        .catch(err => {
          delete this.__makingMakers[hashKey];
          console.error("Error making maker " + maker.toHashCode() + ": " + err.stack);
          process.exit(1);
        });

      this.__makingMakers[hashKey] = promise;
      return promise;
    },

    /**
     * Compiles a class for the given analyzer and classname.  If the class is already compiled,
     * it will return the cached information unless `force` is true.
     *
     * @param {qx.tool.compiler.Analyzer} analyzer
     * @param {String} classname
     * @param {Boolean} force
     * @returns {Promise<qx.tool.compiler.ClassFile.DbClassInfo>} the class information
     *
     */
    compileClass(analyzer, classname, force) {
      let hashKey = analyzer.toHashCode() + ":" + classname;
      let promise = this.__dirtyClasses[hashKey] ? null : this.__compilingClasses[hashKey];
      if (promise) {
        return promise;
      }
      delete this.__dirtyClasses[hashKey];

      promise = this.__compileClassImpl(analyzer, classname, force);
      promise = promise
        .then(result => {
          if (promise === this.__compilingClasses[hashKey]) {
            delete this.__compilingClasses[hashKey];
            this._onClassCompiled(analyzer, classname, result);
            return result.dbClassInfo;
          } else {
            return this.__compilingClasses[hashKey];
          }
        })
        .catch(err => {
          delete this.__compilingClasses[hashKey];
          qx.tool.compiler.Console.error("Unhandled exception while compiling class " + classname + ": " + err.stack);
          return { fatalCompileError: true };
        });
      this.__compilingClasses[hashKey] = promise;
      return promise;
    },

    /**
     * Find a library for a given classname
     *
     * @param {String} classname
     * @returns {qx.tool.compiler.app.Library?} the library for the given classname, or null if not found
     */
    findLibraryForClassname(classname) {
      let metaDb = this.getMetaDb();
      let classmeta = metaDb.getMetaData(classname);
      if (!classmeta) {
        return null;
      }
      let filename = classmeta.classFilename;
      filename = path.resolve(path.join(metaDb.getRootDir(), filename));
      for (let library of Object.values(this.__libraries)) {
        let libRootDir = path.resolve(library.getRootDir());
        if (filename.startsWith(libRootDir)) {
          return library;
        }
      }
      return null;
    },

    /**
     * Implements the actual compilation of a class.
     *
     * @param {qx.tool.compiler.Analyzer} analyzer
     * @param {String} classname
     * @param {Boolean} force
     * @returns {Promise<CompilationResult>}
     */
    async __compileClassImpl(analyzer, classname, force) {
      let meta = this.__metaDb.getMetaData(classname);
      if (!meta) {
        qx.tool.compiler.Console.error(`Cannot find class ${classname} in project/libraries.`);
        return { dbClassInfo: { fatalCompileError: true } };
      }

      let sourceFilename = path.resolve(path.join(this.__metaDb.getRootDir(), meta.classFilename));
      let outputDir = analyzer.getMaker().getTarget().getOutputDir();
      let outputFilename = path.join(outputDir, "transpiled", classname.replace(/\./g, path.sep) + ".js");

      let jsonFilename = path.join(outputDir, "transpiled", classname.replace(/\./g, path.sep) + ".json");
      let hashKey = outputDir + ":" + classname;
      let dbClassInfo = this.__dbClassInfoCache[hashKey] || null;
      let sourceStat = await qx.tool.utils.files.Utils.safeStat(sourceFilename);

      if (!sourceStat) {
        throw new Error(`Source file for class ${classname} not found: ${sourceFilename}`);
      }

      if (!dbClassInfo) {
        if (fs.existsSync(jsonFilename)) {
          dbClassInfo = await qx.tool.utils.Json.loadJsonAsync(jsonFilename);
        }
      }

      if (!dbClassInfo) {
        dbClassInfo = {};
      }
      
      this.__dbClassInfoCache[hashKey] = dbClassInfo;

      if (!force) {
        let outputStat = await qx.tool.utils.files.Utils.safeStat(outputFilename);

        if (dbClassInfo && outputStat) {
          var dbMtime = null;
          try {
            dbMtime = dbClassInfo.mtime && new Date(dbClassInfo.mtime);
          } catch (e) {}
          if (dbMtime && dbMtime.getTime() == sourceStat.mtime.getTime()) {
            if (outputStat.mtime.getTime() >= sourceStat.mtime.getTime()) {
              return { dbClassInfo, cached: true };
            }
          }
        }
      }

      this.fireDataEvent("compilingClass", { classname, analyzer });

      let library = this.findLibraryForClassname(classname);
      Object.assign(dbClassInfo, {
        mtime: sourceStat.mtime,
        libraryName: library.getNamespace(),
        filename: sourceFilename
      });

      let sourceInfo = {
        classname,
        sourceFilename: sourceFilename,
        outputFilename: outputFilename,
        manglePrefix: analyzer.getManglePrefix(classname)
      };


      let dbClassInfoNew;
      if (this.__transpilerPool) {
        dbClassInfoNew = await this.__transpilerPool.callMethod("transpile", [sourceInfo, analyzer.getMaker().toHashCode()]);
      } else {
        let makerInfo = {
          classFileConfig: analyzer.getClassFileConfig(),
          transformer: analyzer.getMaker().getTransformer()
        };
        dbClassInfoNew = await qx.tool.compiler.Controller.transpile(sourceInfo, makerInfo, this.__metaDb);
      }

      //Update dbClassInfo
      delete dbClassInfo.unresolved;
      delete dbClassInfo.dependsOn;
      delete dbClassInfo.assets;
      delete dbClassInfo.translations;
      delete dbClassInfo.markers;
      delete dbClassInfo.fatalCompileError;
      delete dbClassInfo.commonjsModules;

      for (var key in dbClassInfoNew) {
        dbClassInfo[key] = dbClassInfoNew[key];
      }
      
      await fs.promises.writeFile(jsonFilename, JSON.stringify(dbClassInfo, null, 2), "utf8");

      return { dbClassInfo, cached: false };
    },

    /**
     * @returns {qx.tool.compiler.meta.Discovery} the discovery instance
     */
    getDiscovery() {
      return this.__discovery;
    },

    getMetaDb() {
      return this.__metaDb;
    }
  },

  statics: {
    /**
     * Tranforms (if applicable), transpiles and writes output to disk
     * @param {SourceInfo} sourceInfo
     * @param {MakerInfo} makerInfo
     * @param {qx.tool.compiler.meta.MetaDatabase} metaDb
     * @returns {Promise<qx.tool.compiler.ClassFile.DbClassInfo>}
     */
    async transpile(sourceInfo, makerInfo, metaDb) {
      let { classFileConfig, transformer } = makerInfo;
      let { classname, outputFilename, sourceFilename } = sourceInfo;
      outputFilename = path.resolve(outputFilename);
      let source = await fs.promises.readFile(sourceFilename, "utf8");

      let transformed = false;
      if (metaDb.getTransformer() && metaDb.getTransformer().shouldTransform(sourceInfo)) {
        source = metaDb.getTransformer().transform({classname, filename: sourceFilename, source});
        transformed = true;
      }

      if (transformer && transformer.shouldTransform(sourceInfo)) {
        source = transformer.transform(sourceInfo);
        await fs.promises.mkdir(path.dirname(outputFilename), { recursive: true });
        sourceFilename = outputFilename.replace(/\.js$/, ".trans.js");
        fs.promises.writeFile(sourceFilename, source, "utf8"); //no need to await this because this only starts to matter once the user starts running and debugging
      }

      let cf = new qx.tool.compiler.ClassFile(metaDb, classFileConfig, classname, sourceInfo.manglePrefix);
      let compiled = cf.compile(source, sourceFilename);

      if (compiled.code) {
        let mappingUrl;
        if (classFileConfig.applicationTypes.includes("browser")) {
          mappingUrl = path.basename(outputFilename) + ".map?dt=" + Date.now();
        } else {
          mappingUrl = outputFilename + ".map";
        }

        await fs.promises.mkdir(path.dirname(outputFilename), { recursive: true });
        await fs.promises.writeFile(outputFilename, compiled.code + "\n\n//# sourceMappingURL=" + mappingUrl, "utf8");
        await fs.promises.writeFile(outputFilename + ".map", JSON.stringify(compiled.map, null, 2), "utf8");
      }
      return compiled.dbClassInfo;
    }
  }
});
