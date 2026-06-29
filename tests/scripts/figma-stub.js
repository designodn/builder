#!/usr/bin/env node
// tests/scripts/figma-stub.js — mock Figma plugin API для unit-тестов helper'ов builder.md.
//
// Контракт зафиксирован issue #205, не менять signature без отдельного issue.
// Поведение проверяется: build-rule-bundle-tests.js (sub-MVP), applyRuleDriven-tests.js (PR-B+).
//
// Не stable public API — это внутренний тестовый stub. Любой sibling-тест может его require'ить,
// но любые расширения координируются в одном issue.
//
// Exported surface:
//   makeStubFigma() → { figma, recorder, makeInstance, makeTextNode, makeComponent, registerComponent }
//
// Recorder events:
//   { type: 'setProperties',  instId, payload: <props-object> }
//   { type: 'importComponentByKeyAsync', instId: null, payload: { key, resolved: boolean } }
//   { type: 'fontName',       instId, payload: <fontName-object> }
//   { type: 'characters',     instId, payload: <string> }
//   { type: 'layoutPositioning', instId, payload: <string> }
//   { type: 'constraints',    instId, payload: <constraints-object> }
//   { type: 'appendChild',    instId, payload: { childId } }
//   { type: 'resize',         instId, payload: { width, height } }
//
// appendChild/resize emit events для assert ordering в PR-B (A-057 invariant:
// «layoutSizing AFTER appendChild» — иначе resize до append'а считает frame-родителя null).
//
// Sentinel key 'MISSING_KEY' — importComponentByKeyAsync rejects с Error('component not found').

'use strict';

function makeStubFigma() {
  const recorder = [];
  const components = new Map();
  // Counter для уникальных swap-child IDs (#205 Step 2 PR-C2 stub upgrade).
  let _swapCounter = 0;

  function makeComponent({ key, id, name = 'MockComponent', componentPropertyDefinitions = {} } = {}) {
    if (!key) throw new Error('makeComponent: key required');
    return {
      key,
      id: id || `comp_${key.slice(0, 8)}`,
      name,
      componentPropertyDefinitions: { ...componentPropertyDefinitions },
    };
  }

  function registerComponent(key, def = {}) {
    components.set(key, makeComponent({ key, ...def }));
  }

  function makeInstance({
    id,
    name = 'MockInstance',
    mainComponent = null,
    componentProperties = {},
    children = [],
  } = {}) {
    if (!id) throw new Error('makeInstance: id required');
    let _layoutPositioning;
    let _constraints;
    const inst = {
      id,
      name,
      type: 'INSTANCE',
      mainComponent,
      children: [...children],
      parent: null,
      componentProperties: { ...componentProperties },
      get layoutPositioning() { return _layoutPositioning; },
      set layoutPositioning(v) {
        _layoutPositioning = v;
        recorder.push({ type: 'layoutPositioning', instId: id, payload: v });
      },
      get constraints() { return _constraints; },
      set constraints(v) {
        _constraints = v;
        recorder.push({ type: 'constraints', instId: id, payload: v });
      },
      setProperties(props) {
        recorder.push({ type: 'setProperties', instId: id, payload: { ...props } });
        // Симулируем Figma INSTANCE_SWAP: при swap'е Figma destroys старую
        // child-ноду и создаёт новую с новым id. Новый child наследует
        // componentProperties от swapped-in компонента (из его
        // componentPropertyDefinitions). Stub upgrade для #205 Step 2 PR-C2.
        //
        // Stub-only conflation: в реальной Figma `instance.componentProperties` —
        // это VALUES; type schema лежит в `mainComponent.componentPropertyDefinitions`.
        // Здесь мы conflate values+defs в одной структуре (тесты передают
        // `{ slot: { type: 'INSTANCE_SWAP' } }` как componentProperties), чтобы
        // safeSetProps и эта симуляция работали без отдельной reflection-инфраструктуры.
        // В real prod helper читает значения через componentProperties, не type — так что
        // conflation не leaks в production-helper, только в stub. См. #205.
        for (const propKey of Object.keys(props)) {
          const def = inst.componentProperties[propKey];
          if (def && def.type === 'INSTANCE_SWAP') {
            const newComponentId = props[propKey];
            // Найти swapped-in компонент по id чтобы скопировать его
            // componentPropertyDefinitions в new child. В реальной Figma это
            // origin instance type info.
            let swappedComp = null;
            for (const c of components.values()) {
              if (c.id === newComponentId) { swappedComp = c; break; }
            }
            const newChildId = `${id}__swap__${propKey}__${++_swapCounter}`;
            const newChild = makeInstance({
              id: newChildId,
              name: `swap_${propKey}`,
              mainComponent: { id: newComponentId },
              componentProperties: swappedComp ? { ...swappedComp.componentPropertyDefinitions } : {},
            });
            newChild.parent = inst;
            inst.children.push(newChild);
            recorder.push({ type: 'instanceSwap', instId: id, payload: { slotProp: propKey, newChildId, newComponentId } });
          }
        }
      },
      appendChild(child) {
        child.parent = inst;
        inst.children.push(child);
        recorder.push({ type: 'appendChild', instId: id, payload: { childId: child.id } });
      },
      resize(w, h) {
        inst.width = w;
        inst.height = h;
        recorder.push({ type: 'resize', instId: id, payload: { width: w, height: h } });
      },
    };
    for (const c of inst.children) c.parent = inst;
    return inst;
  }

  function makeTextNode({
    id,
    fontName = { family: 'Inter', style: 'Regular' },
    characters = '',
  } = {}) {
    if (!id) throw new Error('makeTextNode: id required');
    let _font = fontName;
    let _chars = String(characters);
    return {
      id,
      type: 'TEXT',
      get fontName() { return _font; },
      set fontName(v) {
        _font = v;
        recorder.push({ type: 'fontName', instId: id, payload: v });
      },
      get characters() { return _chars; },
      set characters(v) {
        _chars = String(v);
        recorder.push({ type: 'characters', instId: id, payload: _chars });
      },
    };
  }

  const figma = {
    mixed: Symbol('figma.mixed'),
    importComponentByKeyAsync(key) {
      return new Promise((resolve, reject) => {
        setImmediate(() => {
          if (key === 'MISSING_KEY') {
            recorder.push({ type: 'importComponentByKeyAsync', instId: null, payload: { key, resolved: false } });
            return reject(new Error('component not found'));
          }
          const c = components.get(key) || makeComponent({ key });
          recorder.push({ type: 'importComponentByKeyAsync', instId: null, payload: { key, resolved: true } });
          resolve(c);
        });
      });
    },
    loadFontAsync(_font) {
      return Promise.resolve();
    },
  };

  return { figma, recorder, makeInstance, makeTextNode, makeComponent, registerComponent };
}

module.exports = { makeStubFigma };
