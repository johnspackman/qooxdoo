/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2025 Henner Kollmann

   License:
     MIT: https://opensource.org/licenses/MIT
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * Henner Kollmann (Henner.Kollmann@gmx.de, @hkollmann)

************************************************************************ */

/**
 * @ignore(require)
 */
qx.Class.define("qx.test.tool.compiler.TranspilerPool", {
  extend: qx.dev.unit.TestCase,

  members: {
    /**
     * Creates a worker factory that spawns inline workers supporting
     * 'echo', 'add', and 'slow' methods.
     */
    __createFactory() {
      const { Worker } = require("worker_threads");
      return () =>
        new Worker(
          `
        const { parentPort } = require('worker_threads');
        parentPort.on('message', async msg => {
          if (msg.type === 'callMethod') {
            let result;
            if (msg.methodName === 'echo') result = msg.args[0];
            else if (msg.methodName === 'add') result = msg.args[0] + msg.args[1];
            else if (msg.methodName === 'slow') result = await new Promise(r => setTimeout(() => r(msg.args[0]), 30));
            parentPort.postMessage({ type: 'methodReturn', result });
          }
        });
        parentPort.postMessage({ type: 'ready' });
      `,
          { eval: true }
        );
    },

    async testWaitForAllReady() {
      let pool = new qx.tool.compiler.TranspilerPool(2, this.__createFactory());
      try {
        await pool.waitForAllReady();
        this.assertTrue(true); // reached here = all workers ready
      } finally {
        pool.dispose();
      }
    },

    async testCallMethodResolvesWithResult() {
      let pool = new qx.tool.compiler.TranspilerPool(1, this.__createFactory());
      try {
        await pool.waitForAllReady();
        let result = await pool.callMethod("echo", [42]);
        this.assertEquals(42, result);
      } finally {
        pool.dispose();
      }
    },

    async testCallMethodAdd() {
      let pool = new qx.tool.compiler.TranspilerPool(1, this.__createFactory());
      try {
        await pool.waitForAllReady();
        let result = await pool.callMethod("add", [3, 7]);
        this.assertEquals(10, result);
      } finally {
        pool.dispose();
      }
    },

    async testCallMethodQueuesMultipleCalls() {
      let pool = new qx.tool.compiler.TranspilerPool(1, this.__createFactory());
      try {
        await pool.waitForAllReady();
        let [r1, r2, r3] = await Promise.all([pool.callMethod("echo", [1]), pool.callMethod("echo", [2]), pool.callMethod("echo", [3])]);
        this.assertEquals(1, r1);
        this.assertEquals(2, r2);
        this.assertEquals(3, r3);
      } finally {
        pool.dispose();
      }
    },

    async testQueueOrdering() {
      let pool = new qx.tool.compiler.TranspilerPool(1, this.__createFactory());
      try {
        await pool.waitForAllReady();
        let results = [];
        await Promise.all([
          pool.callMethod("echo", ["first"]).then(v => results.push(v)),
          pool.callMethod("echo", ["second"]).then(v => results.push(v)),
          pool.callMethod("echo", ["third"]).then(v => results.push(v))
        ]);
        this.assertArrayEquals(["first", "second", "third"], results);
      } finally {
        pool.dispose();
      }
    },

    async testCallAllDispatchesToAll() {
      let pool = new qx.tool.compiler.TranspilerPool(3, this.__createFactory());
      try {
        await pool.waitForAllReady();
        let results = await pool.callAll("echo", [99]);
        this.assertEquals(3, results.length);
        for (let r of results) {
          this.assertEquals(99, r);
        }
      } finally {
        pool.dispose();
      }
    },

    async testCallAllThrowsWhenBusy() {
      let pool = new qx.tool.compiler.TranspilerPool(1, this.__createFactory());
      try {
        await pool.waitForAllReady();
        // Start a slow call to make the worker busy
        let slowPromise = pool.callMethod("slow", ["busy"]);
        this.assertException(() => pool.callAll("echo", [1]), Error, "Cannot call `callAll` when some are busy.");
        await slowPromise; // let it finish cleanly
      } finally {
        pool.dispose();
      }
    },

    async testDefaultPoolSize() {
      const os = require("os");
      let expectedSize = os.cpus().length - 1;
      // Just verify the pool can be constructed with default size using a factory
      // (we pass factory to avoid spawning real transpiler workers)
      let pool = new qx.tool.compiler.TranspilerPool(expectedSize, this.__createFactory());
      try {
        await pool.waitForAllReady();
        let result = await pool.callMethod("echo", ["ok"]);
        this.assertEquals("ok", result);
      } finally {
        pool.dispose();
      }
    },

    async testDestructAfterCalls() {
      let pool = new qx.tool.compiler.TranspilerPool(2, this.__createFactory());
      await pool.waitForAllReady();
      await pool.callMethod("echo", ["done"]);
      // dispose() must not throw
      pool.dispose();
      this.assertTrue(true);
    }
  }
});
