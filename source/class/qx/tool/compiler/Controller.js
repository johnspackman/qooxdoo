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
 * @typedef {Object} CompileInfo
 * @property {DbClassInfo} dbClassInfo - the database class information
 * 
 * @typedef {Object} SourceInfo Information regarding the source file to be compiled
 * @property {string} classname
 * @property {string} filename Absolute path of source file
 * @property {string} source The source code itself
 * 
 * @typedef {Object} MakerInfo
 * @property {qx.tool.compiler.ISourceTransformer?} transformer
 * @property {qx.tool.compiler.ClassFileConfig} classFileConfig
 * 
 */
qx.Class.define("qx.tool.compiler.Controller", {
  extend: qx.core.Object,

  /**
   *
   * @param {number} nTranspilerThreads Number of threads to use for compilation
   */
  construct(nTranspilerThreads) {
    super();
    this.__libraries = {};
    this.__makers = [];
    this.__discovery = new qx.tool.compiler.meta.Discovery();
    this.__dbClassInfoCache = {};
    this.__toCompile = [];
    this.__compilingClasses = {};
    this.__dirtyClasses = {};
    this.__dirtyMakers = {};
    this.__makingMakers = {};
    if (nTranspilerThreads == null || nTranspilerThreads > 0) {
      this.__transpilerPool = new qx.tool.compiler.TranspilerPool(nTranspilerThreads);
    }
  },

  events: {
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

  properties: {
    metaDir: {
      check: "String",
      apply: "_applyMetaDir"
    }
  },

  members: {
    /**
     * @type {string[]}
     * The classes that have been queued up for compilation but are not yet being compiled
     */
    __toCompile: null,
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
     * Apply for `metaDir`
     */
    _applyMetaDir(value, old) {
      if (value) {
        this.__metaDb = new qx.tool.compiler.meta.MetaDatabase().set({
          rootDir: value
        });
      } else {
        this.__metaDb = null;
      }
    },

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
      let discoveredClasses = qx.lang.Array.clone(this.__discovery.getDiscoveredClasses());
      await qx.tool.utils.Promisify.poolEachOf(discoveredClasses, 20, async classmeta => {
        await metaDb.fastAddFile(classmeta.filenames.at(-1), false);
      });
      this.fireEvent("addedDiscoveredClasses");

      
      /**
       * Updates the meta database and compiles the classes that have been queued up
       */
      const recompile = async () => {
        //We must make sure nothing is compiling before we update the metaDb
        while (Object.keys(this.__compilingClasses).length > 0) {
          await this.__flushCompileQueue();
        }
        await metaDb.reparseAll();
        await metaDb.save();
        await this.__onMetaDbChanged();
        this.__toCompile.forEach(classname => this._onClassNeedsCompile(classname));
        this.__toCompile = [];        
      };

      /**
       * When we notice changes to the discovered classes,
       * if we are using workers for compilation,
       * we have to first wait for the workers to finish compiling and then notify the workers that the meta database has changed
       * before we compile the classes.
       * We use a debounces to batch the changed classes, and then after a timeout we update the meta database and begin compilation.
       * If we are not using workers (should be for debugging purposes only) then it still works the same way.
       */
      let debounce = new qx.tool.utils.Debounce(recompile, 100);

      /**
       * Adds a class to the compilation queue
       * @param {qx.event.type.Data} evt 
       */
      const onAdded = async evt => {
        let classname = evt.getData();
        let classmeta = this.__discovery.getDiscoveredClass(classname);
        let added = await metaDb.addFile(classmeta.filenames.at(-1), true);
        if (added) {
          this.__toCompile.push(classname);
          debounce.trigger();
        }
      };

      this.__discovery.addListener("classAdded", onAdded);
      this.__discovery.addListener("classChanged", onAdded);

      this.__discovery.addListener("classRemoved", async evt => {
        let classname = evt.getData();
        let classmeta = this.__discovery.getDiscoveredClass(classname);
        await metaDb.removeFile(classmeta.filenames.at(-1));
        debounce.trigger();
      });
      // Process the meta data and save to disk
      await metaDb.reparseAll();
      await metaDb.save();
      await this.fireDataEventAsync("writtenMetaData", metaDb);

      if (this.__transpilerPool) {
        await this.__transpilerPool.waitForAllReady();
      }
      await this.__onMetaDbChanged();

      let makers = this.__makers;

      //If we are using Node workers, we need to send the maker info to the workers
      let infoByMaker = {};
      
      await Promise.all(makers.map(async maker =>{
        makers.push(maker);
        await maker.init();
        if (this.__transpilerPool) {
          infoByMaker[maker.toHashCode()] = {
            classFileConfig: maker.getAnalyzer().getClassFileConfig().serialize(),
            transformerClass: maker.getTransformerClass()
          };
        } else if (maker.getTransformer()) { 
          //Only init the transformer if we are not using workers
          //because if we are then the workers will create and init the transformers themselves
          await maker.getTransformer().init();
        }
      }));

      if (this.__transpilerPool) {
        await this.__transpilerPool.callAll("setMakerInfo", [infoByMaker]);
      }
      
      for (let maker of makers) {
        this.__makeMaker(maker);
      }
      this.fireEvent("started");
    },

    async stop() {
      await this.__discovery.stop();
      if (this.__transpilerPool) {
        this.__transpilerPool.dispose();
      }
    },

    /**
     * Handler for when a class needs to be compiled.
     *
     * @param {String} classname
     */
    _onClassNeedsCompile(classname) {
      let analyzers = [];
      for (let maker of this.__makers) {
        for (let app of maker.getApplications()) {
          let dependencies = app.getDependencies() || [];
          if (dependencies.includes(classname) || app.getRequiredClasses().includes(classname) || app.getTheme() == classname) {
            analyzers.push(maker.getAnalyzer());
            let hashKey = maker.getTarget().getOutputDir() + ":" + classname;
            this.__dirtyClasses[hashKey] = true;
            break;
          }
        }
      }
      if (analyzers.length === 0) {
        return;
      }
      for (let analyzer of analyzers) {
        this.compileClass(analyzer, classname, true);
      }

      this.fireDataEvent("classNeedsToBeCompiled", classname);
    },

    /**
     * Returns a promise which resolves when all the currently compiling classes have finished
     */
    async __flushCompileQueue() {
      await Promise.all(Object.values(this.__compilingClasses));
    },

    /**
     * Handler for when a class has been compiled.
     *
     * @param {qx.tool.compiler.Analyzer} analyzer
     * @param {String} classname
     */
    _onClassCompiled(analyzer, classname) {
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
          if (promise === this.__makingMakers[hashKey]) {
            delete this.__makingMakers[hashKey];
            if (
              Object.keys(this.__makingMakers).length === 0 &&
              Object.keys(this.__dirtyMakers).length === 0 &&
              Object.keys(this.__compilingClasses).length === 0
            ) {
              console.log("All applications written.");
              this.fireEvent("allMakersMade");
            }
            return true;
          } else {
            delete this.__makingMakers[hashKey];
            return this.__makeMaker(maker);
          }
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
      let hashKey = analyzer.getMaker().getTarget().getOutputDir() + ":" + classname;
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
            if (!result.cached) {
              this._onClassCompiled(analyzer, classname);
            }
            return result.dbClassInfo;
          } else {
            return this.__compilingClasses[hashKey];
          }
        })
        .catch(err => {
          delete this.__compilingClasses[hashKey];
          console.error("Error compiling class " + classname + ": " + err.stack);
          return null;
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
     * @returns {Promise<CompileInfo>}
     */
    async __compileClassImpl(analyzer, classname, force) {
      let meta = this.__metaDb.getMetaData(classname);

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
        } else {
          dbClassInfo = {};
        }
        this.__dbClassInfoCache[hashKey] = dbClassInfo;
      }

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
        outputFilename: outputFilename
      };


      let compiled;
      if (this.__transpilerPool) {
        compiled = await this.__transpilerPool.callMethod("transpile", [sourceInfo, analyzer.getMaker().toHashCode()]);
      } else {
        let makerInfo = {
          classFileConfig: analyzer.getClassFileConfig(),
          transformer: analyzer.getMaker().getTransformer()
        };
        compiled = await qx.tool.compiler.Controller.transpile(sourceInfo, makerInfo, this.__metaDb);
      }

      //Update dbClassInfo
      delete dbClassInfo.unresolved;
      delete dbClassInfo.dependsOn;
      delete dbClassInfo.assets;
      delete dbClassInfo.translations;
      delete dbClassInfo.markers;
      delete dbClassInfo.fatalCompileError;
      delete dbClassInfo.commonjsModules;

      for (var key in compiled.dbClassInfo) {
        dbClassInfo[key] = compiled.dbClassInfo[key];
      }
      
      await fs.promises.writeFile(jsonFilename, JSON.stringify(dbClassInfo, null, 2), "utf8");

      let markers = dbClassInfo.markers;
      if (markers) {
        markers.forEach(function (marker) {
          var str = qx.tool.compiler.Console.decodeMarker(marker);
          console.warn(classname + ": " + str);
        });
      }

      return { dbClassInfo, cached: false };
    },

    async __onMetaDbChanged() {
      if (qx.core.Environment.get("qx.debug")) {
        this.assertEquals(0, Object.keys(this.__compilingClasses).length, "No classes should be compiling when calling onMetaDbChanged");
      }
      if (this.__transpilerPool) {
        await this.__transpilerPool.callAll("updateClassMeta", [this.__metaDb.getSerialized()]);
      }
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
     * @param {qx.tool.compiler.Controller.MakerInfo} makerInfo
     * @param {qx.tool.compiler.meta.MetaDatabase} metaDb
     * @returns {Promise<CompileInfo>}
     */
    async transpile(sourceInfo, makerInfo, metaDb) {
      let { classFileConfig, transformer } = makerInfo;
      let { classname, outputFilename, sourceFilename } = sourceInfo;
      outputFilename = path.resolve(outputFilename);
      let source = await fs.promises.readFile(sourceFilename, "utf8");

      if (transformer && transformer.shouldTransform(sourceInfo)) {
        source = transformer.transform(sourceInfo);
      }

      let cf = new qx.tool.compiler.ClassFile(metaDb, classFileConfig, classname);
      let compiled = cf.compile(source, sourceFilename);

      let mappingUrl;
      if (classFileConfig.applicationTypes.includes("browser")) {
        mappingUrl = path.basename(outputFilename) + ".map?dt=" + Date.now();
      } else {
        mappingUrl = outputFilename + ".map";
      }

      await fs.promises.mkdir(path.dirname(outputFilename), { recursive: true });
      if (compiled) {
        await fs.promises.writeFile(outputFilename, compiled.code + "\n\n//# sourceMappingURL=" + mappingUrl, "utf8");
        await fs.promises.writeFile(outputFilename + ".map", JSON.stringify(compiled.map, null, 2), "utf8");
      }
      return compiled ? { dbClassInfo: compiled.dbClassInfo } : null;
    }
  }
});
