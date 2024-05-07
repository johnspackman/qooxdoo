/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2023-24 Zenesis Limited (https://www.zenesis.com)

   License:
     MIT: https://opensource.org/licenses/MIT
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * John Spackman (github.com/johnspackman)

************************************************************************ */

/**
 * Property implementation for actual properties
 *
 * TODO:
 *
 * `validate` implementation
 * `delegate` implementation
 * `inheritable` implementation (pass onto `obj._getChildren`; check for special `inherit` value)
 * Array check
 * FunctionCheck
 *
 * how does init of property values work?  `init` per class and `initFunction` per instance?
 *
 */
qx.Bootstrap.define("qx.core.property.Property", {
  //extend: Object,
  implement: qx.core.property.IProperty,

  construct(propertyName, clazz) {
    //super();
    this.__propertyName = propertyName;
    this.__clazz = clazz;
  },

  members: {
    /** @type{String} the name of the property */
    __propertyName: null,

    /** @type{qx.Class} the class that defined the property */
    __clazz: null,

    /** @type{Boolean} whether this is a pseudo property or not */
    __psuedoProperty: false,

    /**
     * @type{qx.Class} the class that original defined this property, before it was cloned and
     * refined for the current `__clazz`
     */
    __superClass: null,

    /** @type{Object} the original definition */
    __definition: null,

    /** @type{qx.core.property.IPropertyStorage} the storage implementation */
    __storage: null,

    /** @type{Boolean} whether the property can be set */
    __readOnly: false,

    /** @type{Function|String?} the method called to validate incoming values, or the name of the function to call */
    __validate: null,

    /** @type{Function|String?} the apply method or name of the method */
    __apply: null,

    /** @type{Function?} the transform method or name of the transform method */
    __transform: null,

    /** @type{String} the name of the change event */
    __eventName: null,

    /** @type{*} the init value */
    __initValue: undefined,

    /** @type{*} the init function used to get the init value */
    __initFunction: undefined,

    /** @type{qx.core.check.Check} the check object for verifying property value compatibility */
    __check: null,

    /** @type{Function?} the function to test for equality */
    __isEqual: null,

    /** @type{qx.Annotation[]?null} any annotations */
    __annotations: null,

    /** @type{Boolean} whether the property needs to be dereferenced */
    __needsDereference: false,

    isRefineAllowed(def) {},

    /**
     * Configures a psuedo property
     */
    configurePsuedoProperty() {
      this.__definition = {};
      this.__psuedoProperty = true;
      let upname = qx.Bootstrap.firstUp(this.__propertyName);
      this.__eventName = "change" + upname;
      this.__storage = new qx.core.property.PsuedoPropertyStorage(this, this.__clazz);
      this.__readOnly = this.__clazz.prototype["set" + upname] === undefined;
    },

    /**
     * @Override
     */
    configure(def) {
      let upname = qx.Bootstrap.firstUp(this.__propertyName);
      let methodNames = {};
      for (let tmp = this.__clazz; tmp; tmp = tmp.superclass) {
        for (let methodName in tmp.prototype) {
          if (typeof tmp.prototype[methodName] == "function") {
            methodNames[methodName] = tmp.prototype[methodName];
          }
        }
      }

      // Auto detect the property definition from a type name
      if (typeof def == "string") {
        def = {
          check: def
        };
        let applyName = "apply" + upname;
        if (typeof methodNames[applyName] == "function") {
          def.apply = applyName;
        } else {
          applyName = "_" + applyName;
          if (typeof methodNames[applyName] == "function") {
            def.apply = applyName;
          } else {
            applyName = "_" + applyName;
            if (typeof methodNames[applyName] == "function") {
              def.apply = applyName;
            }
          }
        }
        if (typeof methodNames["transform" + upname] == "function") {
          def.transform = "transform" + upname;
        } else if (typeof methodNames["_transform" + upname] == "function") {
          def.transform = "_transform" + upname;
        } else if (typeof methodNames["__transform" + upname] == "function") {
          def.transform = "__transform" + upname;
        }
      }
      this.__definition = def;

      // Figure out the storage implementation
      if (def.storage) {
        if (def.storage instanceof qx.core.property.IPropertyStorage) {
          this.__storage = def.storage;
        } else {
          this.__storage = new def.storage();
        }
      } else {
        if (def.immutable == "replace") {
          if (def.check == "Array") {
            this.__storage = qx.core.property.PropertyStorageFactory.getStorage(qx.core.property.ImmutableArrayStorage);
          } else if (def.check == "Object") {
            this.__storage = qx.core.property.PropertyStorageFactory.getStorage(qx.core.property.ImmutableObjectStorage);
          } else if (def.check == "qx.data.Array") {
            this.__storage = qx.core.property.PropertyStorageFactory.getStorage(qx.core.property.ImmutableDataArrayStorage);
          } else {
            throw new Error(
              `${this}: ` + "only `check : 'Array'` and `check : 'Object'` " + "properties may have `immutable : 'replace'`."
            );
          }
        } else {
          if (typeof def.get == "function") {
            this.__storage = new qx.core.property.ExplicitPropertyStorage(this, this.__clazz);
            this.__readOnly = def.set === undefined;
          } else {
            this.__storage = qx.core.property.PropertyStorageFactory.getStorage(qx.core.property.SimplePropertyStorage);
          }
        }
      }

      const getFunction = (value, description) => {
        if (!value) {
          return null;
        }
        if (typeof value == "function") {
          return value;
        }
        if (typeof value == "string") {
          if (value.match(/^[a-z0-9_]+$/i)) {
            return value;
          }
          return new Function(def.apply);
        }
        throw new Error(`${this}: ${description} method ` + value + " is invalid");
      };

      this.__apply = getFunction(def.apply, "Apply");
      this.__transform = getFunction(def.transform, "Transform");
      this.__validate = getFunction(def.validate, "Validate");

      if (def.event !== undefined) {
        this.__eventName = def.event;
      } else if (!this.__superClazz) {
        this.__eventName = "change" + qx.Bootstrap.firstUp(this.__propertyName);
      }

      if (def.isEqual) {
        if (def.isEqual instanceof Function) {
          this.__isEqual = def.isEqual;
        } else if (typeof def.isEqual == "string") {
          if (methodNames[def.isEqual]) {
            this.__isEqual = methodNames[def.isEqual];
          } else {
            this.__isEqual = new Function("a", "b", "return " + def.isEqual);
          }
        }
      }

      if (def.init !== undefined) {
        if (typeof def.init == "function") {
          if (this.__superClass) {
            throw new Error(`${this}: init cannot be redefined in a subclass, when it is a function - explicit values only`);
          }
          this.__initFunction = def.init;
        } else {
          this.__initValue = def.init;
        }
      }

      if (def.init !== undefined && def.deferredInit) {
        this.error(`${this}: init and deferredInit are mutually exclusive, ignoring deferredInit`);
        delete def.deferredInit;
      }
      this.__needsDereference = def.dereference;

      let newCheck = null;

      if (typeof def.check == "function") {
        newCheck = new qx.core.check.SimpleCheck(def.check, !!def.nullable, false);
      } else if (def.check) {
        newCheck = qx.core.check.CheckFactory.getInstance().getCheck(def.check || "any");
        if (newCheck && def.nullable && !newCheck.isNullable()) {
          newCheck = qx.core.check.CheckFactory.getInstance().getCheck((def.check || "any") + "?");
        }

        if (!newCheck && def.check instanceof String) {
          if (qx.core.Environment.get("qx.Class.futureCheckJsDoc")) {
            // Next  try to parse the check string as JSDoc
            let bJSDocParsed = false;
            try {
              newCheck = new qx.core.check.JsDocCheck(def.check, !!def.nullable);
            } catch (e) {
              // Couldn't parse JSDoc so the check string is not a JSDoc one. Fall through to next
              // possible use of the check string.
              //
              // FALL THROUGH
            }
          }

          if (!newCheck) {
            let fn = null;
            try {
              fn = new Function("value", `return (${def.check});`);
            } catch (ex) {
              throw new Error(`${this}: ` + "Error creating check function: " + `${def.check}: ` + ex);
            }
            newCheck = new qx.core.check.SimpleCheck(fn, !!def.nullable, false);
          }
        }
      }

      if (newCheck) {
        if (this.__check && !this.__check.isCompatible(newCheck)) {
          throw new Error(
            `Property ${this} has invalid check because the definition in the superclass ${this.__superClass} is not compatible`
          );
        }
        this.__check = newCheck;
      }
      if (this.__check instanceof qx.core.check.SimpleCheck) {
        this.__needsDereference = def.dereference || this.__check.needsDereference();
      }

      if (this.__check && this.__check.isNullable() && this.__initValue === undefined) {
        this.__initValue = null;
      }
      if (def["@"] && def["@"].length > 0) {
        this.__annotations = [...def["@"]];
      }
    },

    /**
     * @Override
     */
    clone(clazz) {
      let clone = new qx.core.property.Property(this.__propertyName);
      clone.__propertyName = this.__propertyName;
      clone.__clazz = clazz;
      clone.__superClass = this.__clazz;
      clone.__definition = this.__definition;
      clone.__storage = this.__storage;
      clone.__readOnly = this.__readOnly;
      clone.__eventName = this.__eventName;
      clone.__initValue = this.__initValue;
      clone.__initFunction = this.__initFunction;
      clone.__check = this.__check;
      clone.__isEqual = this.__isEqual;
      clone.__annotations = this.__annotations ? qx.lang.Array.clone(this.__annotations) : null;
      clone.__needsDereference = this.__needsDereference;
      return clone;
    },

    /**
     * Called to define the property on a class prototype
     *
     * @param {qx.Class} clazz the class having the property defined
     * @param {Boolean?} patch whether patching an existing class
     */
    defineProperty(clazz, patch) {
      let propertyName = this.__propertyName;
      let scopePrefix = "";
      if (propertyName.startsWith("__")) {
        scopePrefix = "__";
        propertyName = propertyName.substring(2);
      } else if (propertyName.startsWith("_")) {
        scopePrefix = "_";
        propertyName = propertyName.substring(1);
      }
      let upname = qx.Bootstrap.firstUp(propertyName);
      let self = this;

      let proto = clazz.prototype;

      if (qx.core.Environment.get("qx.debug")) {
        if (clazz.prototype.$$superProperties[propertyName] && propertyName.charAt(0) === "_" && propertyName.charAt(1) === "_") {
          throw new Error(`Overwriting private member "${propertyName}" ` + `of Class "${clazz.classname}" ` + "is not allowed");
        }

        if (
          patch !== true &&
          (proto.hasOwnProperty(propertyName) ||
            qx.Class.objectProperties.has(propertyName) ||
            (propertyName in proto && !(propertyName in clazz.prototype.$$superProperties)))
        ) {
          throw new Error(
            `Overwriting member or property "${propertyName}" ` +
              `of Class "${clazz.classname}" ` +
              "is not allowed. " +
              "(Members and properties are in the same namespace.)"
          );
        }
      }

      const addMethod = (name, func) => {
        clazz.prototype[scopePrefix + name] = func;
        qx.Bootstrap.setDisplayName(func, clazz.classname, "prototype." + name);
      };

      // Does this property have an initFunction?
      if (this.__initFunction !== undefined) {
        clazz.prototype.$$initFunctions.push(propertyName);
      }

      let initValue = this.__initValue;
      if (initValue === undefined && typeof this.__definition.check == "Boolean") {
        initValue = false;
      }
      if (initValue !== undefined) {
        clazz.prototype["$$init_" + propertyName] = initValue;
      }

      addMethod("init" + upname, function (...args) {
        self.init(this, ...args);
      });

      // theme-specified
      if (this.__definition.themeable) {
        addMethod("getThemed" + upname, function () {
          return self.getThemed(this);
        });

        addMethod("setThemed" + upname, function (value) {
          self.setThemed(this, value);
          return value;
        });

        addMethod("resetThemed" + upname, function () {
          self.resetThemed(this);
        });
      }

      // inheritable
      if (this.__definition.inheritable) {
        patch && delete clazz.prototype[`$$inherit_${propertyName}`];
        Object.defineProperty(clazz.prototype, `$$inherit_${propertyName}`, {
          value: undefined,
          writable: false,
          configurable: false
        });

        addMethod("refresh" + upname, function () {
          return self.refresh(this);
        });
      }

      // Native property value
      let propertyConfig = {
        get: function () {
          // When iterating a prototype, `this` will not be an instance of the class
          //  (ie `this` will be the prototype)
          if (this instanceof this.constructor) {
            return self.get(this);
          }
          return this["$$init_" + propertyName];
        },
        configurable: qx.Class.$$options.propsAccessible || false,
        enumerable: qx.Class.$$options.propsAccessible || false
      };
      if (!this.__readOnly) {
        propertyConfig.set = function (value) {
          self.set(this, value);
        };
      }
      Object.defineProperty(clazz.prototype, propertyName, propertyConfig);

      if (!this.__psuedoProperty) {
        addMethod("get" + upname, function () {
          return self.get(this);
        });
        addMethod("get" + upname + "Async", async function () {
          return await self.getAsync(this);
        });
      }

      if (this.__definition.check === "Boolean") {
        addMethod("is" + upname, function () {
          return self.get(this);
        });
        addMethod("is" + upname + "Async", async function () {
          return await self.getAsync(this);
        });
        addMethod("toggle" + upname, function () {
          return self.set(this, !self.get(this));
        });
        addMethod("toggle" + upname + "Async", async function () {
          return await self.setAsync(this, await !self.getAsync(this));
        });
      }

      if (!this.__psuedoProperty) {
        addMethod("set" + upname, function (value) {
          self.set(this, value);
          return value;
        });
        addMethod("set" + upname + "Async", async function (value) {
          await self.setAsync(this, value);
          return value;
        });
        addMethod("reset" + upname, function (value) {
          self.reset(this, value);
        });
      }
    },

    /**
     * Returns an object for tracking state of the property, per object instance (ie not per class)
     *
     * @param {qx.core.Object} thisObj
     * @returns {Object}
     */
    getPropertyState(thisObj) {
      if (thisObj.$$propertyState === undefined) {
        thisObj.$$propertyState = {};
      }
      let state = thisObj.$$propertyState[this.__propertyName];
      if (state === undefined) {
        state = thisObj.$$propertyState[this.__propertyName] = {};
      }
      return state;
    },

    /**
     * Initialises a property value
     *
     * @param {qx.core.Object} thisObj the object on which the property is defined
     */
    init(thisObj, value) {
      let state = this.getPropertyState(thisObj);
      if (state.initMethodCalled) {
        this.warn(`${this}: init() called more than once, ignoring`);
        return;
      }
      state.initMethodCalled = true;

      if (value !== undefined && this.__definition.init !== undefined) {
        this.warn(
          `${this}: init() called with a value, ignoring - use deferredInit and do not specify an init value in the property definition`
        );
        value = undefined;
      }
      if (value === undefined) {
        value = this.getInitValue(thisObj);
      }
      if (value === undefined) {
        throw new Error(`${this}: init() called without a value`);
      }

      this.__storage.set(thisObj, this, value);
      this.__applyValue(thisObj, value, undefined);
    },

    /**
     * Resets a property value
     *
     * @param {qx.core.Object} thisObj the object on which the property is defined
     */
    reset(thisObj) {
      let value = this.getInitValue(thisObj);
      this.__storage.reset(thisObj, this, value);
      this.__applyValueToInheritedChildren(thisObj);
    },

    /**
     * Calculates the init value used by `init()` and `reset()`
     *
     * @param {qx.core.Object} thisObj the object on which the property is defined
     * @returns {*}
     */
    getInitValue(thisObj) {
      let value = thisObj["$$init_" + this.__propertyName];
      if (this.__initFunction !== undefined) {
        value = this.__initFunction.call(thisObj, value, this);
      }
      if (value === undefined && this.__definition.check == "Boolean") {
        value = false;
      }
      return value;
    },

    /**
     * Gets the current value from the storage, does not throw exceptions if nothing has
     * been initialized yet.  This does not support async storage.
     *
     * @param {qx.core.Object} thisObj
     * @returns {*}
     */
    __getSafe(thisObj) {
      let value = this.__storage.get(thisObj, this);
      if (this.isThemeable() && (value === undefined || value === null)) {
        let state = this.getPropertyState(thisObj);
        value = state.themeValue;
      }
      if (value === undefined) {
        if (this.__definition.inheritable) {
          let state = this.getPropertyState(thisObj);
          value = state.inheritedValue;
        }
      }
      return value;
    },

    /**
     * Gets a property value; will raise an error if the property is not initialized
     *
     * @param {qx.core.Object} thisObj the object on which the property is defined
     * @return {*}
     */
    get(thisObj) {
      let value = this.__storage.get(thisObj, this);
      if (value === undefined) {
        if (this.isThemeable()) {
          let state = this.getPropertyState(thisObj);
          value = state.themeValue;
        }
        if (value === undefined) {
          if (this.__definition.inheritable) {
            let state = this.getPropertyState(thisObj);
            value = state.inheritedValue;
          }
        }
        if (value === undefined) {
          value = thisObj["$$init_" + this.__propertyName];
        }
        if (value === undefined) {
          if (this.__storage.isAsyncStorage()) {
            throw new Error("Property " + this + " has not been initialized - try using getAsync() instead");
          }
          if (this.__definition.nullable) {
            return null;
          }
          if (this.__definition.inheritable) {
            if (this.__definition.check == "Boolean") {
              return false;
            }
            return null;
          }
          throw new Error("Property " + this + " has not been initialized");
        }
      }
      return value;
    },

    /**
     * Gets a property value; if not initialized and the property is async, it will
     * wait for the underlying storage to resolve but will throw an error if the underlying
     * storage cannot provide a value which is not `undefined`
     *
     * @param {qx.core.Object} thisObj the object on which the property is defined
     * @return {*}
     */
    async getAsync(thisObj) {
      throw new Error("TODO - inherited and theme values.  ");
      let value = await this.__storage.getAsync(thisObj, this);
      if (value === undefined) {
        if (this.isInheritable()) {
          value = this.__storage.get(thisObj, this, "inherited");
        }
        if (value === undefined) {
          if (this.isThemeable()) {
            value = this.__storage.get(thisObj, this, "theme");
          }
          if (value === undefined) {
            throw new Error("Property " + this + " has not been initialized");
          }
        }
      }
      return value;
    },

    /**
     * Sets a property value.
     *
     * @param {qx.core.Object} thisObj the object on which the property is defined
     * @param {*} value the value to set
     */
    set(thisObj, value) {
      if (this.__validate) {
        this.__callFunction(thisObj, this.__validate, value, this);
      }
      if (this.__readOnly && value !== undefined) {
        throw new Error("Property " + this + " is read-only");
      }
      if (this.isMutating(thisObj)) {
        throw new Error("Property " + this + " is currently mutating");
      }
      let oldValue = this.__storage.get(thisObj, this);
      if (this.__transform) {
        value = this.__callFunction(thisObj, this.__transform, value, oldValue, this);
      }
      this.__applyValue(thisObj, value, oldValue);
    },

    __applyValue(thisObj, value, oldValue) {
      let isEqual = this.isEqual(thisObj, value, oldValue);
      let isInitCalled = true;
      let state = this.getPropertyState(thisObj);
      isInitCalled = state.initMethodCalled;
      state.initMethodCalled = true;

      if (!isEqual || !isInitCalled) {
        this._setMutating(thisObj, true);

        if (oldValue === undefined) {
          oldValue = null;
        }

        try {
          if (!isEqual) {
            this.__storage.set(thisObj, this, value);
          }
          this.__callFunction(thisObj, this.__apply, value, oldValue, this.__propertyName);
          if (this.__eventName) {
            thisObj.fireDataEvent(this.__eventName, value, oldValue);
          }
          this.__applyValueToInheritedChildren(thisObj);
        } finally {
          this._setMutating(thisObj, false);
        }
      }
    },

    __applyValueToInheritedChildren(thisObj) {
      if (this.isInheritable() && typeof thisObj._getChildren == "function") {
        for (let child of thisObj._getChildren()) {
          let property = child.constructor.prototype.$$allProperties[this.__propertyName];
          if (property && property.isInheritable()) {
            property.refresh(child);
          }
        }
      }
    },

    /**
     * Sets a property value asynchronously
     *
     * @param {qx.core.Object} thisObj the object on which the property is defined
     * @param {*} value the value to set
     * @return {qx.Promise<Void>}
     */
    async setAsync(thisObj, value) {
      if (this.__readOnly && value !== undefined) {
        throw new Error("Property " + this + " is read-only");
      }
      if (this.isMutating(thisObj)) {
        throw new Error("Property " + this + " is currently mutating");
      }

      const setAsyncImpl = async () => {
        await this.__storage.setAsync(thisObj, this, value);
        await this.__callFunctionAsync(thisObj, this.__apply, value, oldValue, this.__propertyName);
        if (this.__eventName) {
          await thisObj.fireDataEventAsync(this.__eventName, value, oldValue);
        }
        this.__applyValueToInheritedChildren(thisObj, value, oldValue);
      };

      let oldValue = await this.__storage.getAsync(thisObj, this);
      if (!this.isEqual(thisObj, value, oldValue)) {
        let promise = setAsyncImpl();
        this._setMutating(thisObj, promise);
        await promise;
      }
    },

    /**
     * Sets the theme value for the property; this will trigger an apply & change event if the
     * final value of the property changes
     *
     * @param {*} thisObj
     * @param {*} value
     */
    setThemed(thisObj, value) {
      let oldValue = this.__getSafe(thisObj);
      let state = this.getPropertyState(thisObj, true);
      state.themeValue = value;
      value = this.__getSafe(thisObj);

      this.__applyValue(thisObj, value, oldValue);
    },

    /**
     * Resets the theme value for the property; this will trigger an apply & change event if the
     * final value of the property changes
     *
     * @param {*} thisObj
     */
    resetThemed(thisObj) {
      let oldValue = this.__getSafe(thisObj);
      let state = this.getPropertyState(thisObj, true);
      delete state.themeValue;
      let value = this.__getSafe(thisObj);

      this.__applyValue(thisObj, value, oldValue);
    },

    /**
     * Refreshes the property, copying the value from it's layout parent if it has one
     *
     * @param {*} thisObj
     * @returns
     */
    refresh(thisObj) {
      if (!this.__definition.inheritable) {
        throw new Error(`${this} is not inheritable`);
      }
      let oldValue = this.__storage.get(thisObj, this);

      // If there's a user value, it takes precedence
      if (oldValue != undefined) {
        return;
      }

      // If there's a layout parent and if it has a property (not
      // a member!) of this name, ...
      let layoutParent = typeof thisObj.getLayoutParent == "function" ? thisObj.getLayoutParent() : undefined;
      if (!layoutParent) {
        return;
      }

      let layoutParentProperty = layoutParent.constructor.prototype.$$allProperties[this.__propertyName];
      if (!layoutParentProperty) {
        return;
      }

      let value = layoutParentProperty.__getSafe(layoutParent);
      let state = this.getPropertyState(thisObj);

      // If we found a value to inherit...
      if (value !== undefined) {
        state.inheritedValue = value;
      } else {
        delete state.inheritedValue;
      }

      if (value !== oldValue) {
        if (!this.isEqual(thisObj, value, oldValue)) {
          this._setMutating(thisObj, true);
          try {
            this.__callFunction(thisObj, this.__apply, value, oldValue, this.__propertyName);
            if (this.__eventName) {
              thisObj.fireDataEvent(this.__eventName, value, oldValue);
            }
            this.__applyValueToInheritedChildren(thisObj, value, oldValue);
          } finally {
            this._setMutating(thisObj, false);
          }
        }
      }
    },

    /**
     * Detects if the property is currently mutating
     *
     * @param {qx.core.Object} thisObj
     * @returns {Boolean}
     */
    isMutating(thisObj) {
      return !!this.__storage.isMutating(thisObj);
    },

    /**
     * Called internally to set the mutating state for a property
     *
     * @param {qx.core.Object} thisObj
     * @param {Boolean} mutating
     */
    _setMutating(thisObj, mutating) {
      let state = this.getPropertyState(thisObj);
      if (mutating) {
        if (state.mutatingCount === undefined) {
          state.mutatingCount = 1;
        } else {
          state.mutatingCount++;
        }
        if (qx.lang.Type.isPromise(mutating)) {
          mutating.then(() => this._setMutating(thisObj, false));
        }
      } else {
        if (state.mutatingCount === undefined) {
          throw new Error(`Property ${this} of ${thisObj} is not mutating`);
        }
        state.mutatingCount--;
        if (state.mutatingCount == 0) {
          delete state.promiseMutating;
          delete state.mutatingCount;
        }
      }
    },

    /**
     * Resolves when the property has finished mutating
     *
     * @param {qx.core.Object} thisObj
     * @returns {Promise<>}
     */
    async resolveMutating(thisObj) {
      if (thisObj.$$propertyMutating === undefined || !thisObj.$$propertyMutating[this.__propertyName]) {
        return qx.Promise.resolve();
      }
      let promise = thisObj.$$propertyMutating[this.__propertyName];
      if (typeof promise == "boolean") {
        promise = new qx.Promise();
        thisObj.$$propertyMutating[this.__propertyName] = promise;
      }
      await promise;
    },

    /**
     * Returns the `qx.core.check.Check` instance that can be used to verify property value compatibility
     *
     * @return {qx.core.check.Check}
     */
    getCheck(value) {
      return this.__check;
    },

    /**
     * Called to dereference, after the destructor, if the property has `dereference : true`.
     *
     * @param {qx.core.Object} thisObj the object on which the property is defined
     */
    dereference(thisObj) {
      this.__storage.dereference(thisObj, this);
      // Get rid of our internal storage of the various possible
      // values for this property
      let propertyName = this.__propertyName;
      delete thisObj[`$$user_${propertyName}`];
      delete thisObj[`$$theme_${propertyName}`];
      delete thisObj[`$$inherit_${propertyName}`];
    },

    /**
     * Helper method to call a function, prefering an actual function over a named function.
     * this is used so that inherited classes can override methods, ie because the method
     * if located on demand.  This is used to call `apply` and `transform` methods.
     *
     * @param {*} thisObj
     * @param {Function|String?} fn
     * @param  {...any} args
     * @returns
     */
    __callFunction(thisObj, fn, ...args) {
      if (typeof fn == "function") {
        return fn.call(thisObj, ...args);
      }

      if (typeof fn == "string") {
        let memberFn = thisObj[fn];
        if (memberFn) {
          return memberFn.call(thisObj, ...args);
        }

        throw new Error(`${this}: method ${fn} does not exist`);
      }

      return null;
    },

    /**
     * Helper method to call a function, prefering an actual function over a named function.
     * this is used so that inherited classes can override methods, ie because the method
     * if located on demand.  Same as `__callFunction` but async.
     *
     * @param {*} thisObj the this object
     * @param {*} fnName the name of the function
     * @param {*} fn the function, if not named
     * @param  {...any} args
     * @returns
     */
    async __callFunctionAsync(thisObj, fn, ...args) {
      if (typeof fn == "function") {
        return await fn.call(thisObj, ...args);
      }
      if (typeof fn == "string") {
        let memberFn = thisObj[fn];
        if (memberFn) {
          return await memberFn.call(thisObj, ...args);
        }

        throw new Error(`${this}: method ${fn} does not exist`);
      }
    },

    /**
     * Tests whether the property needs to be dereferenced
     *
     * @returns {Boolean}
     */
    needsDereference() {
      return this.__needsDereference;
    },

    /**
     * Compares two property values for equality, used to determine whether to apply
     * and fire change events
     *
     * @param {*} value
     * @param {*} oldValue
     */
    isEqual(thisObj, value, oldValue) {
      if (this.__isEqual) {
        return this.__isEqual.call(thisObj, value, oldValue, this);
      }
      if (value === oldValue) {
        if (value === 0) {
          return Object.is(value, oldValue);
        }
        return true;
      }

      return false;
    },

    /**
     * Promise that resolves when the property is ready, or when it has finished mutating
     *
     * @param {qx.core.Object} thisObj the object on which the property is defined
     */
    promiseReady(thisObj) {},

    /**
     * Whether the property is mutating (asynchronously or recursively)
     *
     * @param {qx.core.Object} thisObj the object on which the property is defined
     * @return {Boolean}
     */
    isMutating(thisObj) {},

    /**
     * Whether the property is initialized
     *
     * @param {qx.core.Object} thisObj the object on which the property is defined
     * @return {Boolean}
     */
    isInitialized(thisObj) {
      return this.__storage.get(thisObj, this) !== undefined;
    },

    /**
     * Whether the property supports async
     *
     * @return {Boolean}
     */
    isAsync() {
      return !!this.__definition.async;
    },

    /**
     * Whether the property is themable
     *
     * @return {Boolean}
     */
    isThemeable() {
      return !!this.__definition.themeable;
    },

    /**
     * Whether the property is inheritable
     *
     * @return {Boolean}
     */
    isInheritable() {
      return !!this.__definition.inheritable;
    },

    /**
     * Returns an array of annotations for the property, or null if there are none
     *
     * @return {qx.Annotation[]?null}
     */
    getAnnotations() {
      return this.__annotations;
    },

    /**
     * Returns the property name
     *
     * @returns {String}
     */
    getPropertyName() {
      return this.__propertyName;
    },

    /**
     * Returns the event name
     *
     * @returns {String?}
     */
    getEventName() {
      return this.__eventName;
    },

    /**
     * Returns the raw definition
     *
     * @return {*}
     */
    getDefinition() {
      return this.__definition;
    },

    /**
     * Outputs a warning; the logging system is probably not loaded and working yet, so we
     * have to implement our own
     *
     * @param  {...any} args
     */
    warn(...args) {
      if (qx.core.Environment.get("qx.debug")) {
        console.warn(...args);
      }
    },

    /**
     * @Override
     */
    toString() {
      return this.__clazz.classname + "." + this.__propertyName;
    }
  }
});
