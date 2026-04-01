/**
 * This class creates a ReactiveVar from another ReactiveVar whose value type is an Array,
 * and it maps items in the input array to other values using the provided mapper function.
 * 
 * When the input array changes (i.e. elements added/removed),
 * we want to be able to re-use the existing output items as much as possible,
 * so we keep track of the output items using keys which are derived from the input items using the getKey function.
 * The output items which match input items which are still in the input are kept, while any unused ones are disposed using the dispose function.
 * If a key function is not provided, the whole output array will be disposed and re-created again when the input array changes,
 * which is less efficient but may be acceptable when creating/disposing objects is cheap and/or the array is small.
 * 
 * @template InputType Type of items in the input array
 * @template KeyType Type of the key used to keep track of items. It must be a valid key type for a JavaScript Map, and be unique for each item in the input array.
 * @template OutputType Type of items in the output array
 */
qx.Class.define("qx.svelte.reactivevar.ArrayMapper", {
  extend: qx.svelte.reactivevar.ReactiveVar,
  /**
   * @param {qx.svelte.reactivevar.ReactiveVar<InputType>} input 
   * @param {(x: InputType) => [OutputType, Function]} mapFunc A function which maps the input item to the output item. It also returns a dispose function which is called when the item is removed from the array.
   * @param {(x: InputType) => KeyType} [getKey] A function which returns the key for an item. The key must be unique for each item in the input array.
   */
  construct(input, getKey, mapFunc) {
    super();
    this.__input = input;
    this.__mapFunc = mapFunc;
    this.__getKey = getKey;
    this.__outputForKey = new Map();

    input.addListener("changeValue", this.__onInputChange, this);
    this.__update(input.getValue());
  },
  properties: {
    /**
     * The instance of this will NEVER change
     */
    value: {
      refine: true,
      check: "qx.data.Array<OutputType>",
      initFunction: () => new qx.data.Array()
    }
  },
  destruct() {
    this.__input.dispose();
    this.__outputForKey.forEach(({dispose}) => dispose());
  },
  members: {
    /**
     * @type {qx.svelte.reactivevar.ReactiveVar<InputType>}
     */
    __input: null,
    /**
     * @type {Map.<KeyType, OutputItemInfo>}
     * 
     * @typedef {Object} OutputItemInfo
     * @property {OutputType} value The output item corresponding to the key
     * @property {Function} dispose A function which is called to dispose the output item when it is removed from the array.
     */
    __outputForKey: null,

    __onInputChange(evt) {
      this.__update(evt.getData());
    },
    __update(input) {
      if (qx.core.Environment.get("qx.debug")) {
        if (!(input instanceof qx.data.Array)) {
          throw new Error("The input ReactiveVar for an ArrayMapper must be a qx.data.Array, but got :" + input);
        }

        if (this.__getKey) {
          let inputKeys = input.map(this.__getKey);
          let uniqueKeys = new Set(inputKeys);
          if (inputKeys.length !== uniqueKeys.size) {
            throw new Error("The keys returned by getKey are not unique. Keys: " + inputKeys);
          }
        }
      }

      if (!this.__getKey) {
        // If there is no getKey function, we cannot keep track of items, so we just dispose all existing items and create new ones.
        this.__outputForKey.forEach(({dispose}) => dispose());
        this.__outputForKey.clear();
        input.forEach((item, index) => {
          let [value, dispose] = this.__mapFunc(item);
          this.__outputForKey.set(index, {value, dispose});
        });
        this.getValue().replace(Array.from(this.__outputForKey.values()).map(info => info.value));
        return;
      }
      
      let output = [];
      //We will progressively remove keys from this set which still are in the input, and then dispose the ones that remain.
      let remainingKeys = new Set(this.__outputForKey.keys());
      for (let item of input) {
        let key = this.__getKey(item);
        if (qx.core.Environment.get("qx.debug")) {
          if (key == null) {
            throw new Error("getKey returned null or undefined for item " + item);
          }
        }
        remainingKeys.delete(key);
        if (this.__outputForKey[key]) {
          output.push(this.__outputForKey[key].value);
        } else {
          let [value, dispose] = this.__mapFunc(item);
          this.__outputForKey.set(key, {value, dispose: dispose ?? (() => {})});
          output.push(value);
        }
      }
      for (let key of remainingKeys) {
        let {value, dispose} = this.__outputForKey.get(key);
        if (dispose) {
          dispose();
        }
        if (value instanceof qx.core.Object) {
          value.dispose();//TODO add property for dispose
        }
        this.__outputForKey.delete(key);
      }
      this.getValue().replace(Array.from(this.__outputForKey.values()).map(info => info.value));
    }
  }
});