# Transpilation examples
## Primitive state
```jsx
<script>
  let counter = $state(0);
</script>

<button onclick={() => counter++}/>
<p>{counter}</p>
```

Transpiles to:
```js
qx.Class.define("Counter", {
  extend: qx.html.Element,
  construct() {
    super();
    let counter = new reactivevar.ReactiveVar(0);
    this.addAll(
      <>
        <button onclick={() => counter.value++}>Click me</button>
        <p>{counter}</p>
      </>
    );
  }  
});
```
## Complex object state

```jsx
<script>
  let fruits = $state(["apple", "orange", "pear"]);
</script>
<button onclick={() => fruits.push("new fruit " + fruits.length)}>Add</button>
<p>Count: {fruits.length}</p>
<p>Json: {JSON.stringify(fruits)}</p>
```

Transpiles to:

```js
qx.Class.define("MyComponent", {
  extend: qx.html.Element,
  construct() {
    super();    
    let fruits = reactivevar.ReactiveProxy(["apple", "orange", "pear"]); //creates a proxy wrapper around the object/array which would listen 
    let fruitsReactive = this._proxyToReactive(fruits);
    this.addAll(
      <>
        <button onclick={() => fruits.push("new fruit " + fruits.length)}>Add</button>
        <p>Count: {this._reactiveVar(ReactiveVar.PropPath, fruits, "length")}</p>
        <p>Json: {this._reactiveVar(ReactiveVar.Derived, () => JSON.stringify(fruitsReactive))}</p>
      </>
    );
  }
});
```

## Derived properties

```js
<script>
  let girls = $state(0);
  let boys = $state(0);
  let total = $derived(girls + boys);
</script>

<button onclick={() => girls++}>Girl</button>
<button onclick={() => boy++}>Boy</button>
<p>Girls: {girls}, boys: {boys}, total: {total}</p>
```

Would transpile to:

```jsx
qx.Class.define("Counter", {
  extend: qx.html.Element,
  construct() {
    super();    
    let girls = this._reactiveVar(reactivevar.ReactiveVar,0);
    let boys = this._reactiveVar(reactivevar.ReactiveVar,0);
    let total = this._reactiveVar(reactivevar.Derived, () => girls.value + boys.value)
    this.addAll(
      <>
        <button onclick={() => girls.value++}>Girl</button>
        <button onclick={() => boys.value++}>Boy</button>
        <p>Boys: {boys}, girls {girls}, total: {total}</p>
      </>
    );
  }
});
```

## Passing properties between components

```jsx
//Parent.svelte

<script>
  import Child from "./Child.svelte"
  let counter = $state(0);
</script>

<button onclick={() => counter++}/>
<Child value={counter}/>

//Child.svelte
<script>
  let {value} = $props();
</script>
<p>{value}</p>
```

Would transpile to:

```js
// Parent
qx.Class.define("Parent", {
  extend: qx.html.Element,
  construct() {
    super();
    let counter = this._reactiveVar(reactivevar.ReactiveVar,0);
    this.addAll(
      <>
        <button onclick={() => counter.value++}>Click me</button>
        <Child value={counter}/>
      </>
    );
  }  
});

// Child
qx.Class.define("Parent", {
  extend: qx.html.Element,
  construct(props) {
    super();
    let { value } = $initProps(props); // this wraps them in reactive var if they are not yet
    this.addAll(
      <>
        <p>{value}</p>
      </>
    );
  }  
});
```

## Bindable properties

```jsx
//PersonEditor.svelte
<script>
  import InputField from "./InputField.svelte";
  let { value } = $props();
</script>
<p>Name</p>
<InputField bind:value={value.name}/>

//InputField.svelte
<script>
  let { value = $bindable() } = $props();  
</script>
<input bind:value={value}>
```

Transpiles to:

```js
qx.Class.define("PersonEditor", {
  extend: qx.html.Element,
  construct(props) {
    super();
    let { value } = initProps(props);
    this.addAll(<>
      <InputField value={new reactivevar.PropertyPath(value, "name")}/>
    </>)
  }
});

qx.Class.define("InputField", {
  extend: qx.html.Element,
  construct(props) {
    super();
    let {value} = initProps(props);
    this.addAll(<>
      <input value={value}/>
    </>);
  }
});
```

