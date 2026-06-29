# Bad: findOne by name

```js
const node = figma.root.findOne(n => n.name === 'Profile');
```

Должно быть getNodeByIdAsync.
