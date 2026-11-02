import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the real show callback with Electron and wallpaper I/O replaced by
// spies. Loading main.mjs itself would launch Electron and the engine.
const main = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
const start = main.indexOf('    let shown = false;');
const end = main.indexOf("    win.on('move'", start);
assert.ok(start >= 0 && end > start, 'show callback must be present');
const showCode = main.slice(start, end) + '\nshowWindow(); showWindow();';

for (const wayland of [false, true]) {
    test(`KDE ${wayland ? 'Wayland' : 'X11'} loads its wallpaper once when shown`, () => {
        const calls = [];
        const window = { setOpacity() {}, show() { calls.push('show'); } };
        vm.runInNewContext(showCode, {
            win: window, _startHidden: false, _isHyprland: false,
            _isKde: true, _isWayland: wayland, _desktop: 'kde',
            _acrylicBackend: null, _useSoftBlur: false,
            setInterval: () => 0, clearInterval() {},
            _applyKdeWallpaperBlur: target => {
                assert.equal(target, window);
                calls.push('kde');
            },
            _applyHyprlandWallpaperBlur: () => assert.fail('wrong desktop'),
            _applyPlatformWallpaperBlur: () => assert.fail('wrong desktop'),
            refreshBlurBg: () => assert.fail('must not capture the desktop'),
        });
        assert.deepEqual(calls, ['show', 'kde']);
    });
}
