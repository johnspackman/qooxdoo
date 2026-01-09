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
 * StdClassParser is used to parse a class file and extract the metadata.  This
 * strictly does not persist state (outside of the `parse()` method) so that it
 * can be used in a multi-threaded environment, ie we can use Node Workers to
 * parse multiple files at once.
 * 
 * @typedef {Object} MetaData
 * @property {number} version - The version of the metadata format
 * @property {number} lastModified - The last modified timestamp of the class file
 * @property {string} lastModifiedIso - The last modified timestamp of the class file in ISO format
 * @property {string} classFilename - The filename of the class, relative to the meta root dir
 * 
 *
 */
qx.Class.define("qx.tool.compiler.meta.StdClassParser", {
  extend: qx.core.Object,

  statics: {
    /** Meta Data Version - stored in meta data files */
    VERSION: 0.3
  },

  members: {
    /**
     * @type {MetaData} 
     * The metadata, only valid during `parse()` 
     * */
    __metaData: null,

    /**
     * Parses the file and returns the metadata
     *
     * @param {String} classFilename the .js file to parse
     * @return {MetaData}
     */
    async parse(metaRootDir, classFilename) {
      classFilename = await qx.tool.utils.files.Utils.correctCase(classFilename);

      let stat = await fs.promises.stat(classFilename);
      this.__metaData = {
        version: qx.tool.compiler.meta.StdClassParser.VERSION,
        lastModified: stat.mtime.getTime(),
        lastModifiedIso: stat.mtime.toISOString(),
        classFilename: path.relative(metaRootDir, classFilename)
      };

      const babelCore = require("@babel/core");
      let src = await fs.promises.readFile(classFilename, "utf8");

      let plugins = [require("@babel/plugin-syntax-jsx"), this.__plugin()];

      var config = {
        ast: true,
        babelrc: false,
        sourceFileName: classFilename,
        filename: classFilename,
        sourceMaps: false,
        presets: [
          [
            {
              plugins: plugins
            }
          ]
        ],

        parserOpts: {
          allowSuperOutsideMethod: true,
          sourceType: "script"
        },

        generatorOpts: {
          retainLines: true,
          compact: false
        },

        passPerPreset: true
      };

      let result;
      result = babelCore.transform(src, config);
      let metaData = this.__metaData;
      this.__metaData = null;
      return metaData;
    },

    /**
     * The Babel plugin
     *
     * @returns {Object}
     */
    __plugin() {
      let metaData = this.__metaData;
      let t = this;
      return {
        visitor: {
          Program(path) {
            path.skip();
            let found = false;
            // Babel's path.get() may return either an array or a single NodePath object
            // depending on the AST structure and Babel version, so we normalize to array
            let bodyPaths = path.get("body");
            if (!Array.isArray(bodyPaths)) {
              bodyPaths = [bodyPaths];
            }
            bodyPaths.forEach(path => {
              let node = path.node;
              if (node.type == "ExpressionStatement" && node.expression.type == "CallExpression") {
                let str = qx.tool.utils.BabelHelpers.collapseMemberExpression(node.expression.callee);

                let m = str.match(/^qx\.([a-z]+)\.define$/i);
                let definingType = m && m[1];
                if (definingType) {
                  if (found) {
                    qx.tool.compiler.Console.warn(
                      `Ignoring class '${node.expression.arguments[0].value}' in file '${metaData.classFilename}' because a class, mixin, or interface was already found in this file.`
                    );

                    return;
                  }
                  found = true;
                  metaData.type = definingType.toLowerCase();
                  metaData.location = {
                    start: node.loc.start,
                    end: node.loc.end
                  };

                  metaData.className = node.expression.arguments[0].value;
                  if (typeof metaData.className != "string") {
                    metaData.className = null;
                  }
                  metaData.jsdoc = qx.tool.utils.BabelHelpers.getJsDoc(node.leadingComments);

                  t.__scanClassDef(path.get("expression.arguments")[1]);
                }
              }
            });
          }
        }
      };
    },

    /**
     * Scans the class definition
     *
     * @param {NodePath} path
     */
    __scanClassDef(path) {
      let metaData = this.__metaData;

      const getFunctionParams = node => {
        if (node.type == "ObjectMethod") {
          return node.params;
        }
        if (node.value.type == "FunctionExpression") {
          return node.value.params;
        }
        throw new Error("Don't know how to get parameters from " + node.type);
      };

      const collapseParamMeta = (node, meta) => {
        getFunctionParams(node).forEach((param, i) => {
          let name = qx.tool.utils.BabelHelpers.collapseParam(param, i);
          meta.params.push({ name });
        });
      };

      path.skip();
      let ctorAnnotations = {};
      // Babel's path.get() may return either an array or a single NodePath object
      // depending on the AST structure and Babel version, so we normalize to array
      let propertiesPaths = path.get("properties");
      if (!Array.isArray(propertiesPaths)) {
        propertiesPaths = [propertiesPaths];
      }
      propertiesPaths.forEach(path => {
        let property = path.node;
        let propertyName;
        if (property.key.type === "Identifier") {
          propertyName = property.key.name;
        } else if (property.key.type === "StringLiteral") {
          propertyName = property.key.value;
        }

        // Extend
        if (propertyName == "extend") {
          metaData.superClass = qx.tool.utils.BabelHelpers.collapseMemberExpression(property.value);
        }

        // Class Annotations
        else if (propertyName == "@") {
          metaData.annotation = path.get("value").toString();
        }

        // Core
        else if (propertyName == "implement" || propertyName == "include") {
          let name = propertyName == "include" ? "mixins" : "interfaces";
          metaData[name] = [];
          // eg: `include: [qx.my.first.MMixin, qx.my.next.MMixin, ..., qx.my.last.MMixin]`
          if (property.value.type == "ArrayExpression") {
            property.value.elements.forEach(element => {
              metaData[name].push(qx.tool.utils.BabelHelpers.collapseMemberExpression(element));
            });
          }
          // eg: `include: qx.my.MMixin`
          else if (property.value.type == "MemberExpression") {
            metaData[name].push(qx.tool.utils.BabelHelpers.collapseMemberExpression(property.value));
          }
          // eg, `include: qx.core.Environment.filter({...})`
          else if (property.value.type === "CallExpression") {
            let calleeLiteral = "";
            let current = property.value.callee;
            while (current) {
              let suffix = calleeLiteral ? `.${calleeLiteral}` : "";
              if (current.type === "MemberExpression") {
                calleeLiteral = current.property.name + suffix;
                current = current.object;
                continue;
              } else if (current.type === "Identifier") {
                calleeLiteral = current.name + suffix;
                break;
              }
              throw new Error(
                `${metaData.className}: error parsing mixin types: cannot resolve ${property.value.callee.type} in CallExpression`
              );
            }
            if (calleeLiteral === "qx.core.Environment.filter") {
              const properties = property.value.arguments[0]?.properties;
              properties?.forEach(prop => metaData[name].push(qx.tool.utils.BabelHelpers.collapseMemberExpression(prop.value)));
            } else {
              this.warn(
                `${metaData.className}: could not determine mixin types from call \`${calleeLiteral}\`. Type support for this class may be limited.`
              );
            }
          }
        }

        // Type
        else if (propertyName == "type") {
          metaData.isSingleton = property.value.value == "singleton";
          metaData.abstract = property.value.value == "abstract";
        }

        // Constructor & Destructor Annotations
        else if (propertyName == "@construct" || propertyName == "@destruct") {
          ctorAnnotations[propertyName] = path.get("value").toString();
        }

        // Constructor & Destructor Methods
        else if (propertyName == "construct" || propertyName == "destruct") {
          let memberMeta = (metaData[propertyName] = {
            type: "function",
            params: [],
            location: {
              start: path.node.loc.start,
              end: path.node.loc.end
            }
          });

          collapseParamMeta(property, memberMeta);
        }

        // Events
        else if (propertyName == "events") {
          metaData.events = {};
          property.value.properties.forEach(event => {
            let name = event.key.name;
            metaData.events[name] = {
              type: null,
              jsdoc: qx.tool.utils.BabelHelpers.getJsDoc(event.leadingComments)
            };

            if (event.value.type == "StringLiteral") {
              metaData.events[name].type = event.value.value;
              metaData.events[name].location = {
                start: event.loc.start,
                end: event.loc.end
              };
            }
          });
        }

        // Properties
        else if (propertyName == "properties") {
          this.__scanProperties(path.get("value.properties"));
        }

        // Members & Statics
        else if (propertyName == "members" || propertyName == "statics") {
          let type = propertyName;
          let annotations = {};
          metaData[type] = {};
          if (path.node.value.type == "ObjectExpression") {
            // Babel's path.get() may return either an array or a single NodePath object
            // depending on the AST structure and Babel version, so we normalize to array
            let memberPaths = path.get("value.properties");
            if (!Array.isArray(memberPaths)) {
              memberPaths = [memberPaths];
            }
            memberPaths.forEach(memberPath => {
              let member = memberPath.node;
              const name = qx.tool.utils.BabelHelpers.collapseMemberExpression(
                member.key
              );
              if (name[0] == "@") {
                annotations[name] = memberPath.get("value").toString();
                return;
              }

              let memberMeta = (metaData[type][name] = {
                jsdoc: qx.tool.utils.BabelHelpers.getJsDoc(member.leadingComments)
              });

              memberMeta.access = name.startsWith("__")
                ? "private"
                : name.startsWith("_")
                  ? "protected"
                  : "public";
              memberMeta.location = {
                start: member.loc.start,
                end: member.loc.end
              };

              if (
                member.type === "ObjectMethod" ||
                (member.type === "ObjectProperty" &&
                  member.value.type === "FunctionExpression")
              ) {
                memberMeta.type = "function";
                memberMeta.params = [];
                collapseParamMeta(member, memberMeta);
              }
            });
          }
          for (let metaName in annotations) {
            let bareName = metaName.substring(1);
            let memberMeta = metaData[type][bareName];
            if (memberMeta) {
              memberMeta.annotation = annotations[metaName];
            }
          }
        }
      });
      if (ctorAnnotations["@construct"] && metaData.construct) {
        metaData.construct.annotation = ctorAnnotations["@construct"];
      }
      if (ctorAnnotations["@destruct"] && metaData.destruct) {
        metaData.destruct.annotation = ctorAnnotations["@destruct"];
      }
    },

    /**
     * Scans the properties in the class definition
     *
     * @param {NodePath[]} paths
     */
    __scanProperties(paths) {
      let metaData = this.__metaData;
      if (!metaData.properties) {
        metaData.properties = {};
      }

      paths.forEach(path => {
        path.skip();
        let property = path.node;
        let name = qx.tool.utils.BabelHelpers.collapseMemberExpression(property.key);

        metaData.properties[name] = {
          location: {
            start: path.node.loc.start,
            end: path.node.loc.end
          },

          json: qx.tool.utils.BabelHelpers.collectJson(property.value, true),
          jsdoc: qx.tool.utils.BabelHelpers.getJsDoc(property.leadingComments)
        };
      });
    }
  }
});
