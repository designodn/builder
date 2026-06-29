#!/usr/bin/env node
// heal-cleanup-sandbox: эмитит плагин-код, который удаляет все __heal_sandbox__
// фреймы со страницы. Запускается агентом после визуального sanity-check.
//
// Usage:
//   node tests/scripts/heal-cleanup-sandbox.js          → emit plugin
//   агент подаёт plugin в use_figma → sandbox'ы удалены

const code = `
(async () => {
  const targets = figma.currentPage.findAll(n => n.name && n.name.startsWith('__heal_sandbox__'));
  const removed = [];
  for (const t of targets) {
    try { removed.push({ id: t.id, name: t.name }); t.remove(); }
    catch (e) { removed.push({ id: t.id, name: t.name, error: e.message }); }
  }
  return { removed, count: removed.length };
})();
`.trim();

console.log(code);
