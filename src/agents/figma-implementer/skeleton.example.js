// Шаблон plugin-кода для Figma Implementer.
// Подгружай этот файл только если действительно собираешься писать plugin-код.

// 1. Импорт переменных размеров
var screenWidthVar  = await figma.variables.importVariableByKeyAsync('66754fcd2e5bb785b25b1a5001e9048179390aa5');
var screenHeightVar = await figma.variables.importVariableByKeyAsync('5faab23943b2d6283f894f2587748b36bff0b267');

// 2. Импорт компонентов
//    registry/index.json: name → [lib, key, type, tier, approved]. Импорт всегда:
//      figma.importComponentByKeyAsync(key)
//    Для type === 's' key — variant-key default'а (контракт genIndex);
//    другие варианты — через instance.setProperties({ <axis>: '<value>' }).
var meshokDown = await figma.importComponentByKeyAsync('<key-from-index>');

// 3. Создание фрейма с переменными — не px
var frame = figma.createFrame();
frame.name = 'Экран 1а — Ввод телефона';
frame.setBoundVariable('width',  screenWidthVar);
frame.setBoundVariable('height', screenHeightVar);
frame.layoutMode = 'VERTICAL';

// 4. Инстанс компонента + пропы
var meshokInst = meshokDown.createInstance();
meshokInst.setProperties({
  'systemComponent#2273:0': true,
  'buttonsView#1074:0': true,
});
frame.appendChild(meshokInst);

// Ключи системных компонентов:
//   meshok ↓                  4abeebecfc062fda2e2e4cbf46c4b97574d6d5d8 (COMPONENT)
//   meshok ↑                  bdebc04b3e4331a83c8d1d1ede9d78aecfb29a21 (COMPONENT)
//   buttonsView 1.0 ❖ view    f0b4db3dccdfe94ca6ab7431b28165daa9d59fa2 (COMPONENT_SET)
//   toast 1.0                 921ec8e6e488e5f385e46def0c7ed807fe56178d (COMPONENT)
//   notificationToast 1.0     8f61431ccf15499cdaaaf923a75c841a3231419d (COMPONENT_SET)