When we bind to a property, instead of wrapping into a `reactivevar.Derived`,
we use `reactivevar.PropertyPath`.

**Change**: Make the `<input>` tag support a reactive var which it can change.

## Passing state between functions

Given this code:

```jsx
<script>
  let {value} = $props();//value can a be reactive var, but it might not be
</script>
<p>{zx.utils.Price.format(value)}</p>
```

This would transpile to:

```js
qx.Class.define("PriceField", {
  extend: qx.html.Element,
  construct(props) {
    super();
    let {value} = $initProps(props);
    this.addAll(<>
      <p>{new reactivevar.Derived(() => zx.utils.Price.format(value.value))}</p>
    </>);
  }
});
```
If some JavaScript inside a JSX expression references variables which are either props or states, it will be wrapped in a `reactivevar.Derived`.

## \$effect and bind:this

```jsx
<script>
	let size = $state(50);
	let color = $state('#ff3e00');

	let canvas;

	$effect(() => {
		const context = canvas.getContext('2d');
		context.clearRect(0, 0, canvas.width, canvas.height);

		// this will re-run whenever `color` or `size` change
		context.fillStyle = color;
		context.fillRect(0, 0, size, size);
	});
</script>

<canvas bind:this={canvas} width="100" height="100"></canvas>
```

Transpiles to:

```js
qx.Class.define("Counter", {
  extend: qx.html.Element,
  construct() {
    super();
    let size = reactivevar.ReactiveVar(50);
    let color = reactivevar.ReactiveVar('#ff3e00');

    let canvas;

    this._effect(() => {
      const context = canvas.getContext('2d');
      context.clearRect(0, 0, canvas.width, canvas.height);

      // this will re-run whenever `color` or `size` change
      context.fillStyle = color.get();
      context.fillRect(0, 0, size.get(), size.get());
      return () => {
        console.log("cleanup called");
      }
    });

    this.addAll(<>
      <canvas $onMount={elem => canvas = elem} width="100" height="100"></canvas>
    </>);
  }
});
```

\$onMount makes the callback be called when the node is installed on the DOM,
with the DOM node itself as the argument


## #each

```jsx
<script>
  let fruits = $state(["apple", "orange", "pear"]);  
</script>
<button onclick={() => fruits.push("new fruit " + fruits.length)}>Add</button>
{#each fruits as fruit}
  <p>{fruit}</p>
{/each}
```

Would transpile to:

```js
qx.Class.define("MyComponent", {
  extend: qx.html.Element,
  construct() {
    super();
    let fruits = reactivevar.ReactiveProxy(["apple", "orange", "pear"]);
    this.addAll(
      <>
        <button onclick={() => fruits.push("new fruit " + fruits.length)}>Add</button>
        {reactivevar.ArrayMapper(fruits, null, fruit => <p>{fruit}</p>)}
      </>
    );
  }  
});
```

## #each with keys

```js
class Fruit {
  name;
  constructor(name) {
    this.name = name
  }
}
```

```jsx
<script>
  let fruits = $state([new Fruit("apple"), new Fruit("orange"), new Fruit("pear")]);  //they are qooxdoo objects
</script>
<button onclick={() => fruits.push(new Fruit("fruit " + fruits.length))}>Add</button>
{#each fruits as fruit(fruit)}
  <p>{fruit.name}</p>
{/each}
```

Transpiles to:

```jsx
qx.Class.define("MyComponent", {
  extend: qx.html.Element,
  construct() {
    super();
    const ReactiveVarRecorder = qx.svelte.ReactiveVarRecorder;
    const ReactiveVarRecorder = qx.svelte.ReactiveVarRecorder;
    this._ownedReactiveVars = ReactiveVarRecorder.beginRecording();
    let fruits = qx.svelte.ReactiveProxy.get([new Fruit("apple"), new Fruit("orange"), new Fruit("pear")]);
    this.addAll(
      <>
        <button onclick={() => fruits.push(new Fruit("fruit " + fruits.length))}>Add</button>
        {new reactivevar.ArrayMapper(fruits, fruit => fruit, 
          $storeOwnedReactive(fruit => <p>{new reactiveVar.PropPath(fruit, "name")}</p>)
        )}
      </>
    );
    OwnershipRecorder.endRecording();
  }
});

```

