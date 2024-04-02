/* ************************************************************************
 *
 *    qooxdoo-compiler - node.js based replacement for the Qooxdoo python
 *    toolchain
 *
 *    https://github.com/qooxdoo/qooxdoo-compiler
 *
 *    Copyright:
 *      2011-2021 Zenesis Limited, http://www.zenesis.com
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
 * ************************************************************************/

const path = require("upath");
const fs = require("fs");

/**
 * A Package is a collection of files and resources, used by either the boot process
 * or by one or more Parts
 */
qx.Class.define("qx.tool.compiler.targets.meta.Package", {
  extend: qx.core.Object,

  /**
   * Constructor
   */
  construct(appMeta, packageIndex) {
    super();
    this.__appMeta = appMeta;
    this.__packageIndex = packageIndex;
    this.__assets = [];
    this.__locales = {};
    this.__translations = {};
    this.__javascriptMetas = [];
    this.__classnames = [];
    this.__javascript = new qx.tool.compiler.targets.meta.PackageJavascript(
      this.__appMeta,
      this
    );
  },

  properties: {
    /** Whether to embed all the javascript into the one, main package .js file */
    embedAllJavascript: {
      init: false,
      check: "Boolean"
    },

    /** If true, this is generated on the fly and needs to be output */
    needsWriteToDisk: {
      init: true,
      check: "Boolean",
      apply: "_applyNeedsWriteToDisk"
    }
  },

  members: {
    /** @type {AppMeta} the AppMeta instance */
    __appMeta: null,

    /** @type {Integer} the package index, 0 == boot package */
    __packageIndex: -1,

    /** @type {qx.tool.compiler.resources.Asset[]} assets to be included in this package */
    __assets: null,

    /** @type {Map} locale data, indexed by locale ID */
    __locales: null,

    /** @type {Map} translations, indexed by message ID */
    __translations: null,

    /** @type {String[]} array of class names loaded by this package */
    __classnames: null,

    /** @type {AbstractJavascriptMeta[]} array of Javascript sources loaded by this package */
    __javascriptMetas: null,

    /** @type {AbstractJavascriptMeta} the javascript generated by this package */
    __javascript: null,

    /**
     * Detects whether this package is empty; packages can be added for a number
     * of reasons, but sometimes they don't actually end up with anything in them.
     *
     * Note that this is used to suppress the generation of an additional `package-*.js`
     * file in the output, and just means that the content of the file should be embedded
     * (or ignored) instead of written into that package file; however, there can still
     * be script files which need to be loaded by this package (and that is handled by
     * the index.js file)
     *
     * @return {Boolean}
     */
    isEmpty() {
      if (this.__assets.length > 0) {
        return false;
      }
      for (let localeId in this.__locales) {
        if (this.__locales[localeId]) {
          return false;
        }
      }
      for (let localeId in this.__translations) {
        if (this.__translations[localeId]) {
          return false;
        }
      }
      if (this.isEmbedAllJavascript()) {
        if (this.__javascriptMetas.length > 0) {
          return false;
        }
      }
      return true;
    },

    /**
     * Returns the package index
     *
     * @return {Integer}
     */
    getPackageIndex() {
      return this.__packageIndex;
    },

    /**
     * Adds an asset, expected to be unique
     *
     * @param asset {qx.tool.compiler.resources.Asset}
     */
    addAsset(asset) {
      this.__assets.push(asset);
    },

    /**
     * Returns the array of assets
     *
     * @return {qx.tool.compiler.resources.Asset[]}
     */
    getAssets() {
      return this.__assets;
    },

    /**
     * Adds locale data
     *
     * @param localeId {String}
     * @param localeData {Object}
     */
    addLocale(localeId, localeData) {
      this.__locales[localeId] = localeData;
    },

    /**
     * Returns locale data, as a map where the key is the locale ID
     *
     * @return {Map}
     */
    getLocales() {
      return this.__locales;
    },

    /**
     * Adds a translation
     *
     * @param localeId {String} locale ID
     * @param entry {Object} translation
     */
    addTranslationEntry(localeId, entry) {
      let translations = this.__translations[localeId];
      if (!translations) {
        this.__translations[localeId] = translations = {};
      }
      var msgstr = entry.msgstr;
      if (!qx.lang.Type.isArray(msgstr)) {
        msgstr = [msgstr];
      }
      if (msgstr[0]) {
        translations[entry.msgid] = msgstr[0];
      }
      if (entry.msgid_plural && msgstr[1]) {
        translations[entry.msgid_plural] = msgstr[1];
      }
    },

    /**
     * Returns a map of all translations, indexed by Locale ID
     *
     * @return {Object}
     */
    getTranslations() {
      return this.__translations;
    },

    /**
     * Adds a Javascript to be loaded by this package.  You typically need to
     * call `addClassname` also.
     *
     * @param jsMeta {AbstractJavascriptMeta}
     */
    addJavascriptMeta(jsMeta) {
      this.__javascriptMetas.push(jsMeta);
    },

    /**
     * Returns a list of all Javascripts to be loaded by this package
     *
     * @return {AbstractJavascriptMeta[]}
     */
    getJavascriptMetas() {
      return this.__javascriptMetas;
    },

    /**
     * Removes a Javascript
     *
     * @param jsMeta {AbstractJavascriptMeta} the javascript to remove
     */
    removeJavascriptMeta(jsMeta) {
      qx.lang.Array.remove(this.__javascriptMetas, jsMeta);
    },

    /**
     * Adds a classname to the list which is loaded by this package; this does not
     * cause the code to be loaded, @see {addJavascriptMeta}.
     *
     * @param classname {String}
     */
    addClassname(classname) {
      this.__classnames.push(classname);
    },

    /**
     * Returns a list of all classnames
     *
     * @return {String[]}
     */
    getClassnames() {
      return this.__classnames;
    },

    /**
     * Returns the AbstractJavascriptMeta for this Package
     *
     * @return {AbstractJavascriptMeta}
     */
    getJavascript() {
      return this.__javascript;
    },

    /**
     * Writes the data into the configuration which is passed to the loader template
     *
     * @param packages {Object} the `qx.$$packages` object data
     */
    serializeInto(packages) {
      let data = (packages[String(this.__packageIndex)] = {
        uris: []
      });

      let appRoot = this.__appMeta.getApplicationRoot();
      let target = this.__appMeta.getTarget();
      let privateArtifacts =
        target.isPrivateArtifacts() &&
        this.__appMeta.getApplication().getType() == "browser";
      let transpiledDir = path.join(target.getOutputDir(), "transpiled");
      let resourceDir = path.join(target.getOutputDir(), "resource");
      const toUri = filename => {
        if (
          privateArtifacts &&
          (filename.startsWith(transpiledDir) ||
            filename.startsWith(resourceDir))
        ) {
          let uri = path.relative(target.getOutputDir(), filename);
          return uri;
        }
        let uri = path.relative(appRoot, filename);
        if (this.__appMeta.isAddTimestampsToUrls()) {
          let stat = fs.statSync(filename, { throwIfNoEntry: false });
          if (stat) {
            uri += "?" + stat.mtimeMs;
          }
          return uri;
        } else {
          return uri;
        }
      };
      if (!this.isEmbedAllJavascript()) {
        data.uris = this.__javascriptMetas.map(js => toUri(js.getFilename()));
      }
      if (this.isNeedsWriteToDisk()) {
        data.uris.unshift(toUri(this.__javascript.getFilename()));
      }
    },

    /**
     * Apply for needsWriteToDisk property
     */
    _applyNeedsWriteToDisk(value) {
      this.__javascript.setNeedsWriteToDisk(value);
    }
  }
});
