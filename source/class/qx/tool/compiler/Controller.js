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
 */
qx.Class.define("qx.tool.compiler.Controller", {
  extend: qx.core.Object,

  construct() {
    super();
    this.__libraries = {};
    this.__makers = [];
    this.__discovery = new qx.tool.compiler.meta.Discovery();
    this.__dbClassInfoCache = {};
    this.__compilingClasses = {};
    this.__dirtyClasses = {};
    this.__dirtyMakers = {};
    this.__makingMakers = {};
  },

  events: {
    /** Fired when a maker is added, data is the `qx.tool.compiler.Maker` */
    addMaker: "qx.event.type.Data",

    /** Fired when a class needs to be recompiled, the data is the classname */
    classNeedsToBeCompiled: "qx.event.type.Data",

    /**
     * @typedef {Object} CompilingClassEventData
     * @property {String} classname - The classname being compiled
     * @property {qx.tool.compiler.Analyser} analyser - The analyser for the class
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
    started: "qx.event.type.Event"
  },

  properties: {
    metaDir: {
      check: "String",
      apply: "_applyMetaDir"
    }
  },

  members: {
    /** @type{Object<String, qx.tool.compiler.app.Library} */
    __libraries: null,

    /** @type{qx.tool.compiler.Maker[]} list of makers */
    __makers: null,

    /** @type{String,Object} list of cached dbClassInfo, indexed by a hash key which is the target directory and classname, eg "source:mypkg.MyClass" */
    __dbClassInfoCache: null,

    /** @type{String,Promise} classes currently being compiled, index by hash of target directory and classname eg "source:mypkg.MyClass" */
    __compilingClasses: null,

    /** @type{String,Boolean} classes which are dirty and must be recompiled */
    __dirtyClasses: null,

    /** @type{String,qx.tool.compiler.Maker} list of makers which need to be 'made', indexed by hash code */
    __dirtyMakers: null,

    /** @type{String,Promise} list of makers currently making, indexed by hash code */
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
      maker.getAnalyser().setController(this);
      for (let lib of maker.getAnalyser().getLibraries()) {
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
        await metaDb.fastAddFile(classmeta.filenames[classmeta.filenames.length - 1], false);
      });
      this.fireEvent("addedDiscoveredClasses");

      this.__discovery.addListener("classAdded", async evt => {
        let classname = evt.getData();
        let classmeta = this.__discovery.getDiscoveredClass(classname);
        await metaDb.addFile(classmeta.filenames[classmeta.filenames.length - 1], true);
        await metaDb.reparseAll();
        this._onClassNeedsCompile(classmeta.classname);
      });

      this.__discovery.addListener("classRemoved", async evt => {
        let classname = evt.getData();
        let classmeta = this.__discovery.getDiscoveredClass(classname);
        await metaDb.removeFile(classmeta.filenames[classmeta.filenames.length - 1]);
      });

      this.__discovery.addListener("classChanged", async evt => {
        let classname = evt.getData();
        let classmeta = this.__discovery.getDiscoveredClass(classname);
        await metaDb.addFile(classmeta.filenames[classmeta.filenames.length - 1], true);
        await metaDb.reparseAll();
        this._onClassNeedsCompile(classmeta.classname);
      });

      // Process the meta data and save to disk
      await metaDb.reparseAll();
      await metaDb.save();
      await this.fireDataEventAsync("writtenMetaData", metaDb);

      let makers = [];
      for (let maker of this.__makers) {
        if (!this.__dirtyMakers[maker.toHashCode()]) {
          makers.push(maker);
        }
      }
      for (let maker of makers) {
        await this.__makeMaker(maker);
      }
      this.fireEvent("started");
    },

    /**
     * Handler for when a class needs to be compiled.
     *
     * @param {String} classname
     */
    _onClassNeedsCompile(classname) {
      let analysers = [];
      for (let maker of this.__makers) {
        for (let app of maker.getApplications()) {
          let dependencies = app.getDependencies() || [];
          if (dependencies.includes(classname) || app.getRequiredClasses().includes(classname) || app.getTheme() == classname) {
            analysers.push(maker.getAnalyser());
            let hashKey = maker.getTarget().getOutputDir() + ":" + classname;
            this.__dirtyClasses[hashKey] = true;
            break;
          }
        }
      }
      if (analysers.length === 0) {
        return;
      }
      for (let analyser of analysers) {
        this.compileClass(analyser, classname, true);
      }

      // Notify the makers that the class needs to be compiled
      this.fireDataEvent("classNeedsToBeCompiled", classname);
    },

    _onClassCompiled(analyser, classname) {
      this.fireDataEvent("compiledClass", { classname, analyser });
      for (let maker of this.__makers) {
        if (maker.getAnalyser() === analyser) {
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
          throw err;
        });

      this.__makingMakers[hashKey] = promise;
      return promise;
    },

    /**
     * Compiles a class for the given analyser and classname.  If the class is already compiled,
     * it will return the cached information unless `force` is true.
     *
     * @param {qx.tool.compiler.Analyser} analyser
     * @param {String} classname
     * @param {Boolean} force
     * @returns {Object} the class information
     */
    async compileClass(analyser, classname, force) {
      let hashKey = analyser.getMaker().getTarget().getOutputDir() + ":" + classname;
      let promise = this.__dirtyClasses[hashKey] ? null : this.__compilingClasses[hashKey];
      if (promise) {
        return await promise;
      }
      delete this.__dirtyClasses[hashKey];

      promise = this.__compileClassImpl(analyser, classname, force);
      promise = promise
        .then(result => {
          if (promise === this.__compilingClasses[hashKey]) {
            delete this.__compilingClasses[hashKey];
            if (!result.cached) {
              this._onClassCompiled(analyser, classname);
            }
            return result.dbClassInfo;
          } else {
            return this.__compilingClasses[hashKey];
          }
        })
        .catch(err => {
          delete this.__compilingClasses[hashKey];
          console.error("Error compiling class " + classname + ": " + err.stack);
          throw err;
        });
      this.__compilingClasses[hashKey] = promise;
      return await promise;
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
     * @param {qx.tool.compiler.Analyser} analyser
     * @param {String} classname
     * @param {Boolean} force
     */
    async __compileClassImpl(analyser, classname, force) {
      let meta = this.__metaDb.getMetaData(classname);
      let compileConfig = qx.tool.compiler.ClassFileConfig.createFromAnalyser(analyser);

      let sourceClassFilename = path.join(this.__metaDb.getRootDir(), meta.classFilename);
      let outputDir = analyser.getMaker().getTarget().getOutputDir();
      let outputClassFilename = path.join(outputDir, "transpiled", classname.replace(/\./g, path.sep) + ".js");

      let jsonFilename = path.join(outputDir, "transpiled", classname.replace(/\./g, path.sep) + ".json");
      let hashKey = outputDir + ":" + classname;
      let dbClassInfo = this.__dbClassInfoCache[hashKey] || null;
      let sourceStat = await qx.tool.utils.files.Utils.safeStat(sourceClassFilename);

      if (!dbClassInfo && fs.existsSync(jsonFilename)) {
        dbClassInfo = await qx.tool.utils.Json.loadJsonAsync(jsonFilename);
        this.__dbClassInfoCache[hashKey] = dbClassInfo;
      }

      if (!force) {
        let outputStat = await qx.tool.utils.files.Utils.safeStat(outputClassFilename);

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

      this.fireDataEvent("compilingClass", { classname, analyser });

      let src = await fs.promises.readFile(sourceClassFilename, "utf8");
      let library = this.findLibraryForClassname(classname);
      dbClassInfo = {
        mtime: sourceStat.mtime,
        libraryName: library.getNamespace(),
        filename: sourceClassFilename
      };

      let classFile = new qx.tool.compiler.ClassFile(this.__metaDb, compileConfig, classname);
      let compiled = await classFile.compile(src, sourceClassFilename);
      classFile.writeDbInfo(dbClassInfo);

      let mappingUrl = path.basename(sourceClassFilename) + ".map";
      if (qx.lang.Array.contains(compileConfig.getApplicationTypes(), "browser")) {
        mappingUrl += "?dt=" + new Date().getTime();
      }

      await qx.tool.utils.Utils.mkParentDir(outputClassFilename);
      await fs.promises.writeFile(outputClassFilename, compiled.code + "\n\n//# sourceMappingURL=" + mappingUrl, "utf8");
      await fs.promises.writeFile(jsonFilename, JSON.stringify(dbClassInfo, null, 2), "utf8");
      await fs.promises.writeFile(outputClassFilename + ".map", JSON.stringify(compiled.map, null, 2), "utf8");

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
  }
});
