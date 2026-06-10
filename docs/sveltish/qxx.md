# In svelte

## $state
- If wraps over a primitive, this only works within one component only and only works where the compiler can easily see where the state is gotten/updated.
- For complex objects, code referencing the state itself will update, e.g. if we have `let fruits = $state(["apple", "banana"])` and then inside JSX we have `JSON.stringify(fruits)`, the UI will update!

# We will support:

- \$state (a reactive variable) - Fully
  - If primitive value: Compiler will detect references to a primitive value state (i.e. integer, string) in the same file and fire events when it changes and listen to changes where it is referenced. 
  - Objects: Objects and arrays will be wrapped in proxies which will fire events when properties change. For arrays, methods like push, pop etc will be listened to as well. This means changes can propagate across multiple files.
- \$derived
- \$effect
- $$props
  - can be implemented as QX properties

## Differences between Qooxdoo Svelte and vanilla Svelte

- In Svelte, if a child component modifies state from a parent component, that value is only modified locally in the child and will be overridden if the value changes in the parent (https://svelte.dev/docs/svelte/$props#Updating-props:~:text=%24props()%3B-,Updating%20props,-References%20to%20a). In Qooxdoo, either the parent or the child can modify the state and if the property is not bindable, a warning will be shown.

## Important notes
- In QXX, $effect will run when the virtual DOM node AND its children have installed themselves in the actual DOM, and when any dependent states have changed,
in a separate microtask, batched. The teardown function is called when $effect is called after the first time, and when the componenet is unmounted from the DOM.

# Think about those later.
- Local styling
- svelte.js files (non-qooxdoo files)

