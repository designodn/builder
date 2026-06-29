# <component-name>

`<componentKey>` · `<libId>` · `c | s` (component / set)

## Когда использовать

<1–2 предложения: для какой роли в макете подходит и какие альтернативы>

## Скелет вызова

```js
var c = await figma.importComponentByKeyAsync('<componentKey>');
var inst = c.createInstance();
parent.appendChild(inst);
inst.layoutSizingHorizontal = 'FILL';
inst.setProperties({
  // TEXT props и BOOLEAN/VARIANT — здесь
});
// INSTANCE_SWAP — нужны impCompByKey/impSetByKey, см. таблицу
```

## Пропы (полный список)

> Колонки **«когда»** и **«что подать»** заполняются вручную; **prop / type / default** — из `componentPropertyDefinitions`. Если проп не нужен в типичном сценарии — оставь TODO или поставь прочерк `—`.

| prop | type | default | когда использовать | что подать |
|---|---|---|---|---|
| `<prop-name>` | TEXT | `<default>` | TODO | TODO |
| `<prop-name>` | INSTANCE_SWAP | placeholder | TODO | один из ключей из «preferred values» ниже, либо `—` |
| `<prop-name>` | BOOLEAN | `true` / `false` | TODO | `true` / `false` |
| `<variant-name>` | VARIANT | `<default>` | TODO | один из вариантов, см. ниже |

## INSTANCE_SWAP — preferred values

(только для swap-пропов; описывай каждый ключ — это позволит Builder выбрать правильный)

### `<swap-prop>`

- `<key>` · TODO — что это компонент / когда выбрать
- `<key>` · TODO

## VARIANT — варианты

### `<variant-prop>`

- `<value>` · TODO — что это значит
- `<value>` · TODO

## Доступ к вложенным TEXT-нодам после свапа

(если применимо: после свапа какого-то слота — куда писать текст)

```js
inst.setProperties({ '<swap-prop>': someSet.defaultVariant.id });
// после свапа slot имеет имя ... — добраться:
var inner = inst.findOne(function(n){ return n.type==='INSTANCE' && n.name === '<slot-name>'; });
inner.setProperties({ '<inner-text-prop>': 'строка' });
// или, если у swapped-варианта нет TEXT-пропа — через прямой узел:
// var t = inner.findOne(function(n){ return n.type==='TEXT' && n.name === '<text-node-name>'; });
// t.characters = 'строка';
```

## Anti-patterns

- ❌ TODO

## Заметки

(всё прочее — Code Connect, известные баги, ссылки на issues)
