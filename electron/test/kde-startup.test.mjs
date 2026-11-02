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

const kdeStart = main.indexOf('function _applyKdeWallpaperBlur(');
const kdeEnd = main.indexOf('// The wallpaper currently', kdeStart);
const injectStart = main.indexOf('function _injectWallpaperFile(');
const injectEnd = main.indexOf('// Re-render the blur layer', injectStart);
assert.ok(kdeStart >= 0 && kdeEnd > kdeStart && injectStart >= 0 && injectEnd > injectStart);
const wallpaperCode = main.slice(kdeStart, kdeEnd) + main.slice(injectStart, injectEnd);

for (const failure of ['no path', 'missing file', 'unreadable file', 'oversized file', 'decode failure', null]) {
    test(`KDE wallpaper ${failure || 'success'} uses the appropriate background`, async () => {
        const calls = [];
        const bwin = {
            setBackgroundColor: color => calls.push(['base', color]),
            webContents: { insertCSS: async css => { calls.push(['css', css]); } },
        };
        vm.runInNewContext(wallpaperCode + '\n_applyKdeWallpaperBlur(bwin);', {
            bwin, console: { warn() {}, log() {} }, _blurWallpaper: '',
            _kdeWallpaperPath: () => failure === 'no path' ? null : '/fixture/wallpaper.png',
            existsSync: () => failure !== 'missing file',
            statSync: () => {
                if (failure === 'unreadable file') throw new Error('EACCES');
                return { size: failure === 'oversized file' ? 61 * 1024 * 1024 : 100 };
            },
            _blurredWallpaperUrl: () => failure === 'decode failure' ? null : 'data:image/png;base64,fixture',
            _injectBlurLayer: target => { assert.equal(target, bwin); calls.push(['blur']); },
        });
        await Promise.resolve();
        if (failure) {
            assert.deepEqual(calls, [
                ['base', '#1c1c1e'],
                ['css', 'html:root { background: var(--adam-bg-color, #1c1c1e) !important; }'],
            ]);
        } else {
            assert.deepEqual(calls, [['blur']], 'valid wallpaper must retain its existing blur path');
        }
    });
}
