/**
 * A ReactiveVar is an object which stores/keeps track of a value and fires an event when the value changes.
 * This is similar to the TC39 Signals proposal but much simpler.
 * This can be used for things like composing multiple ReactiveVars in order to create a derived ReactiveVar,
 * used for when one expression is dependent on multiple inputs which may change, which cannot be done by SingleValueBinding's.
 * You can also map a ReactiveVar array to another array which automatically updates when the input array changes.
 * 
 * @template ValueType Type of the value of this ReactiveVar
 */
qx.Class.define("qx.data.reactivevar.ReactiveVar", {
  type: "abstract",
  extend: qx.core.Object,
  construct() {
    super();
    this.__trackers = [];
    this.addListener("changeValue", this.__updateTrackers, this);
  },
  destruct() {
    this.removeListener("changeValue", this.__updateTrackers, this);
    if (this.trackArrayChange && this.getValue() && this.getValue() instanceof qx.data.Array) {
      this.getValue().removeListener("change", this.__onArrayChange, this);
    }
  },
  properties: {
    /**
     * @type {ValueType}
     * The value of this ReactiveVar. If it's a qx.data.Array, this object will fire "changeValue" event when the array fires a "change" event as well.
     */
    value: {
      nullable: true,
      event: "changeValue",
      apply: "_applyValue"
    },
    /**
     * Whether to track changes of the array if the value is a qx.data.Array.
     * This can be set at most once.
     */
    trackArrayChange: {
      init: true,
      check: "Boolean"
    }
  },
  members: {
    _isInDerived: false, // Whether this ReactiveVar is being used in a Derived ReactiveVar. This is used to prevent a ReactiveVar from being used in multiple Derived ReactiveVars.
    _applyValue(value, oldValue) {
      if (value) {
        if (this.trackArrayChange && value && (value instanceof qx.data.Array)) {
          value.addListener("change", this.__onArrayChange, this);
        }
      }
      if (oldValue) {
        if (this.trackArrayChange && oldValue && (oldValue instanceof qx.data.Array)) {
          oldValue.removeListener("change", this.__onArrayChange, this);
        }
      }
    },
    /**
     * Makes callback be called immediately with the current value, and then whenever the value changes.
     * @param {Tracker} callback 
     * 
     * @callback Tracker
     * @param {ValueType} value The current value of the ReactiveVar  
     * @param {ValueType} oldValue The old value of the ReactiveVar.
     */
    trackValue(callback) {
      callback(this.getValue());
      this.__trackers.push(callback);
    },

    /**
     * Removes a tracker added by `this.trackValue()`.
     * @param {Tracker} callback 
     */
    removeTracker(callback) {
      qx.lang.Array.remove(this.__trackers, callback);
    },

    /**
     * Event handler for "changeValue" event, calls all trackers with the new and old value.
     * @param {qx.event.type.Event} evt 
     * @returns {=Promise} If any of the trackers returned a Promise, returns a Promise that resolves when all of them resolve.
     */
    __updateTrackers(evt) {
      let promises = [];
      for (const tracker of this.__trackers) {
        let out = tracker(evt.getData(), evt.getOldData());
        if (qx.lang.Type.isPromise(out)) {
          promises.push(out);
        }
      }
      if (promises.length) {
        return Promise.all(promises);
      }
    },
    get() {
      let gettersCallback = qx.data.reactivevar.ReactiveVar.__onGetCallback ?? (() => {});
      gettersCallback(this);
      return this.getValue();
    },
    __onArrayChange() {
      let value = this.getValue();
      this.fireDataEvent("changeValue", value, value);
    }
  },
  statics: {
    /**
     * For internal use only
     */
    __onGetCallback: null,
    /**
     * For internal use only.
     * Used to track dependencies in Derived ReactiveVars.
     */
    setOnGetCallback(callback) {
      const ReactiveVar = qx.data.reactivevar.ReactiveVar;
      if (qx.core.Environment.get("qx.debug")) {
        if (ReactiveVar.__onGetCallback && callback) {
          throw new Error("ReactiveVar: Cannot set onGetCallback, because there is already one set. Did you forget to call setOnGetCallback(null)?");
        }
      }
      ReactiveVar.__onGetCallback = callback;
    }
  }
});