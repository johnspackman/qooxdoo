/**
 * This class is used to record the ReactiveVar's that were created for a specific virtual DOM element (qx.html.Element),
 * so that they can be disposed when the element is disposed.
 * 
 * The recording is initiated by calling beginRecording(), which returns the array that will hold the instantiated ReactiveVars,
 * unless there is another call to beginRecording() before endRecording() is called, meaning that there is an inner child that also records ReactiveVars.
 * Once we are done, we call endRecording().
 */
qx.Class.define("qx.svelte.reactivevar.Recorder", {//!!remove
  type: "singleton",
  extend: qx.core.Object,  
  members: {
    /**
     * @type {Array<qx.svelte.reactivevar[]>}
     */
    __stack: [],

    /**
     * Adds a reactive variable to the current recording context.
     * @param {qx.svelte.reactivevar} reactiveVar 
     */
    __addVar(reactiveVar) {
      if (qx.core.Environment.get("qx.debug")) {
        if (this.__stack.length === 0) {
          throw new Error(
            "No recording in progress, cannot add reactive variable"
          );
        }
      }
      this.__stack.at(-1).push(reactiveVar);
    },
    __beginRecording() {
      let arr = [];
      this.__stack.push(arr);
      return arr;
    },
    __endRecording() {
      return this.__stack.pop();
    }
  },
  statics: {
    /**
     * Starts recording reactive variables created in the current context.
     * @returns {Array<qx.svelte.reactivevar>} The array of the owned ReactiveVars. This may grow as new ReactiveVars are created.
     */
    beginRecording() {
      return this.getInstance().__beginRecording();
    },
    /**
     * Ends the current reactive variable recording context.
     * @returns {Array<qx.svelte.reactivevar>} The array of the owned ReactiveVars.
     */
    endRecording() {
      return this.getInstance().__endRecording();
    },
    /**
     * Called exclusively by ReactiveVar.
     * Adds a reactive variable to the current array.
     * @param {qx.svelte.reactivevar} reactiveVar 
     */
    addVar(reactiveVar) {
      this.getInstance().__addVar(reactiveVar);
    },

    /**
     * Takes a function which generates a qx.html.Element and returns a function
     * which makes the ReactiveVars created in the generator for that element to be owned by the element,
     * so that they can be disposed when the element is disposed.
     * 
     * @param {() => qx.html.Element} generator 
     * @returns {() => qx.html.Element}
     */
    recordAndStore(generator) {
      return function () {
        let owned = this.beingRecording();
        try {
          var obj = generator();
        } finally {
          this.endRecording();
        }
        if (owned.length > 0) {
          obj.setOwnedReactiveVars(owned);
        }
        return obj;
      }
    }
  }
});