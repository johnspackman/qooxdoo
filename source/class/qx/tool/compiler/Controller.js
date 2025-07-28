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

  construct(progress) {
    super();
    this.__progress = progress;
    this.__libraries = {};
    this.__makers = [];
    this.__discovery = new qx.tool.compiler.meta.Discovery();
    this.__dbClassInfoCache = {};
    this.__compilingClasses = {};
    this.__dirtyClasses = {};
    this.__dirtyMakers = {};
  },

  properties: {
    metaDir: {
      check: "String"
    },

    typescriptFile: {
      init: null,
      check: "String",
      nullable: true
    },

    enableTypescript: {
      init: true,
      check: "Boolean"
    }
  },

  events: {
    /** Fired when a class needs to be recompiled, the data is the classname */
    compileClass: "qx.event.type.Data"
  },

  members: {
    /** @type{qx.tool.compiler.progress.AbstractProgress} the progress output */
    __progress: null,

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
     * Adds a maker to the discovery process, which will then
     * add all libraries that the maker uses to the discovery.
     */
    addMaker(maker) {
      maker.getAnalyser().setController(this);
      for (let lib of maker.getAnalyser().getLibraries()) {
        this.addLibrary(lib);
      }
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
     * Returns the list of libraries that have been added to the controller.
     *
     * @returns {qx.tool.compiler.app.Library[]}
     */
    getLibraries() {
      return Object.values(this.__libraries);
    },

    /**
     * Starts the discovery process, which will scan the libraries and
     * populate the meta database with class metadata, and trigger events
     * as files are added/edited/removed.
     */
    async start() {
      let metaDb = new qx.tool.compiler.meta.MetaDatabase().set({
        rootDir: this.getMetaDir()
      });
      await metaDb.load();
      this.__metaDb = metaDb;
      if (this.isEnableTypescript()) {
        this.__tsWriter = new qx.tool.compiler.targets.TypeScriptWriter(metaDb);
        if (this.getTypescriptFile()) {
          this.__tsWriter.setOutputTo(this.getTypescriptFile());
        } else {
          this.__tsWriter.setOutputTo(path.join(this.getMetaDir(), "..", "qooxdoo.d.ts"));
        }
      }

      await this.__discovery.start();

      // Store the libraries in the meta database
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

      // Scan the discovered classes and add them to the meta database
      let discoveredClasses = qx.lang.Array.clone(this.__discovery.getDiscoveredClasses());
      await qx.tool.utils.Promisify.poolEachOf(discoveredClasses, 20, async classmeta => {
        await metaDb.addFile(classmeta.filenames[classmeta.filenames.length - 1], false);
      });

      let pendingChanges = 0;
      const recompileClass = async classmeta => {
        pendingChanges++;
        await metaDb.addFile(classmeta.filenames[classmeta.filenames.length - 1], true);
        await metaDb.reparseAll();
        this._onClassNeedsCompile(classmeta.classname);
        pendingChanges--;
        if (pendingChanges === 0) {
          await this.__writeTypescriptDefinitions();
        }
      };

      this.__discovery.addListener("classAdded", async evt => await recompileClass(evt.getData()));
      this.__discovery.addListener("classChanged", async evt => await recompileClass(evt.getData()));

      this.__discovery.addListener("classRemoved", async evt => {
        let classmeta = evt.getData();
        await metaDb.removeFile(classmeta.filenames[classmeta.filenames.length - 1]);
      });

      // Process the meta data and save to disk
      await metaDb.reparseAll();
      await metaDb.save();
      await this.__writeTypescriptDefinitions();

      // Initial compile
      for (let maker of this.__makers) {
        this.__makeMaker(maker);
      }

      // Done
      await this.fireDataEventAsync("writtenMetaData", metaDb);
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
          if (app.getRequiredClasses().includes(classname) || app.getTheme() == classname) {
            analysers.push(maker.getAnalyser());
            let hashKey = maker.getAnalyser().getTarget().getOutputDir() + ":" + classname;
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
    },

    /**
     * Handler for when a class has been compiled.
     *
     * @param {qx.tool.compiler.Analyser} analyser
     * @param {String} classname
     */
    _onClassCompiled(analyser, classname) {
      this.__progress.update("class.compiled", classname);
      for (let maker of this.__makers) {
        if (maker.getAnalyser() === analyser) {
          maker.onClassCompiled(classname);
          for (let app of maker.getApplications()) {
            if (app.getRequiredClasses().includes(classname) || app.getTheme() == classname) {
              this.__dirtyMakers[maker.getHash()] = maker;
              break;
            }
          }
        }
      }

      const showMarkers = (classname, markers) => {
        if (markers) {
          markers.forEach(function (marker) {
            var str = qx.tool.compiler.Console.decodeMarker(marker);
            this.__progress.update("class.marker", classname, str);
          });
        }
      };

      let dbClassInfo = this.getDbClassInfo(analyser, classname);
      showMarkers(classname, dbClassInfo.markers);

      let makers = Object.values(this.__dirtyMakers);
      if (makers.length === 0 || Object.keys(this.__compilingClasses).length != 0) {
        return;
      }
      this.__dirtyMakers = {};
      let usedClasses = {};
      for (let maker of makers) {
        if (maker.getAnalyser() === analyser) {
          for (let app of maker.getApplications()) {
            for (let classname of app.getRequiredClasses()) {
              usedClasses[classname] = true;
            }
          }
        }
        this.__makeMaker(maker);
      }
      for (let tmpClassname in usedClasses) {
        if (tmpClassname != classname) {
          dbClassInfo = this.getDbClassInfo(analyser, tmpClassname);
          showMarkers(tmpClassname, dbClassInfo.markers);
        }
      }
      this.__progress.update("maker.writtenApps");
    },

    /**
     * Writes the TypeScript definitions if enabled.
     */
    async __writeTypescriptDefinitions() {
      if (this.isEnableTypescript()) {
        qx.tool.compiler.Console.info(`Generating typescript output ...`);
        await this.__tsWriter.process();
      }
    },

    /**
     * Called to make a Maker
     *
     * @param {qx.tool.compiler.Maker} maker
     */
    __makeMaker(maker) {
      let hashKey = maker.getHash();
      if (this.__makingMakers && this.__makingMakers[hashKey]) {
        return this.__makingMakers[hashKey];
      }

      let promise = maker.make();
      promise = promise.then(() => {
        if (promise === this.__makingMakers[hashKey]) {
          delete this.__makingMakers[hashKey];
          return true;
        } else {
          delete this.__makingMakers[hashKey];
          return this.__makeMaker(maker);
        }
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
      let hashKey = this.__getHashKey(analyser, classname);
      let promise = this.__dirtyClasses[hashKey] ? null : this.__compilingClasses[hashKey];
      if (promise) {
        return await promise;
      }
      delete this.__dirtyClasses[hashKey];

      promise = this.__compileClassImpl(analyser, classname, force);
      promise = promise.then(dbClassInfo => {
        if (promise === this.__compilingClasses[hashKey]) {
          delete this.__compilingClasses[hashKey];
          this._onClassCompiled(analyser, classname);
          return dbClassInfo;
        } else {
          return this.__compilingClasses[hashKey];
        }
      });
      this.__compilingClasses[hashKey] = promise;
      return await promise;
    },

    /**
     * Implements the actual compilation of a class.
     *
     * @param {qx.tool.compiler.Analyser} analyser
     * @param {String} classname
     * @param {Boolean} force
     */
    async __compileClassImpl(analyser, classname, force) {
      this.__progress.update("class.compiling", classname);

      let meta = this.__metaDb.getClassMeta(classname);
      let compileConfig = qx.tool.compiler.ClassFileConfig.createFromAnalyser(analyser);

      let sourceClassFilename = meta.classFilename;
      let outputDir = analyser.getTarget().getOutputDir();
      let outputClassFilename = path.join(outputDir, "transpiled", classname.replace(/\./g, path.sep) + ".js");

      let jsonFilename = path.join(outputDir, "transpiled", classname.replace(/\./g, path.sep) + ".json");
      let hashKey = this.__getHashKey(analyser, classname);
      let dbClassInfo = this.__dbClassInfoCache[hashKey] || null;

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
              return dbClassInfo;
            }
          }
        }
      }

      let src = await fs.promises.readFile(sourceClassFilename, "utf8");
      let sourceStat = await qx.tool.utils.files.Utils.safeStat(sourceClassFilename);
      dbClassInfo = {
        mtime: sourceStat.mtime,
        //libraryName: library.getNamespace(),
        filename: sourceClassFilename
      };

      let classFile = new qx.tool.compiler.ClassFile(this.__metaDb, compileConfig, classname);
      let compiled = classFile.compile(src);
      classFile.writeDbInfo(dbClassInfo);

      let mappingUrl = path.basename(sourceClassFilename) + ".map";
      if (qx.lang.Array.contains(compileConfig.getApplicationTypes(), "browser")) {
        mappingUrl += "?dt=" + new Date().getTime();
      }

      await qx.tool.utils.Utils.mkParentPath(outputClassFilename);
      await fs.promises.writeFile(outputClassFilename, compiled.source + "\n\n//# sourceMappingURL=" + mappingUrl, "utf8");
      await fs.promises.writeFile(jsonFilename, JSON.stringify(dbClassInfo, null, 2), "utf8");
      await fs.promises.writeFile(outputClassFilename + ".map", JSON.stringify(compiled.map, null, 2), "utf8");

      return dbClassInfo;
    },

    /**
     * Calculates the hash key for a class based on the analyser and classname.
     *
     * @param {qx.tool.compiler.Analyser} analyser
     * @param {String} classname
     * @returns {String} the hash key
     */
    __getHashKey(analyser, classname) {
      return analyser.getTarget().getOutputDir() + ":" + classname;
    },

    /**
     * Gets the compiled class information from the database for the given analyser and classname.
     *
     * @param {qx.tool.compiler.Analyser} analyser
     * @param {String} classname
     * @returns {Object|null} the class information from the database, or null if not found
     */
    async getDbClassInfo(analyser, classname) {
      let hashKey = this.__getHashKey(analyser, classname);

      if (this.__dbClassInfoCache[hashKey]) {
        return this.__dbClassInfoCache[hashKey];
      }

      let outputDir = analyser.getTarget().getOutputDir();
      let jsonFilename = path.join(outputDir, "transpiled", classname.replace(/\./g, path.sep) + ".json");
      let dbClassInfo = this.__dbClassInfoCache[hashKey] || null;
      if (!dbClassInfo && fs.existsSync(jsonFilename)) {
        dbClassInfo = await qx.tool.utils.Json.loadJsonAsync(jsonFilename);
        this.__dbClassInfoCache[hashKey] = dbClassInfo;
      }
      return dbClassInfo;
    }
  }
});
