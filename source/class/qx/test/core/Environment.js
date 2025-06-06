/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2004-2011 1&1 Internet AG, Germany, http://www.1und1.de

   License:
     MIT: https://opensource.org/licenses/MIT
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * Martin Wittemann (martinwittemann)

************************************************************************ */

/**
 * @require(qx.ui.core.scroll.MScrollBarFactory)
 */

qx.Class.define("qx.test.core.Environment", {
  extend: qx.test.ui.LayoutTestCase,

  members: {
    // /////////////////////////////////
    // TESTS FOR THE ENVIRONMENT CLASS
    // ////////////////////////////// //
    testGet() {
      // fake the check
      qx.core.Environment.getChecks()["affe"] = function () {
        return "affe";
      };
      this.assertEquals("affe", qx.core.Environment.get("affe"));
      // clear the fake check
      delete qx.core.Environment.getChecks()["affe"];
      qx.core.Environment.invalidateCacheKey("affe");
    },

    testGetAsync() {
      // fake the check
      qx.core.Environment.getAsyncChecks()["affe"] = function (clb, self) {
        window.setTimeout(function () {
          clb.call(self, "affe");
        }, 0);
      };

      qx.core.Environment.getAsync(
        "affe",
        function (result) {
          this.resume(function () {
            this.assertEquals("affe", result);
            // clear the fake check
            delete qx.core.Environment.getAsyncChecks()["affe"];
            qx.core.Environment.invalidateCacheKey("affe");
          }, this);
        },
        this
      );

      this.wait();
    },

    testSelect() {
      // fake the check
      qx.core.Environment.getChecks()["affe"] = function () {
        return "affe";
      };
      var test;
      test = qx.core.Environment.select("affe", {
        affe: "affe"
      });

      this.assertEquals(test, "affe");
      // clear the fake check
      delete qx.core.Environment.getChecks()["affe"];
      qx.core.Environment.invalidateCacheKey("affe");
    },

    testSelectDefault() {
      // fake the check
      qx.core.Environment.getChecks()["affe"] = function () {
        return "affe";
      };
      var test;
      test = qx.core.Environment.select("affe", {
        default: "affe"
      });

      this.assertEquals(test, "affe");
      // clear the fake check
      delete qx.core.Environment.getChecks()["affe"];
      qx.core.Environment.invalidateCacheKey("affe");
    },

    testSelectAsync() {
      // fake the check
      qx.core.Environment.addAsync("affe", function (clb, self) {
        window.setTimeout(function () {
          clb.call(self, "AFFE");
        }, 0);
      });

      qx.core.Environment.selectAsync(
        "affe",
        {
          affe(result) {
            this.resume(function () {
              // clear the fake check
              delete qx.core.Environment.getChecks()["affe"];
              qx.core.Environment.invalidateCacheKey("affe");
              this.assertEquals("AFFE", result);
            }, this);
          }
        },

        this
      );

      this.wait();
    },

    testCache() {
      // fake the check
      qx.core.Environment.getChecks()["affe"] = function () {
        return "affe";
      };
      this.assertEquals("affe", qx.core.Environment.get("affe"));
      // clear the fake check
      delete qx.core.Environment.getChecks()["affe"];

      this.assertEquals("affe", qx.core.Environment.get("affe"));

      qx.core.Environment.invalidateCacheKey("affe");
    },

    testCacheInvalidation() {
      // fake the check
      qx.core.Environment.getChecks()["affe"] = function () {
        return "affe";
      };
      this.assertEquals("affe", qx.core.Environment.get("affe"));

      qx.core.Environment.invalidateCacheKey("affe");

      // fake another check
      qx.core.Environment.getChecks()["affe"] = function () {
        return "affe2";
      };
      this.assertEquals("affe2", qx.core.Environment.get("affe"));

      // clear the fake check
      delete qx.core.Environment.getChecks()["affe"];
      qx.core.Environment.invalidateCacheKey("affe");
    },

    testAddFunction() {
      qx.core.Environment.add("qx.test.core.Environment.affe", function () {
        return "AFFE";
      });

      this.assertEquals(
        "AFFE",
        qx.core.Environment.get("qx.test.core.Environment.affe")
      );

      // clear the check
      delete qx.core.Environment.getChecks()["qx.test.core.Environment.affe"];
      qx.core.Environment.invalidateCacheKey("qx.test.core.Environment.affe");
    },

    testAddValue() {
      qx.core.Environment.add("qx.test.core.Environment.affe", "AFFE");

      this.assertEquals(
        "AFFE",
        qx.core.Environment.get("qx.test.core.Environment.affe")
      );

      // clear the check
      delete qx.core.Environment.getChecks()["qx.test.core.Environment.affe"];
      qx.core.Environment.invalidateCacheKey("qx.test.core.Environment.affe");
    },

    testAddAsyncFunction() {
      qx.core.Environment.addAsync("affe", function (clb, self) {
        window.setTimeout(function () {
          clb.call(self, "AFFE");
        }, 0);
      });

      qx.core.Environment.getAsync(
        "affe",
        function (result) {
          this.resume(function () {
            this.assertEquals("AFFE", result);
            // clear the fake check
            delete qx.core.Environment.getAsyncChecks()["affe"];
            qx.core.Environment.invalidateCacheKey("affe");
          }, this);
        },
        this
      );

      this.wait();
    },

    testFilter() {
      // fake the checks
      qx.core.Environment.getChecks()["affe1"] = function () {
        return true;
      };
      qx.core.Environment.getChecks()["affe2"] = function () {
        return false;
      };
      qx.core.Environment.getChecks()["affe3"] = function () {
        return true;
      };

      var array = qx.core.Environment.filter({
        affe1: 1,
        affe2: 2,
        affe3: 3
      });

      this.assertEquals(2, array.length);
      this.assertEquals(1, array[0]);
      this.assertEquals(3, array[1]);

      // clear the fake check
      delete qx.core.Environment.getChecks()["affe1"];
      delete qx.core.Environment.getChecks()["affe2"];
      delete qx.core.Environment.getChecks()["affe3"];
      qx.core.Environment.invalidateCacheKey("affe1");
      qx.core.Environment.invalidateCacheKey("affe2");
      qx.core.Environment.invalidateCacheKey("affe3");
    },

    // //////////////////////////////
    // TESTS FOR THE CHECKS
    // //////////////////////////////
    testEngineName() {
      this.assertNotEquals("", qx.core.Environment.get("engine.name"));
    },

    testEngineVersion() {
      this.assertNotEquals("", qx.core.Environment.get("engine.version"));
    },

    testBrowser() {
      this.assertNotEquals("", qx.core.Environment.get("browser.name"));
      this.assertNotEquals("", qx.core.Environment.get("browser.version"));

      qx.core.Environment.get("browser.documentmode");
      this.assertBoolean(qx.core.Environment.get("browser.quirksmode"));
    },

    testLocale() {
      this.assertNotEquals("", qx.core.Environment.get("locale"));
    },

    testVariant() {
      // just make sure the call is working
      qx.core.Environment.get("locale.variant");
    },

    testOS() {
      // just make sure the call is working
      this.assertString(qx.core.Environment.get("os.name"));
      this.assertString(qx.core.Environment.get("os.version"));
    },

    testQuicktime() {
      // just make sure the call is working
      this.assertBoolean(qx.core.Environment.get("plugin.quicktime"));
      qx.core.Environment.get("plugin.quicktime.version");
    },

    testSkype() {
      // just make sure the call is working
      this.assertBoolean(qx.core.Environment.get("plugin.skype"));
    },

    testWmv() {
      // just make sure the call is working
      this.assertBoolean(qx.core.Environment.get("plugin.windowsmedia"));
      qx.core.Environment.get("plugin.windowsmedia.version");
    },

    testDivx() {
      // just make sure the call is working
      this.assertBoolean(qx.core.Environment.get("plugin.divx"));
      qx.core.Environment.get("plugin.divx.version");
    },

    testSilverlight() {
      // just make sure the call is working
      this.assertBoolean(qx.core.Environment.get("plugin.silverlight"));
      qx.core.Environment.get("plugin.silverlight.version");
    },

    testPdf() {
      // just make sure the call is working
      this.assertBoolean(qx.core.Environment.get("plugin.pdf"));
      qx.core.Environment.get("plugin.pdf.version");
    },

    testIO() {
      // just make sure the call is working
      qx.core.Environment.get("io.maxrequests");
      this.assertBoolean(qx.core.Environment.get("io.ssl"));
    },

    testIOXhr() {
      var xhr = qx.core.Environment.get("io.xhr");
      this.assertString(xhr);

      // Should return "xhr" when standard XHR is available
      if (window.XMLHttpRequest && window.location.protocol !== "file:") {
        this.assertEquals("xhr", xhr);
      }
    },

    testHtml() {
      // just make sure the call is working
      this.assertBoolean(qx.core.Environment.get("html.webworker"));
      this.assertBoolean(qx.core.Environment.get("html.geolocation"));
      this.assertBoolean(qx.core.Environment.get("html.audio"));

      this.assertString(qx.core.Environment.get("html.audio.ogg"));
      this.assertString(qx.core.Environment.get("html.audio.mp3"));
      this.assertString(qx.core.Environment.get("html.audio.wav"));
      this.assertString(qx.core.Environment.get("html.audio.aif"));
      this.assertString(qx.core.Environment.get("html.audio.au"));

      this.assertBoolean(qx.core.Environment.get("html.video"));
      this.assertString(qx.core.Environment.get("html.video.ogg"));
      this.assertString(qx.core.Environment.get("html.video.h264"));
      this.assertString(qx.core.Environment.get("html.video.webm"));
      this.assertBoolean(qx.core.Environment.get("html.storage.local"));
      this.assertBoolean(qx.core.Environment.get("html.storage.session"));
      this.assertBoolean(qx.core.Environment.get("html.storage.userdata"));
      this.assertBoolean(qx.core.Environment.get("html.classlist"));
      this.assertBoolean(qx.core.Environment.get("html.xpath"));
      this.assertBoolean(qx.core.Environment.get("html.xul"));
      this.assertBoolean(qx.core.Environment.get("html.canvas"));
      this.assertBoolean(qx.core.Environment.get("html.svg"));
      this.assertBoolean(qx.core.Environment.get("html.vml"));
      this.assertBoolean(qx.core.Environment.get("html.console"));

      this.assertBoolean(
        qx.core.Environment.get("html.stylesheet.createstylesheet")
      );

      this.assertBoolean(qx.core.Environment.get("html.stylesheet.insertrule"));
      this.assertBoolean(qx.core.Environment.get("html.stylesheet.deleterule"));
      this.assertBoolean(qx.core.Environment.get("html.stylesheet.addimport"));
      this.assertBoolean(
        qx.core.Environment.get("html.stylesheet.removeimport")
      );

      this.assertBoolean(qx.core.Environment.get("html.element.contains"));
      this.assertBoolean(
        qx.core.Environment.get("html.element.compareDocumentPosition")
      );

      this.assertBoolean(qx.core.Environment.get("html.element.textcontent"));
      this.assertBoolean(
        qx.core.Environment.get("html.image.naturaldimensions")
      );

      this.assertBoolean(qx.core.Environment.get("html.history.state"));
      this.assertString(qx.core.Environment.get("html.selection"));
      this.assertBoolean(qx.core.Environment.get("html.node.isequalnode"));
    },

    testXml() {
      this.assertBoolean(qx.core.Environment.get("xml.implementation"));
      this.assertBoolean(qx.core.Environment.get("xml.domparser"));
      this.assertBoolean(qx.core.Environment.get("xml.selectsinglenode"));
      this.assertBoolean(qx.core.Environment.get("xml.selectnodes"));
      this.assertBoolean(qx.core.Environment.get("xml.getelementsbytagnamens"));
      this.assertBoolean(qx.core.Environment.get("xml.domproperties"));
      this.assertBoolean(qx.core.Environment.get("xml.attributens"));
      this.assertBoolean(qx.core.Environment.get("xml.createnode"));
      this.assertBoolean(qx.core.Environment.get("xml.getqualifieditem"));
      this.assertBoolean(qx.core.Environment.get("xml.createelementns"));
    },

    testGears() {
      this.assertBoolean(qx.core.Environment.get("plugin.gears"));
    },

    testActiveX() {
      this.assertBoolean(qx.core.Environment.get("plugin.activex"));
    },

    testCss() {
      this.assertNotEquals("", qx.core.Environment.get("css.boxmodel"));
      this.assertBoolean(qx.core.Environment.get("css.placeholder"));
      this.assertBoolean(qx.core.Environment.get("css.rgba"));
      var boxShadow = qx.core.Environment.get("css.boxshadow");
      this.assert(typeof boxShadow === "string" || boxShadow === null);
      var borderRadius = qx.core.Environment.get("css.borderradius");
      this.assert(typeof borderRadius == "string" || borderRadius === null);
      var borderImage = qx.core.Environment.get("css.borderimage");
      this.assert(typeof borderImage == "string" || borderImage === null);
      var borderImageSyntax = qx.core.Environment.get(
        "css.borderimage.standardsyntax"
      );

      this.assert(
        typeof borderImageSyntax == "boolean" || borderImageSyntax === null
      );

      var textOverflow = qx.core.Environment.get("css.textoverflow");
      this.assert(typeof textOverflow == "string" || textOverflow === null);
      var userSelect = qx.core.Environment.get("css.userselect");
      this.assert(typeof userSelect == "string" || userSelect === null);
      var userSelectNone = qx.core.Environment.get("css.userselect.none");
      this.assert(typeof userSelectNone == "string" || userSelectNone === null);
      var userModify = qx.core.Environment.get("css.usermodify");
      this.assert(typeof userModify == "string" || userModify === null);
      var appearance = qx.core.Environment.get("css.appearance");
      this.assert(typeof appearance == "string" || appearance === null);
      var boxSizing = qx.core.Environment.get("css.boxsizing");
      this.assert(typeof boxSizing == "string" || boxSizing === null);
      var inlineBlock = qx.core.Environment.get("css.inlineblock");
      this.assert(typeof inlineBlock == "string" || inlineBlock === null);
      this.assertBoolean(qx.core.Environment.get("css.opacity"));
      var linearGradient = qx.core.Environment.get("css.gradient.linear");
      this.assert(typeof linearGradient == "string" || linearGradient === null);
      var radialGradient = qx.core.Environment.get("css.gradient.radial");
      this.assert(typeof radialGradient == "string" || radialGradient === null);
      this.assertBoolean(qx.core.Environment.get("css.gradient.legacywebkit"));
      this.assertBoolean(qx.core.Environment.get("css.alphaimageloaderneeded"));
      this.assertBoolean(qx.core.Environment.get("css.pointerevents"));
    },

    testPhoneGap() {
      this.assertBoolean(qx.core.Environment.get("phonegap"));
      this.assertBoolean(qx.core.Environment.get("phonegap.notification"));
    },

    testEvent() {
      this.assertBoolean(qx.core.Environment.get("event.touch"));
      this.assertBoolean(qx.core.Environment.get("event.help"));
      this.assertBoolean(qx.core.Environment.get("event.hashchange"));
      this.assertBoolean(qx.core.Environment.get("event.dispatchevent"));
      this.assertBoolean(qx.core.Environment.get("event.customevent"));
      this.assertBoolean(qx.core.Environment.get("event.mouseevent"));
    },

    testEcmaScript() {
      var stackTrace = qx.core.Environment.get("ecmascript.error.stacktrace");
      this.assert(typeof stackTrace == "string" || stackTrace === null);

      this.assertBoolean(qx.core.Environment.get("ecmascript.array.indexof"));
      this.assertBoolean(
        qx.core.Environment.get("ecmascript.array.lastindexof")
      );

      this.assertBoolean(qx.core.Environment.get("ecmascript.array.foreach"));
      this.assertBoolean(qx.core.Environment.get("ecmascript.array.filter"));
      this.assertBoolean(qx.core.Environment.get("ecmascript.array.map"));
      this.assertBoolean(qx.core.Environment.get("ecmascript.array.some"));
      this.assertBoolean(qx.core.Environment.get("ecmascript.array.every"));
      this.assertBoolean(qx.core.Environment.get("ecmascript.array.reduce"));
      this.assertBoolean(
        qx.core.Environment.get("ecmascript.array.reduceright")
      );

      this.assertBoolean(qx.core.Environment.get("ecmascript.function.bind"));
      this.assertBoolean(qx.core.Environment.get("ecmascript.object.keys"));
      this.assertBoolean(qx.core.Environment.get("ecmascript.date.now"));
      this.assertBoolean(qx.core.Environment.get("ecmascript.error.toString"));
      this.assertBoolean(qx.core.Environment.get("ecmascript.string.trim"));
      this.assertBoolean(qx.core.Environment.get("ecmascript.string.endsWith"));
      this.assertBoolean(
        qx.core.Environment.get("ecmascript.string.startsWith")
      );
    },

    testDataUrl() {
      qx.core.Environment.getAsync(
        "html.dataurl",
        function (result) {
          this.resume(function () {
            this.assertBoolean(result);
          }, this);
        },
        this
      );

      this.wait();
    },

    testDevice() {
      this.assertString(qx.core.Environment.get("device.name"));
    },

    testDeviceType() {
      this.assertString(qx.core.Environment.get("device.type"));
    },

    testDevicePixelRatio() {
      this.assertNumber(qx.core.Environment.get("device.pixelRatio"));
    },

    testQx() {
      this.assertBoolean(qx.core.Environment.get("qx.allowUrlSettings"), "1");
      this.assertBoolean(qx.core.Environment.get("qx.allowUrlVariants"), "2");
      this.assertString(qx.core.Environment.get("qx.application"), "3");
      this.assertNumber(qx.core.Environment.get("qx.debug.dispose.level"), "5");
      this.assertBoolean(
        qx.core.Environment.get("qx.globalErrorHandling"),
        "6"
      );

      this.assertBoolean(qx.core.Environment.get("qx.nativeScrollBars"), "9");
      this.assertNumber(
        qx.core.Environment.get("qx.debug.property.level"),
        "10"
      );

      this.assertBoolean(qx.core.Environment.get("qx.debug"), "11");
      this.assertBoolean(qx.core.Environment.get("qx.aspects"), "12");
      this.assertBoolean(qx.core.Environment.get("qx.dynlocale"), "13");
      this.assertBoolean(
        qx.core.Environment.get("qx.mobile.nativescroll"),
        "15"
      );

      this.assertBoolean(qx.core.Environment.get("qx.dynlocale"), "17");
    },

    testAnimationTransformTransition() {
      // smoke test... make sure the method is doing something
      qx.core.Environment.get("css.animation");
      qx.core.Environment.get("css.transform");
      qx.core.Environment.get("css.transition");

      // 3d transform support
      this.assertBoolean(qx.core.Environment.get("css.transform.3d"));
    },

    /**
     * This test is only run if "qx.environment.allowRuntimeMutations" is false which you need to
     * manually set in the test runner configuration.
     */
    testRuntimeMutationsIfNotAvailable() {
      if (qx.core.Environment.get("qx.environment.allowRuntimeMutations") === false) {
        // the mutation methods should not be available
        for (let key in ['set', 'remove', 'reset']) {
          this.assertUndefined(qx.core.Environment[key], `The method "qx.core.Environment.${key}()" should not be available.`);
        }
      } else {
        this.skip("Runtime mutations are enabled.");
      }
    },

    testRuntimeMutationsIfAvailable() {
      if (qx.core.Environment.get("qx.environment.allowRuntimeMutations") === false) {
        this.skip("Runtime mutations are disabled.");
        return;
      }
      // compile-time environment
      const qxVersion = qx.core.Environment.get("qx.version");
      qx.core.Environment.set("qx.version", "1.0");
      this.assertEquals("1.0", qx.core.Environment.get("qx.version"));
      qx.core.Environment.reset("qx.version");
      this.assertEquals(qxVersion, qx.core.Environment.get("qx.version"));
      qx.core.Environment.remove("qx.version");
      this.assertUndefined(qx.core.Environment.get("qx.version"));

      // runtime environment
      const browserName = qx.core.Environment.get("browser.name");
      qx.core.Environment.set("browser.name", "lynx");
      this.assertEquals("lynx", qx.core.Environment.get("browser.name"));
      qx.core.Environment.reset("browser.name");
      this.assertEquals(browserName, qx.core.Environment.get("browser.name"));
      qx.core.Environment.remove("browser.name");
      this.assertUndefined(qx.core.Environment.get("browser.name"));

      // cleanup
      qx.core.Environment.reset();
      this.assertEquals(qxVersion, qx.core.Environment.get("qx.version"));
      this.assertEquals(browserName, qx.core.Environment.get("browser.name"));
    }
  }
});
