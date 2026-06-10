# Handling javascript in JSX

If we have some javascript in a qx.html.Jsx, we do the following (unless it's just a plain identifier):
- For all primitive $state dependecies, convert then to .value calls
- For all pure identifiers which are not initialized to constant values, wrap them in $.toReactiveVar(), which will convert reactive proxies to reactive vars.
- For all object path expressions, wrap them in reactivevar.PropPath(...)
- Wrap the whole result in a reactivevar.Derived

# TODO

- Make reactivevar.value fire an event when accessed