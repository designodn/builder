# Bad: mainComponent.key reflection

```js
const k = inst.mainComponent.key;
```

Идентификация через registry/index.json + bundle.rulesBySlug, не runtime reflection.
