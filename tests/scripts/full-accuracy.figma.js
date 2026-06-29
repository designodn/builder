// Figma plugin code for /test --full step 7.6 — programmatic accuracy check
// against the page `test N`. Runs inside `use_figma`. Returns a metrics object.
//
// Conventions: Figma plugin runtime is ES5-ish — only `var` and `function(){}`,
// no `const`/`let`, no arrow functions.
//
// Caller (the /test command) must set `page` to the test page before exec.
// The script loads the page itself — required when the page isn't currently active.
//
// Metric set after 2026-05-09 cleanup:
//   componentsRendered       — total INSTANCE count across frames (sanity sizing)
//   placeholderHits          — TEXT nodes still showing DS placeholder strings (incl. navbar middle title)
//   skeletonViolations       — meshok ↓ missing or non-absolute, hardcoded paddings, orphan INSTANCE on page
//   placeholderSignal        — INSTANCE_SWAP slots still pointing at default placeholder
//                              (signal, not zero-target — counts both wrappers with `placeholder` mainComponent
//                               and direct frame children with INSTANCE_SWAP value === '12:6')
//   tokenCoverage.{paddings,fills,texts} — fraction bound to DS variables (0..1, higher = better)
await page.loadAsync();

var frames = page.children.filter(function (n) { return n.type === 'FRAME'; });

var totalRendered = 0;
var placeholderHits = 0;
// Orphan INSTANCEs on the page (no parent frame) immediately count as skeleton violations.
var skeletonViolations = page.children.filter(function (n) { return n.type === 'INSTANCE'; }).length;
var placeholderSignal = 0;  // unswapped wrapper slots + INSTANCE_SWAP props with hardcoded '12:6'
var defaults = [
  'Text', 'label', 'hint', 'Title', 'Заголовок', 'subtitle', '',
  'Placeholder', 'placeholder', 'Описание', 'Заголовок 1', 'Заголовок 2',
  'Кнопка', 'Header', 'Content',
];

frames.forEach(function (frame) {
  var instances = frame.findAllWithCriteria({ types: ['INSTANCE'] });
  totalRendered += instances.length;

  // Placeholder TEXT scan (includes navbar middle FRAME 'title' → direct child TEXT name='text')
  var texts = frame.findAll(function (n) { return n.type === 'TEXT'; });
  texts.forEach(function (t) {
    if (defaults.indexOf((t.characters || '').trim()) !== -1) placeholderHits++;
  });

  // meshok ↓ exists and is absolute
  var meshokDown = frame.findOne(function (n) {
    return n.type === 'INSTANCE' && n.name && n.name.indexOf('meshok ↓') === 0;
  });
  if (!meshokDown) skeletonViolations++;
  else if (meshokDown.layoutPositioning !== 'ABSOLUTE') skeletonViolations++;

  // placeholderSignal — wrapper-instances pointing at DS `placeholder` component
  // (default for INSTANCE_SWAP slots; if visible, swap was never made → silent A-034..A-038)
  instances.forEach(function (inst) {
    if (inst.mainComponent && inst.mainComponent.name === 'placeholder') placeholderSignal++;
  });
  // ...plus direct-child INSTANCE_SWAP props still pointing at Figma's '12:6' default
  // (catches systemComponent / ✏️ buttonsView never swapped on meshok ↓, etc.)
  for (var dci = 0; dci < frame.children.length; dci++) {
    var dc = frame.children[dci];
    if (dc.type !== 'INSTANCE' || !dc.componentProperties) continue;
    var dcProps = dc.componentProperties;
    for (var dpk in dcProps) {
      if (Object.prototype.hasOwnProperty.call(dcProps, dpk) &&
          dcProps[dpk] && dcProps[dpk].type === 'INSTANCE_SWAP' && dcProps[dpk].value === '12:6') {
        placeholderSignal++;
      }
    }
  }

  // Hardcoded paddings on builder-created frames count as skeleton violation
  if (frame.paddingLeft != null && frame.paddingLeft !== 0 && !(frame.boundVariables && frame.boundVariables.paddingLeft)) skeletonViolations++;
});

// Token coverage — only nodes created by Builder (outside any INSTANCE parent).
// Internals of imported components are the DS's responsibility.
var tokenChecks = { paddings: 0, paddingsBound: 0, fills: 0, fillsBound: 0, texts: 0, textsBound: 0 };

function isInsideInstance(node) {
  var p = node.parent;
  while (p && p.type !== 'PAGE') {
    if (p.type === 'INSTANCE') return true;
    p = p.parent;
  }
  return false;
}

function checkTokens(node) {
  if (isInsideInstance(node)) {
    if ('children' in node && Array.isArray(node.children)) node.children.forEach(checkTokens);
    return;
  }
  if (node.layoutMode && node.layoutMode !== 'NONE') {
    ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'itemSpacing'].forEach(function (p) {
      if (typeof node[p] === 'number' && node[p] !== 0) {
        tokenChecks.paddings++;
        if (node.boundVariables && node.boundVariables[p]) tokenChecks.paddingsBound++;
      }
    });
  }
  if (node.fills && Array.isArray(node.fills) && node.type !== 'INSTANCE') {
    node.fills.forEach(function (f, idx) {
      if (f.type === 'SOLID' && f.visible !== false) {
        tokenChecks.fills++;
        if (node.boundVariables && node.boundVariables.fills && node.boundVariables.fills[idx]) tokenChecks.fillsBound++;
      }
    });
  }
  if (node.type === 'TEXT') {
    tokenChecks.texts++;
    if (node.textStyleId && node.textStyleId !== '' && node.textStyleId !== figma.mixed) tokenChecks.textsBound++;
  }
  if ('children' in node && Array.isArray(node.children)) node.children.forEach(checkTokens);
}
frames.forEach(checkTokens);

var tokenCoverage = {
  paddings: tokenChecks.paddings ? tokenChecks.paddingsBound / tokenChecks.paddings : 1,
  fills: tokenChecks.fills ? tokenChecks.fillsBound / tokenChecks.fills : 1,
  texts: tokenChecks.texts ? tokenChecks.textsBound / tokenChecks.texts : 1,
};

return {
  componentsRendered: totalRendered,
  placeholderHits: placeholderHits,
  skeletonViolations: skeletonViolations,
  placeholderSignal: placeholderSignal,
  tokenCoverage: tokenCoverage,
};
