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
  destruct() {
    if (this.getValue() instanceof qx.data.Array) {
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
    }
  },
  members: {
    _applyValue(value, oldValue) {
      if (value) {
        if (value instanceof qx.data.Array) {
          value.addListener("change", this.__onArrayChange, this);
        }
      }
      if (oldValue) {
        if (oldValue instanceof qx.data.Array) {
          oldValue.removeListener("change", this.__onArrayChange, this);
        }
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