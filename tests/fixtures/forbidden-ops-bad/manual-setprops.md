# Bad: прямой setProperties вне applyRuleDriven

```js
const inst = comp.createInstance();
inst.setProperties({ 'slot#1:0': child.id });
```

Должно быть через applyRuleDriven helper.
