/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2007-2008 1&1 Internet AG, Germany, http://www.1und1.de

   License:
     MIT: https://opensource.org/licenses/MIT
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * Fabian Jakobs (fjakobs)
     * Sebastian Werner (wpbasti)
     * John Spackman (johnspackman)
     * Christian Boulanger (cboulanger)

************************************************************************ */

/**
 * Wrapper for browser DOM event handling for each browser window/frame.
 *
 * @require(qx.bom.Event)
 */
qx.Class.define("qx.event.Manager", {
  extend: Object,
  implement: [qx.core.IDisposable],

  /*
  *****************************************************************************
     CONSTRUCTOR
  *****************************************************************************
  */

  /**
   * Creates a new instance of the event handler.
   *
   * @param win {Window} The DOM window this manager handles the events for
   * @param registration {qx.event.Registration} The event registration to use
   */
  construct(win, registration) {
    // Assign window object
    this.__window = win;
    this.__windowId = qx.core.ObjectRegistry.toHashCode(win);
    this.__registration = registration;

    // Register to the page unload event.
    // Only for iframes and other secondary documents.
    if (win.qx !== qx) {
      var self = this;
      var method = function () {
        qx.bom.Event.removeNativeListener(win, "unload", method);
        self.dispose();
      };
      if (qx.core.Environment.get("qx.globalErrorHandling")) {
        qx.bom.Event.addNativeListener(
          win,
          "unload",
          qx.event.GlobalError.observeMethod(method)
        );
      } else {
        qx.bom.Event.addNativeListener(win, "unload", method);
      }
    }

    // Registry for event listeners
    this.__listeners = new Map();

    // The handler and dispatcher instances
    this.__handlers = {};
    this.__dispatchers = {};

    this.__handlerCache = {};

    this.__clearBlackList = new qx.util.DeferredCall(function () {
      this.__blacklist = null;
    }, this);
    this.__clearBlackList.$$blackListCleaner = true;
  },

  /*
  *****************************************************************************
     STATICS
  *****************************************************************************
  */

  statics: {
    /** @type {Integer} Last used ID for an event */
    __lastUnique: 0,

    /**
     * Returns an unique ID which may be used in combination with a target and
     * a type to identify an event entry.
     *
     * @return {String} The next free identifier (auto-incremented)
     */
    getNextUniqueId() {
      return this.__lastUnique++ + "";
    },

    /**
     * @type {Array} private list of global event monitor functions
     */
    __globalEventMonitors: [],

    /**
     * Adds a global event monitor function which is called for each event fired
     * anywhere in the application. The function is called with the signature
     * (target: {@link qx.core.Object}, event: {@link qx.event.type.Event}).
     * Since for performance reasons, the original event object is passed,
     * the monitor function must not change this event in any way.
     *
     * @param fn {Function} Monitor function
     * @param context {Object?} Optional execution context of the function
     */
    addGlobalEventMonitor(fn, context) {
      qx.core.Assert.assertFunction(fn);
      fn.$$context = context;
      this.__globalEventMonitors.push(fn);
    },

    /**
     * Removes a global event monitor function that had
     * previously been added.
     * @param fn {Function} The global monitor function
     */
    removeGlobalEventMonitor(fn) {
      qx.core.Assert.assertFunction(fn);
      qx.lang.Array.remove(this.__globalEventMonitors, fn);
    },

    /**
     * Remove all registered event monitors
     */
    resetGlobalEventMonitors() {
      qx.event.Manager.__globalEventMonitors = [];
    },

    /**
     * Returns the global event monitor. Not compatible with the {@link
     * qx.event.Manager.addGlobalEventMonitor} API. Will be removed in v7.0.0
     *
     * @deprecated {6.0}
     * @return {Function?} the global monitor function
     */
    getGlobalEventMonitor() {
      return this.__globalEventMonitors[0];
    },

    /**
     * Sets the global event monitor. Not compatible with the {@link
     * qx.event.Manager.addGlobalEventMonitor} API. Will be removed in
     * v7.0.0. Use {@link qx.event.Manager.addGlobalEventMonitor} instead.
     *
     * @deprecated {6.0}
     * @param fn {Function?} the global monitor function
     */
    setGlobalEventMonitor(fn) {
      qx.core.Assert.assertFunction(fn);
      this.__globalEventMonitors[0] = fn;
    }
  },

  /*
  *****************************************************************************
     MEMBERS
  *****************************************************************************
  */

  members: {
    __registration: null,
    __listeners: null,

    __dispatchers: null,
    __disposeWrapper: null,

    __handlers: null,
    __handlerCache: null,
    __window: null,
    __windowId: null,

    __blacklist: null,
    __clearBlackList: null,

    /*
    ---------------------------------------------------------------------------
      HELPERS
    ---------------------------------------------------------------------------
    */

    /**
     * Get the window instance the event manager is responsible for
     *
     * @return {Window} DOM window instance
     */
    getWindow() {
      return this.__window;
    },

    /**
     * Get the hashcode of the manager's window
     *
     * @return {String} The window's hashcode
     */
    getWindowId() {
      return this.__windowId;
    },

    /**
     * Returns an instance of the given handler class for this manager(window).
     *
     * @param clazz {Class} Any class which implements {@link qx.event.IEventHandler}
     * @return {Object} The instance used by this manager
     */
    getHandler(clazz) {
      var handler = this.__handlers[clazz.classname];

      if (handler) {
        return handler;
      }

      return (this.__handlers[clazz.classname] = new clazz(this));
    },

    /**
     * Returns an instance of the given dispatcher class for this manager(window).
     *
     * @param clazz {Class} Any class which implements {@link qx.event.IEventHandler}
     * @return {Object} The instance used by this manager
     */
    getDispatcher(clazz) {
      var dispatcher = this.__dispatchers[clazz.classname];

      if (dispatcher) {
        return dispatcher;
      }

      return (this.__dispatchers[clazz.classname] = new clazz(
        this,
        this.__registration
      ));
    },

    /*
    ---------------------------------------------------------------------------
      EVENT LISTENER MANAGEMENT
    ---------------------------------------------------------------------------
    */

    /**
     * Get a copy of all event listeners for the given combination
     * of target, event type and phase.
     *
     * This method is especially useful and for event handlers to
     * to query the listeners registered in the manager.
     *
     * @param target {Object} Any valid event target
     * @param type {String} Event type
     * @param capture {Boolean ? false} Whether the listener is for the
     *       capturing phase of the bubbling phase.
     * @return {Array|null} Array of registered event handlers. May return
     *       null when no listener were found.
     */
    getListeners(target, type, capture) {
      var targetKey =
        target.$$hash || qx.core.ObjectRegistry.toHashCode(target);
      var targetMap = this.__listeners.get(targetKey);

      if (!targetMap) {
        return null;
      }

      var entryKey = type + (capture ? "|capture" : "|bubble");
      var entryMap = targetMap.get(entryKey);

      if (entryMap && entryMap.size > 0) {
        var listeners = [...entryMap.values()];

        return new Proxy(listeners, {
          deleteProperty(target, property) {
            if (property !== "length") {
              var listener = target[property];
              entryMap.delete(listener.unique);
            }
            delete target[property];
            return true;
          },
          set(target, property, value, receiver) {
            if (property !== "length") {
              if (!value.unique) {
                throw new Error(
                  "Cannot store a listener without a unique id. Use addListener()"
                );
              }
              entryMap[value.unique] = value;
            }
            target[property] = value;
            return true;
          }
        });
      }
      return null;
    },

    /**
     * Returns all registered listeners.
     *
     * @internal
     *
     * @return {Object} All registered listeners. The key is the hash code for an object.
     */
    getAllListeners() {
      return Object.fromEntries(
        this.__listeners.entries().map(([targetKey, targetMap]) => [
          targetKey,
          Object.fromEntries(
            targetMap.entries().map(([entryKey, entryMap]) => {
              var listeners = [...entryMap.values()];
              var proxy = new Proxy(listeners, {
                deleteProperty(target, property) {
                  if (property !== "length") {
                    var listener = target[property];
                    entryMap.delete(listener.unique);
                  }
                  delete target[property];
                  return true;
                },
                set(target, property, value, receiver) {
                  if (property !== "length") {
                    if (!value.unique) {
                      throw new Error(
                        "Cannot store a listener without a unique id. Use addListener()"
                      );
                    }
                    entryMap[value.unique] = value;
                  }
                  target[property] = value;
                  return true;
                }
              });
              return [entryKey, proxy];
            })
          )
        ])
      );
    },

    /**
     * Returns a serialized array of all events attached on the given target.
     *
     * @param target {Object} Any valid event target
     * @return {Map[]} Array of maps where everyone contains the keys:
     *   <code>handler</code>, <code>self</code>, <code>type</code> and <code>capture</code>.
     */
    serializeListeners(target) {
      var targetKey =
        target.$$hash || qx.core.ObjectRegistry.toHashCode(target);
      var targetMap = this.__listeners.get(targetKey);
      var result = [];

      if (targetMap) {
        var indexOf, type, capture;
        for (const [entryKey, entryMap] of targetMap) {
          indexOf = entryKey.indexOf("|");
          type = entryKey.substring(0, indexOf);
          capture = entryKey.charAt(indexOf + 1) === "c";
          result = result.concat([
            ...entryMap.values().map(entry => ({
              self: entry.context,
              handler: entry.handler,
              type: type,
              capture: capture
            }))
          ]);
        }
      }

      return result;
    },

    /**
     * This method might be used to temporally remove all events
     * directly attached to the given target. This do not work
     * have any effect on bubbling events normally.
     *
     * This is mainly thought for detaching events in IE, before
     * cloning them. It also removes all leak scenarios
     * when unloading a document and may be used here as well.
     *
     * @internal
     * @param target {Object} Any valid event target
     * @param enable {Boolean} Whether to enable or disable the events
     */
    toggleAttachedEvents(target, enable) {
      var targetKey =
        target.$$hash || qx.core.ObjectRegistry.toHashCode(target);
      var targetMap = this.__listeners.get(targetKey);

      if (targetMap) {
        var indexOf, type, capture;
        for (const entryKey of targetMap.keys()) {
          indexOf = entryKey.indexOf("|");
          type = entryKey.substring(0, indexOf);
          capture = entryKey.charCodeAt(indexOf + 1) === 99; // checking for character "c".

          if (enable) {
            this.__registerAtHandler(target, type, capture);
          } else {
            this.__unregisterAtHandler(target, type, capture);
          }
        }
      }
    },

    /**
     * Check whether there are one or more listeners for an event type
     * registered at the target.
     *
     * @param target {Object} Any valid event target
     * @param type {String} The event type
     * @param capture {Boolean ? false} Whether to check for listeners of
     *         the bubbling or of the capturing phase.
     * @return {Boolean} Whether the target has event listeners of the given type.
     */
    hasListener(target, type, capture) {
      if (qx.core.Environment.get("qx.debug")) {
        if (target == null) {
          qx.log.Logger.trace(this);
          throw new Error("Invalid object: " + target);
        }
      }

      var targetKey =
        target.$$hash || qx.core.ObjectRegistry.toHashCode(target);
      var targetMap = this.__listeners.get(targetKey);

      if (!targetMap) {
        return false;
      }

      var entryKey = type + (capture ? "|capture" : "|bubble");
      var entryMap = targetMap.get(entryKey);

      return Boolean(entryMap && entryMap.size > 0);
    },

    /**
     * Imports a list of event listeners at once. This only
     * works for newly created elements as it replaces
     * all existing data structures.
     *
     * Works with a map of data. Each entry in this map should be a
     * map again with the keys <code>type</code>, <code>listener</code>,
     * <code>self</code>, <code>capture</code> and an optional <code>unique</code>.
     *
     * The values are identical to the parameters of {@link #addListener}.
     * For details please have a look there.
     *
     * @param target {Object} Any valid event target
     * @param list {Map} A map where every listener has an unique key.
     */
    importListeners(target, list) {
      if (qx.core.Environment.get("qx.debug")) {
        if (target == null) {
          qx.log.Logger.trace(this);
          throw new Error("Invalid object: " + target);
        }
      }

      var targetKey =
        target.$$hash || qx.core.ObjectRegistry.toHashCode(target);
      var targetMap = this.__listeners.get(targetKey);

      if (!targetMap) {
        targetMap = new Map();
        this.__listeners.set(targetKey, targetMap);
      }

      for (var listKey in list) {
        var item = list[listKey];

        var entryKey = item.type + (item.capture ? "|capture" : "|bubble");
        var entryMap = targetMap.get(entryKey);

        if (!entryMap) {
          entryMap = new Map();
          targetMap.set(entryKey, entryMap);
        }

        if (entryMap.size === 0) {
          // This is the first event listener for this type and target
          // Inform the event handler about the new event
          // they perform the event registration at DOM level if needed
          this.__registerAtHandler(target, item.type, item.capture);
        }

        // Add listener to map
        var unique = item.unique || qx.event.Manager.getNextUniqueId();
        entryMap.set(unique, {
          handler: item.listener,
          context: item.self,
          unique: unique
        });
      }
    },

    /**
     * Add an event listener to any valid target. The event listener is passed an
     * instance of {@link qx.event.type.Event} containing all relevant information
     * about the event as parameter.
     *
     * @param target {Object} Any valid event target
     * @param type {String} Name of the event e.g. "click", "keydown", ...
     * @param listener {Function} Event listener function
     * @param self {Object ? null} Reference to the 'this' variable inside
     *         the event listener. When not given, the corresponding dispatcher
     *         usually falls back to a default, which is the target
     *         by convention. Note this is not a strict requirement, i.e.
     *         custom dispatchers can follow a different strategy.
     * @param capture {Boolean ? false} Whether to attach the event to the
     *         capturing phase or the bubbling phase of the event. The default is
     *         to attach the event handler to the bubbling phase.
     * @return {String} An opaque ID, which can be used to remove the event listener
     *         using the {@link #removeListenerById} method.
     * @throws {Error} if the parameters are wrong
     */
    addListener(target, type, listener, self, capture) {
      if (qx.core.Environment.get("qx.debug")) {
        var msg =
          "Failed to add event listener for type '" +
          type +
          "'" +
          " to the target '" +
          target.classname +
          "': ";

        qx.core.Assert.assertObject(target, msg + "Invalid Target.");
        qx.core.Assert.assertString(type, msg + "Invalid event type.");
        qx.core.Assert.assertFunctionOrAsyncFunction(
          listener,
          msg + "Invalid callback function"
        );

        if (capture !== undefined) {
          qx.core.Assert.assertBoolean(capture, "Invalid capture flag.");
        }
      }

      var targetKey =
        target.$$hash || qx.core.ObjectRegistry.toHashCode(target);
      var targetMap = this.__listeners.get(targetKey);

      if (!targetMap) {
        targetMap = new Map();
        this.__listeners.set(targetKey, targetMap);
      }

      var entryKey = type + (capture ? "|capture" : "|bubble");
      var entryMap = targetMap.get(entryKey);

      if (!entryMap) {
        entryMap = new Map();
        targetMap.set(entryKey, entryMap);
      }

      if (entryMap.size === 0) {
        // This is the first event listener for this type and target
        // Inform the event handler about the new event
        // they perform the event registration at DOM level if needed
        this.__registerAtHandler(target, type, capture);
      }

      // Add listener to map
      var unique = qx.event.Manager.getNextUniqueId();
      entryMap.set(unique, {
        handler: listener,
        context: self,
        unique: unique
      });

      return entryKey + "|" + unique;
    },

    /**
     * Get the event handler class matching the given event target and type
     *
     * @param target {Object} The event target
     * @param type {String} The event type
     * @return {qx.event.IEventHandler|null} The best matching event handler or
     *     <code>null</code>.
     */
    findHandler(target, type) {
      var isDomNode = false,
        isWindow = false,
        isObject = false,
        isDocument = false;
      var key;

      if (target.nodeType === 1) {
        isDomNode = true;
        key = "DOM_" + target.tagName.toLowerCase() + "_" + type;
      } else if (target.nodeType === 9) {
        isDocument = true;
        key = "DOCUMENT_" + type;
      }

      // Please note:
      // Identical operator does not work in IE (as of version 7) because
      // document.parentWindow is not identical to window. Crazy stuff.
      else if (target == this.__window) {
        isWindow = true;
        key = "WIN_" + type;
      } else if (target.classname) {
        isObject = true;
        key = "QX_" + target.classname + "_" + type;
      } else {
        key = "UNKNOWN_" + target + "_" + type;
      }

      var cache = this.__handlerCache;
      if (cache[key]) {
        return cache[key];
      }

      var classes = this.__registration.getHandlers();
      var IEventHandler = qx.event.IEventHandler;
      var clazz, instance, supportedTypes, targetCheck;

      for (var i = 0, l = classes.length; i < l; i++) {
        clazz = classes[i];

        // shortcut type check
        supportedTypes = clazz.SUPPORTED_TYPES;
        if (supportedTypes && !supportedTypes[type]) {
          continue;
        }

        // shortcut target check
        targetCheck = clazz.TARGET_CHECK;
        if (targetCheck) {
          // use bitwise & to compare for the bitmask!
          var found = false;
          if (isDomNode && (targetCheck & IEventHandler.TARGET_DOMNODE) != 0) {
            found = true;
          } else if (
            isWindow &&
            (targetCheck & IEventHandler.TARGET_WINDOW) != 0
          ) {
            found = true;
          } else if (
            isObject &&
            (targetCheck & IEventHandler.TARGET_OBJECT) != 0
          ) {
            found = true;
          } else if (
            isDocument &&
            (targetCheck & IEventHandler.TARGET_DOCUMENT) != 0
          ) {
            found = true;
          }

          if (!found) {
            continue;
          }
        }

        instance = this.getHandler(classes[i]);
        if (clazz.IGNORE_CAN_HANDLE || instance.canHandleEvent(target, type)) {
          cache[key] = instance;
          return instance;
        }
      }

      return null;
    },

    /**
     * This method is called each time an event listener for one of the
     * supported events is added using {qx.event.Manager#addListener}.
     *
     * @param target {Object} Any valid event target
     * @param type {String} event type
     * @param capture {Boolean} Whether to attach the event to the
     *         capturing phase or the bubbling phase of the event.
     * @throws {Error} if there is no handler for the event
     */
    __registerAtHandler(target, type, capture) {
      var handler = this.findHandler(target, type);

      if (handler) {
        handler.registerEvent(target, type, capture);
        return;
      }

      if (qx.core.Environment.get("qx.debug")) {
        qx.log.Logger.warn(
          this,
          "There is no event handler for the event '" +
            type +
            "' on target '" +
            target +
            "'!"
        );
      }
    },

    /**
     * Remove an event listener from an event target.
     *
     * @param target {Object} Any valid event target
     * @param type {String} Name of the event
     * @param listener {Function} The pointer to the event listener
     * @param self {Object ? null} Reference to the 'this' variable inside
     *         the event listener.
     * @param capture {Boolean ? false} Whether to remove the event listener of
     *         the bubbling or of the capturing phase.
     * @return {Boolean} Whether the event was removed successfully (was existant)
     * @throws {Error} if the parameters are wrong
     */
    removeListener(target, type, listener, self, capture) {
      if (qx.core.Environment.get("qx.debug")) {
        var msg =
          "Failed to remove event listener for type '" +
          type +
          "'" +
          " from the target '" +
          target.classname +
          "': ";

        qx.core.Assert.assertObject(target, msg + "Invalid Target.");
        qx.core.Assert.assertString(type, msg + "Invalid event type.");
        qx.core.Assert.assertFunction(
          listener,
          msg + "Invalid callback function"
        );

        if (self !== undefined) {
          qx.core.Assert.assertObject(self, "Invalid context for callback.");
        }

        if (capture !== undefined) {
          qx.core.Assert.assertBoolean(capture, "Invalid capture flag.");
        }
      }

      var targetKey =
        target.$$hash || qx.core.ObjectRegistry.toHashCode(target);
      var targetMap = this.__listeners.get(targetKey);

      if (!targetMap) {
        return false;
      }
      var entryKey = type + (capture ? "|capture" : "|bubble");
      var entryMap = targetMap.get(entryKey);

      if (!entryMap) {
        return false;
      }
      var deleted = false;

      for (const [entryKey, entry] of entryMap
        .entries()
        .filter(([eK, e]) => e.handler === listener && e.context === self)) {
        deleted = true;
        entryMap.delete(entryKey);
        this.__addToBlacklist(entryKey);
        if (entryMap.size === 0) {
          this.__unregisterAtHandler(target, type, capture);
        }
      }
      return deleted;
    },

    /**
     * Removes an event listener from an event target by an ID returned by
     * {@link #addListener}.
     *
     * @param target {Object} The event target
     * @param id {String} The ID returned by {@link #addListener}
     * @return {Boolean} <code>true</code> if the handler was removed
     */
    removeListenerById(target, id) {
      if (qx.core.Environment.get("qx.debug")) {
        var msg =
          "Failed to remove event listener for id '" +
          id +
          "'" +
          " from the target '" +
          target.classname +
          "': ";

        qx.core.Assert.assertObject(target, msg + "Invalid Target.");
        qx.core.Assert.assertString(id, msg + "Invalid id type.");
      }

      var split = id.split("|");
      var type = split[0];
      var capture = split[1].charCodeAt(0) === 99; // detect leading "c"
      var unique = split[2];

      var targetKey =
        target.$$hash || qx.core.ObjectRegistry.toHashCode(target);
      var targetMap = this.__listeners.get(targetKey);

      if (!targetMap) {
        return false;
      }

      var entryKey = type + (capture ? "|capture" : "|bubble");
      var entryMap = targetMap.get(entryKey);

      if (!entryMap) {
        return false;
      }

      var entry = entryMap.get(unique);
      if (entry) {
        entryMap.delete(unique);
        this.__addToBlacklist(entry.unique);
        if (entryMap.size === 0) {
          this.__unregisterAtHandler(target, type, capture);
        }
        return true;
      }
      return false;
    },

    /**
     * Remove all event listeners, which are attached to the given event target.
     *
     * @param target {Object} The event target to remove all event listeners from.
     * @return {Boolean} Whether the events were existant and were removed successfully.
     */
    removeAllListeners(target) {
      var targetKey =
        target.$$hash || qx.core.ObjectRegistry.toHashCode(target);
      var targetMap = this.__listeners.get(targetKey);
      if (!targetMap) {
        return false;
      }

      // Deregister from event handlers
      var split, type, capture;
      for (const [entryKey, entryMap] of targetMap) {
        if (entryMap && entryMap.size > 0) {
          // This is quite expensive, see bug #1283
          split = entryKey.split("|");

          for (const uniqueKey of entryMap.keys()) {
            this.__addToBlacklist(uniqueKey);
          }
          entryMap.clear();

          type = split[0];
          capture = split[1] === "capture";

          this.__unregisterAtHandler(target, type, capture);
        }
      }

      this.__listeners.delete(targetKey);
      return true;
    },

    /**
     * Internal helper for deleting the internal listener  data structure for
     * the given targetKey.
     *
     * @param targetKey {String} Hash code for the object to delete its
     *   listeners.
     *
     * @internal
     */
    deleteAllListeners(targetKey) {
      this.__listeners.delete(targetKey);
    },

    /**
     * This method is called each time the an event listener for one of the
     * supported events is removed by using {qx.event.Manager#removeListener}
     * and no other event listener is listening on this type.
     *
     * @param target {Object} Any valid event target
     * @param type {String} event type
     * @param capture {Boolean} Whether to attach the event to the
     *         capturing phase or the bubbling phase of the event.
     * @throws {Error} if there is no handler for the event
     */
    __unregisterAtHandler(target, type, capture) {
      var handler = this.findHandler(target, type);

      if (handler) {
        handler.unregisterEvent(target, type, capture);
        return;
      }

      if (qx.core.Environment.get("qx.debug")) {
        qx.log.Logger.warn(
          this,
          "There is no event handler for the event '" +
            type +
            "' on target '" +
            target +
            "'!"
        );
      }
    },

    /*
    ---------------------------------------------------------------------------
      EVENT DISPATCH
    ---------------------------------------------------------------------------
    */

    /**
     * Dispatches an event object using the qooxdoo event handler system. The
     * event will only be visible in event listeners attached using
     * {@link #addListener}. After dispatching the event object will be pooled
     * for later reuse or disposed.
     *
     * Unlike `dispatchEventAsync` this method will not wait for async property
     * handlers to complete before returning - this means that only synchronous
     * event handlers will have the opportunity to prevent the event default action.
     *
     * @param target {Object} Any valid event target
     * @param event {qx.event.type.Event} The event object to dispatch. The event
     *     object must be obtained using {@link qx.event.Registration#createEvent}
     *     and initialized using {@link qx.event.type.Event#init}.
     * @return {Boolean|qx.Promise} whether the event default was prevented or not.
     *     Returns true, when the event was NOT prevented.
     * @throws {Error} if there is no dispatcher for the event
     */
    dispatchEvent(target, event) {
      let promise = this.__dispatchEventImpl(target, event);

      // check whether "preventDefault" has been called
      var preventDefault = event.getDefaultPrevented();
      if (qx.lang.Type.isPromise(promise)) {
        promise.then(() => qx.event.Pool.getInstance().poolObject(event));
      } else {
        qx.event.Pool.getInstance().poolObject(event);
      }

      return !preventDefault;
    },

    /**
     * Dispatches an event object using the qooxdoo event handler system. The
     * event will only be visible in event listeners attached using
     * {@link #addListener}. After dispatching the event object will be pooled
     * for later reuse or disposed.
     *
     * Unlike `dispatchEvent`, this method returns a promise and waits for any
     * async event handlers to resolve before discovering whether the event
     * default was prevented or not.
     *
     * @param target {Object} Any valid event target
     * @param event {qx.event.type.Event} The event object to dispatch. The event
     *     object must be obtained using {@link qx.event.Registration#createEvent}
     *     and initialized using {@link qx.event.type.Event#init}.
     * @return {qx.Promise<Boolean>} a promise which resolves to whether the event
     *    default was prevented or not - true when the event was NOT prevented.
     * @throws {Error} if there is no dispatcher for the event
     */
    async dispatchEventAsync(target, event) {
      await this.__dispatchEventImpl(target, event);

      var preventDefault = event.getDefaultPrevented();
      qx.event.Pool.getInstance().poolObject(event);

      return !preventDefault;
    },

    /**
     * Dispatches an event object using the qooxdoo event handler system. The
     * event will only be visible in event listeners attached using
     * {@link #addListener}. After dispatching the event object will be pooled
     * for later reuse or disposed.
     *
     * @param target {Object} Any valid event target
     * @param event {qx.event.type.Event} The event object to dispatch. The event
     *     object must be obtained using {@link qx.event.Registration#createEvent}
     *     and initialized using {@link qx.event.type.Event#init}.
     * @return {qx.Promise?} the result of any asynchronous event handlers
     * @throws {Error} if there is no dispatcher for the event
     */
    __dispatchEventImpl(target, event) {
      if (qx.core.Environment.get("qx.debug")) {
        var msg =
          "Could not dispatch event '" +
          event +
          "' on target '" +
          target.classname +
          "': ";

        qx.core.Assert.assertNotUndefined(
          target,
          msg + "Invalid event target."
        );

        qx.core.Assert.assertNotNull(target, msg + "Invalid event target.");
        qx.core.Assert.assertInstance(
          event,
          qx.event.type.Event,
          msg + "Invalid event object."
        );
      }

      // Show the decentrally fired events to one or more global monitor functions
      var monitors = qx.event.Manager.__globalEventMonitors;
      if (monitors.length) {
        for (var i = 0; i < monitors.length; i++) {
          var preventDefault = event.getDefaultPrevented();
          try {
            monitors[i].call(monitors[i].$$context, target, event);
          } catch (ex) {
            qx.log.Logger.error(
              "Error in global event monitor function " +
                monitors[i].toString().slice(0, 50) +
                "..."
            );

            // since 6.0.0-beta-2020051X: throw a real error to stop execution instead of just a warning
            throw ex;
          }
          if (preventDefault != event.getDefaultPrevented()) {
            // since 6.0.0-beta-2020051X: throw a real error to stop execution instead of just a warning
            throw new Error(
              "Unexpected change by global event monitor function, modifications to event " +
                event.getType() +
                " is not allowed."
            );
          }
        }
      }

      // Preparations
      var type = event.getType();

      if (!event.getBubbles() && !this.hasListener(target, type)) {
        return true;
      }

      if (!event.getTarget()) {
        event.setTarget(target);
      }

      // Interacion data
      var classes = this.__registration.getDispatchers();
      var instance;

      // Loop through the dispatchers
      var dispatched = false;
      let promise = null;

      for (var i = 0, l = classes.length; i < l; i++) {
        instance = this.getDispatcher(classes[i]);

        // Ask if the dispatcher can handle this event
        if (instance.canDispatchEvent(target, event, type)) {
          let tmp = instance.dispatchEvent(target, event, type);
          promise = qx.event.Utils.queuePromise(promise, tmp);

          dispatched = true;
          break;
        }
      }

      if (!dispatched) {
        if (qx.core.Environment.get("qx.debug")) {
          qx.log.Logger.error(
            this,
            "No dispatcher can handle event of type " + type + " on " + target
          );
        }
        return true;
      }

      return promise;
    },

    /**
     * Dispose the event manager
     */
    dispose() {
      // Remove from manager list
      this.__registration.removeManager(this);

      qx.util.DisposeUtil.disposeMap(this, "__handlers");
      qx.util.DisposeUtil.disposeMap(this, "__dispatchers");

      // Dispose data fields
      this.__listeners = this.__window = this.__disposeWrapper = null;
      this.__registration = this.__handlerCache = null;
    },

    /**
     * Add event to blacklist.
     *
     * @param uid {String} unique event id
     */
    __addToBlacklist(uid) {
      if (this.__blacklist === null) {
        this.__blacklist = {};
        this.__clearBlackList.schedule();
      }
      this.__blacklist[uid] = true;
    },

    /**
     * Check if the event with the given id has been removed and is therefore blacklisted for event handling
     *
     * @param uid {String} unique event id
     * @return {boolean}
     */
    isBlacklisted(uid) {
      return this.__blacklist !== null && this.__blacklist[uid] === true;
    }
  }
});
