# Bad: findChild вне helper

```js
const child = inst.findChild(n => n.name === 'cap');
```

Должно быть через bundle.rulesBySlug lookup в helper.
