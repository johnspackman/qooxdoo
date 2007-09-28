/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2004-2007 1&1 Internet AG, Germany, http://www.1and1.org

   License:
     LGPL: http://www.gnu.org/licenses/lgpl.html
     EPL: http://www.eclipse.org/org/documents/epl-v10.php
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * Sebastian Werner (wpbasti)
     * Fabian Jakobs (fjakobs)

************************************************************************ */

/**
 *
 */
qx.Class.define("qx.ui2.layout.Basic",
{
  extend : qx.ui2.layout.Abstract,



  /*
  *****************************************************************************
     MEMBERS
  *****************************************************************************
  */

  members :
  {
    // overridden
    add : function(widget, left, top)
    {
      this.base(arguments, widget);
      this._importProperties(widget, arguments, "basic.left", "basic.top");
    },


    // overridden
    layout : function(availWidth, availHeight)
    {
      var children = this.getChildren();
      var child, childHint, childLeft, childTop;

      for (var i=0, l=children.length; i<l; i++)
      {
        child = children[i];

        if (!child.isLayoutValid())
        {
          childHint = child.getSizeHint();

          childLeft = child.getLayoutProperty("basic.left") || 0;
          childTop = child.getLayoutProperty("basic.top") || 0;

          child.layout(childLeft, childTop, childHint.width, childHint.height);
        }
      }
    },


    // overridden
    invalidate : function()
    {
      if (this._sizeHint)
      {
        this.debug("Clear layout cache");
        this._sizeHint = null;
      }
    },


    // overridden
    getSizeHint : function()
    {
      if (this._sizeHint)
      {
        this.debug("Cached size hint: ", this._sizeHint);
        return this._sizeHint;
      }

      var children = this.getChildren();
      var child, childHint, childLeft, childTop;
      var childWidth=0, childHeight=0;


      // Iterate over children
      for (var i=0, l=children.length; i<l; i++)
      {
        child = children[i];

        childHint = child.getSizeHint();
        childLeft = child.getLayoutProperty("basic.left") || 0;
        childTop = child.getLayoutProperty("basic.top") || 0;

        childWidth = Math.max(childWidth, childLeft + childHint.width);
        childHeight = Math.max(childHeight, childTop + childHint.height);
      }


      // Limit dimensions to min/max dimensions
      childWidth = Math.max(Math.min(childWidth, childHint.maxWidth), childHint.minWidth);
      childHeight = Math.max(Math.min(childHeight, childHint.maxHeight), childHint.minHeight);



      // Build hint
      var hint = {
        minWidth : childWidth,
        width : childWidth,
        maxWidth : 32000,
        minHeight : childHeight,
        height : childHeight,
        maxHeight : 32000
      };


      // Return hint
      this.debug("Computed size hint: ", hint);
      return this._sizeHint = hint;
    }
  }
});