## #if
### Simple:

```jsx
<script>
  let show = $state(false);
</script>
<button onclick={() => show = !show}>Toggle</button>
{#if show}
  <p>Showing!</p>
{:else}
  <p>Hidden!</p>
{/else}
```

Would transpile to:

```js
qx.Class.define("Counter", {
  extend: qx.html.Element,
  construct() {
    super();
    let show = this._reactiveVar(reactivevar.ReactiveVar, false);
    this.addAll(
      <>
        <button onclick={() => show.value = !show.value}>Toggle</button>
        {$if(show, {
          true: () => <p>Showing!</p>,
          false: () => <p>Hidden</p>
        })}
      </>
    );
  }  
});
```

### With else if

```jsx
<script>
  let age = $state(24);
</script>
{#if age >= 18}
  <p>Adult (double: {age * 2})</p>
{:else if age >= 13}
  <p>Teen</p>
{:else}
 <p>Child</p>
{/if}
```
Would transpile to:

```js
//...
construct() {
  super();
  let age = reactivevar.ReactiveVar(24);
  this.addAll(<>
    {
      $if(new reactivevar.Derived(() => age.value >= 18),
        {
          true: () => <p>Adult (double: {new reactivevar.Derived(() => age.value * 2)})</p>,
          false: () => $if(new reactivevar.Derived(() => age.value >= 18), {
            true: () => <p>Teen</p>,
            false: () => <p>Child</p>
          })
        }
      )
    }
  </>)
}

//$if implementation

/**
 * @returns {reactivevar.ReactiveVar}
 */
function $if(expr, {true, false}) {
  return 
}
```

## await

```jsx
{#await promise}
	<!-- promise is pending -->
	<p>waiting for the promise to resolve...</p>
{:then value}
	<!-- promise was fulfilled or not a Promise -->
	<p>The value is {value}</p>
{:catch error}
	<!-- promise was rejected -->
	<p>Something went wrong: {error.message}</p>
{/await}
```

would transpile to:

```js
this.$await(promise, {
  pending: () => <p>waiting for the promise to resolve...</p>,
  onResolved: value => <p>The value is {value}</p>,
  onReject: error => <p>Something went wrong: {error.message}</p>
});

function $await(promise, {pending, onResolved, onRejected}) {
  let rvar = this._reactiveVar(reactivevar.ReactiveVar,null);
  if (!isPromise(promise)) {
    rvar.setValue(onResolved(promise));
  } else {
    rvar.value = pending();
    promise.then(val => rvar.value = onResolved(val), err => rvar.value = onRejected(err));
  }
  return rvar;
}
```

### Reactivity with Qooxdoo objects

```jsx
// StockItemEditor.svelte
<script>
  let { value } = $props(); //value is a Qooxdoo object, wrapped in a reactive var
</script>
<p>Price (in pence)</p>
<input bind:value={value.cost}> ({formatPrice(value.cost)})
```

Transpiles to:
```jsx
construct(props) {
  super(props);
  let { value } = $initProps(props); // value is a reactive var for a Qooxdoo object
  let t2 = this._reactivevar(reactivevar.PropertyPath, value, "cost");  
  this.addAll(
    <>
      <p>Price (in pence)</p>
      <input value={new reactivevar.PropPath(value, "cost")}> ({this._reactivevar(reactivevar.Derived, () => formatPrice(t2.get()))})
    </>
  );
}
```

This works for both Qooxdoo objects and reactive proxies!

## Snippets

```js
<script>
  let counter = $state(0);

  const MySnippet = ({value}) => {
    return <span style="color: red">{value}</span>
  };  
</script>

<button onclick={() => counter++}/>
<p>{counter}</p>
<MySnippet value={counter}/>
```

```js
qx.Class.define("Counter", {
  extend: qx.html.Element,
  construct() {
    super();
    let counter = this._reactiveVar(reactivevar.ReactiveVar,0);
    this.addAll(
      <>
        <button onclick={() => counter.value++}>Click me</button>
        <p>{counter}</p>
      </>
    );
  }  
});
```

# TODO
