const path = require("path");
const fs = require("fs");

/**
 * Discovery is used to discover classes in a project by watching specified paths for changes.
 */
qx.Class.define("qx.tool.compiler.meta.Discovery", {
  extend: qx.core.Object,

  construct() {
    super();
    this.__classes = {};
  },

  events: {
    /** Fired when a class is added to the discovery, data is {ClassMeta} */
    classAdded: "qx.event.type.Data",

    /** Fired when a class is added to the discovery, data is {ClassMeta} */
    classRemoved: "qx.event.type.Data",

    /** Fired when a class file changes, data is {ClassMeta} */
    classChanged: "qx.event.type.Data"
  },

  members: {
    __started: false,

    /**
     * @typedef ClassMeta
     * @property {String} classname - The name of the class
     * @property {String} packageName - The package name of the class
     * @property {String[]} files - The list of files where the class is defined
     * @property {Date} lastModified - The last modified timestamp of the class file
     *
     * @type {Object<String, ClassMeta>} list of ClassMeta objects, indexed by classname
     */
    __classes: null,

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
        for (let i = 0; i < packageName.length; i++) {
          if (packageName[i] == path.sep) {
            packageName[i] = ".";
          }
        }

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
                files: [fullFilename],
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
     * Called when a file change is detected
     *
     * @param {"added"|"unlink"|"change"} event
     * @param {String} filename filename of the changed file
     * @param {String} rootDir teh dircetory where the file is located (used to determine the package name)
     */
    __onFileChange(event, filename, rootDir) {
      let packageName = path.relative(rootDir, filename);
      for (let i = 0; i < packageName.length; i++) {
        if (packageName[i] == path.sep) {
          packageName[i] = ".";
        }
      }
      let classname = path.basename(filename, ".js");
      if (packageName.length) {
        classname = packageName + "." + classname;
      }

      if (event == "unlink") {
        if (this.__classes[classname]) {
          delete this.__classes[classname];
          qx.tool.compiler.Console.log(`Removed class ${classname} from discovery.`);
          this.fireDataEvent("classRemoved", classname);
        }
      } else if (event == "add") {
        if (filename.endsWith(".js")) {
          let stat = fs.statSync(filename);
          this.__classes[classname] = {
            files: [filename],
            lastModified: stat.mtime,
            packageName: packageName,
            classname: classname
          };
          qx.tool.compiler.Console.log(`Added class ${classname} to discovery.`);
          this.fireDataEvent("classAdded", classname);
        }
      } else if (event == "change") {
        qx.tool.compiler.Console.log(`Detected change to class ${classname} in discovery.`);
        this.fireDataEvent("classChanged", classname);
      }
    }
  }
});
