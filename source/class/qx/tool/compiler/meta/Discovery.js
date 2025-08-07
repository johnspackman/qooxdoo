const path = require("path");
const fs = require("fs");
const chokidar = require("chokidar");

/**
 * Discovery is used to discover classes in a project by watching specified paths for changes.
 */
qx.Class.define("qx.tool.compiler.meta.Discovery", {
  extend: qx.core.Object,

  construct() {
    super();
    this.__classes = {};
    this.__paths = [];
  },

  events: {
    /** Fired when a class is added to the discovery, data is {ClassMeta} */
    classAdded: "qx.event.type.Data",

    /** Fired when a class is added to the discovery, data is {ClassMeta} */
    classRemoved: "qx.event.type.Data",

    /** Fired when a class file changes, data is {ClassMeta} */
    classChanged: "qx.event.type.Data",

    /** Fired when the discovery process is starting */
    starting: "qx.event.type.Event",

    /** Fired when the discover process has completed it initial scan and is watching for changes */
    started: "qx.event.type.Event"
  },

  members: {
    __started: false,

    /**
     * @typedef ClassMeta
     * @property {String} classname - The name of the class
     * @property {String} packageName - The package name of the class
     * @property {String[]} filenames - The list of filenames where the class is defined
     * @property {Date} lastModified - The last modified timestamp of the class file
     *
     * @type {Object<String, ClassMeta>} list of ClassMeta objects, indexed by classname
     */
    __classes: null,

    /** @type{Array<String>} paths that need to be searched / watched */
    __paths: null,

    /**
     * @typedef WatchedPath
     * @property {String} path - The path to watch
     * @property {chokidar.FSWatcher} watcher - The chokidar watcher instance
     *
     * @type {Object<String, WatchedPath>} list of WatchedPath objects, incdexed by path
     */
    __watchedPaths: null,

    /**
     * Adds a path to the discovery process. The path can be a directory or a file.
     *
     * @param {String} filename
     */
    addPath(filename) {
      if (this.__started) {
        throw new Error("Cannot add paths after discovery has started.");
      }
      this.__paths.push(filename);
    },

    /**
     * Starts the discovery process by watching the specified paths for changes
     */
    async start() {
      if (this.__started) {
        throw new Error("Discovery has already been started.");
      }
      this.fireEvent("starting");
      this.__started = true;
      this.__watchedPaths = {};
      for (let filename of this.__paths) {
        filename = path.resolve(filename);
        let stat = null;
        try {
          stat = await fs.promises.stat(filename);
        } catch (ex) {
          if (ex.code === "ENOENT") {
            this.warn(`Directory ${filename} does not exist.`);
            continue;
          }
          throw ex;
        }
        let confirmedName = await qx.tool.utils.files.Utils.correctCase(filename);
        let watcher = chokidar.watch(confirmedName, {
          //ignored: /(^|[\/\\])\../
        });
        let watchedPath = {
          path: confirmedName,
          watcher: watcher,
          ready: false
        };
        this.__watchedPaths[confirmedName] = watchedPath;

        watcher.on("change", filename => this.__onFileChange("change", filename, confirmedName));
        watcher.on("add", filename => this.__onFileChange("add", filename, confirmedName));
        watcher.on("unlink", filename => this.__onFileChange("unlink", filename, confirmedName));
        watcher.on("ready", () => {
          qx.tool.compiler.Console.log(`Start watching ${confirmedName}...`);
          watchedPath.ready = true;
        });
        watcher.on("error", err => {
          qx.tool.compiler.Console.print(
            err.code == "ENOSPC" ? "qx.tool.cli.watch.enospcError" : "qx.tool.cli.watch.watchError",
            err
          );
        });
      }

      // Scans a directory recursively to find all .js files
      const scanImpl = async (directoryName, rootDir) => {
        let packageName = path.relative(rootDir, directoryName);
        packageName = packageName.split(path.sep);
        packageName = packageName.join(".");

        let filenames = await fs.promises.readdir(directoryName);
        for (let i = 0; i < filenames.length; i++) {
          let filename = filenames[i];
          let fullFilename = path.join(directoryName, filename);
          let stat = await fs.promises.stat(fullFilename);
          if (stat.isDirectory()) {
            if (filename[0] != ".") {
              await scanImpl(fullFilename, rootDir);
            }
          } else if (stat.isFile()) {
            if (filename.endsWith(".js")) {
              let classname = path.basename(filename, ".js");
              if (packageName.length) {
                classname = packageName + "." + classname;
              }
              this.__classes[classname] = {
                filenames: [fullFilename],
                lastModified: stat.mtime,
                packageName: packageName,
                classname: classname
              };
            }
          }
        }
      };

      for (let watchedPath of Object.values(this.__watchedPaths)) {
        await scanImpl(watchedPath.path, watchedPath.path);
      }
      this.fireEvent("started");
    },

    async stop() {
      let watchedPaths = Object.values(this.__watchedPaths);
      this.__watchedPaths = {};
      for (let watchedPath of watchedPaths) {
        if (watchedPath.watcher) {
          await watchedPath.watcher.close();
        }
      }
      this.fireEvent("stopped");
    },

    /**
     * Returns the list of discovered classes
     *
     * @returns {ClassMeta[]} list of ClassMeta objects for all discovered classes
     */
    getDiscoveredClasses() {
      return Object.values(this.__classes);
    },

    /**
     * Returns the ClassMeta object for the given classname
     *
     * @param {String} classname
     * @returns {ClassMeta|null} the ClassMeta object for the given classname, or null if not found
     */
    getDiscoveredClass(classname) {
      return this.__classes[classname] || null;
    },

    /**
     * Called when a file change is detected
     *
     * @param {"added"|"unlink"|"change"} event
     * @param {String} filename filename of the changed file
     * @param {String} rootDir teh dircetory where the file is located (used to determine the package name)
     */
    __onFileChange(event, filename, rootDir) {
      let packageName = path.relative(rootDir, filename);
      packageName = packageName.split(path.sep);
      packageName.pop();
      packageName = packageName.join(".");
      let classname = path.basename(filename, ".js");
      if (packageName.length) {
        classname = packageName + "." + classname;
      }

      if (event == "unlink") {
        if (this.__classes[classname]) {
          this.fireDataEvent("classRemoved", classname);
          delete this.__classes[classname];
        }
      } else if (event == "add") {
        if (filename.endsWith(".js")) {
          let stat = fs.statSync(filename);
          this.__classes[classname] = {
            filenames: [filename],
            lastModified: stat.mtime,
            packageName: packageName,
            classname: classname
          };
          this.fireDataEvent("classAdded", classname);
        }
      } else if (event == "change") {
        this.fireDataEvent("classChanged", classname);
      }
    }
  }
});
