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
 * ClassMeta is used to load and save the metadata for a class.
 */
qx.Class.define("qx.tool.compiler.meta.ClassMeta", {
  extend: qx.core.Object,

  construct(metaRootDir) {
    super();
    this.setMetaRootDir(metaRootDir || null);
  },

  properties: {
    /** Root directory for meta data; if provided then paths are stored relative, not absolute, which helps make
     * meta directories relocatable
     */
    metaRootDir: {
      init: null,
      nullable: true,
      check: "String"
    }
  },

  members: {
    /** @type{Object} the parsed data*/
    __metaData: null,

    /**
     * Loads the meta from disk
     *
     * @param {String} filename
     */
    async loadMeta(filename) {
      let metaData = await qx.tool.utils.Json.loadJsonAsync(filename);
      if (metaData?.version === qx.tool.compiler.meta.StdClassParser.VERSION) {
        this.__metaData = metaData;
      } else {
        this.__metaData = null;
      }
    },

    /**
     * Saves the meta to disk
     *
     * @param {String} filename
     */
    async saveMeta(filename) {
      await qx.tool.utils.Utils.makeParentDir(filename);
      await qx.tool.utils.Json.saveJsonAsync(filename, this.__metaData);
    },

    /**
     * Returns the actual meta data
     *
     * @returns {*}
     */
    getMetaData() {
      return this.__metaData;
    },

    /**
     * Checks whether the meta data is out of date compared to the last modified
     * timestamp of the classname
     *
     * @returns {Boolean}
     */
    async isOutOfDate() {
      let classFilename = this.__metaData.classFilename;
      if (this.getMetaRootDir()) {
        classFilename = path.join(this.getMetaRootDir(), classFilename);
      }
      let stat = await fs.promises.stat(classFilename);
      let lastModified = this.__metaData?.lastModified;
      if (lastModified && lastModified == stat.mtime.getTime()) {
        return false;
      }
      return true;
    },

    /**
     * Parses the file and returns the metadata
     *
     * @param {String} classFilename the .js file to parse
     * @return {Object}
     */
    async parse(classFilename) {
      classFilename = await qx.tool.utils.files.Utils.correctCase(
        classFilename
      );
      let parser = new qx.tool.compiler.meta.StdClassParser();
      this.__metaData = await parser.parse(
        this.getMetaRootDir() || ".",
        classFilename
      );
      return this.__metaData;
    },

    /**
     * Fixes up the JSDoc entries in the metadata.
     *
     * This will parse the JSDoc comments and update the metadata to try and get a stable
     * set of types and parameters.  The typeResolver is used to resolve types, which cannot
     * be done until types are loaded, because the typeResolver may need to resolve types
     * based on the current class' package name etc
     *
     * @param {*} typeResolver
     */
    fixupJsDoc(typeResolver) {
      let metaData = this.__metaData;

      const fixupEntry = obj => {
        if (obj && obj.jsdoc) {
          qx.tool.compiler.jsdoc.Parser.parseJsDoc(obj.jsdoc, typeResolver);
          if (obj.jsdoc["@param"] && obj.params) {
            let paramsLookup = {};
            obj.params.forEach(param => {
              paramsLookup[param.name] = param;
            });
            obj.jsdoc["@param"].forEach(paramDoc => {
              let param = paramsLookup[paramDoc.paramName];
              if (param) {
                if (paramDoc.type) {
                  param.type = paramDoc.type;
                }
                if (paramDoc.optional !== undefined) {
                  param.optional = paramDoc.optional;
                }
                if (paramDoc.defaultValue !== undefined) {
                  param.defaultValue = paramDoc.defaultValue;
                }
              }
            });
          }
          let returnDoc = obj.jsdoc["@return"]?.[0];
          if (returnDoc) {
            obj.returnType = {
              type: returnDoc.type
            };

            if (returnDoc.optional !== undefined) {
              obj.returnType.optional = returnDoc.optional;
            }
            if (returnDoc.defaultValue !== undefined) {
              obj.returnType.defaultValue = returnDoc.defaultValue;
            }
          }
        }
      };

      const fixupSection = sectionName => {
        var section = metaData[sectionName];
        if (section) {
          for (var name in section) {
            fixupEntry(section[name]);
          }
        }
      };

      fixupSection("properties");
      fixupSection("events");
      fixupSection("members");
      fixupSection("statics");
      fixupEntry(metaData.clazz);
      fixupEntry(metaData.construct);
      fixupEntry(metaData.destruct);
      fixupEntry(metaData.defer);
    }
  }
});
