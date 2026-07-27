from pathlib import Path

RELEASE = '2026-07-27-discard-guard-2'
BUILD = '2026.07.27-discard-guard-2'

# Make the build visible before a game starts.
path = Path('src/build.ts')
path.write_text(f"export const BUILD_ID = '{BUILD}';\n")

path = Path('src/App.tsx')
text = path.read_text()
needle = '        <p className="hero-copy">A complete core-rules game against fair-information computer opponents with distinct risk personalities.</p>\n'
replacement = needle + '        <p className="setup-build-id">Build <code>{BUILD_ID}</code></p>\n'
if needle not in text:
    raise RuntimeError('setup build marker not found')
text = text.replace(needle, replacement, 1)
path.write_text(text)

path = Path('src/styles.css')
text = path.read_text()
if '.setup-build-id' not in text:
    text += '\n.setup-build-id { margin: -0.5rem 0 1rem; color: #8f8779; font-size: 0.72rem; }\n.setup-build-id code { color: #d2b36d; }\n'
path.write_text(text)

# Publish the same immutable release directory in both supported Pages modes:
# branch/root Pages and GitHub Actions artifact Pages.
path = Path('.github/workflows/deploy-pages.yml')
text = path.read_text()
old_build = '      - run: npm run build\n\n      # This repository is currently configured to serve Pages from main/root.\n'
new_build = f'''      - run: npm run build\n      - name: Create immutable release path\n        run: |\n          mkdir -p dist/releases/{RELEASE}\n          cp dist/index.html dist/releases/{RELEASE}/index.html\n          cp -R dist/assets dist/releases/{RELEASE}/assets\n\n      # This repository is currently configured to serve Pages from main/root.\n'''
if old_build not in text:
    raise RuntimeError('deploy build marker not found')
text = text.replace(old_build, new_build, 1)
old_publish = '''          rm -rf assets\n          cp -R dist/assets assets\n          cp dist/index.html index.html\n          touch .nojekyll\n'''
new_publish = f'''          rm -rf assets releases/{RELEASE}\n          cp -R dist/assets assets\n          cp dist/index.html index.html\n          mkdir -p releases\n          cp -R dist/releases/{RELEASE} releases/{RELEASE}\n          touch .nojekyll\n'''
if old_publish not in text:
    raise RuntimeError('publish marker not found')
text = text.replace(old_publish, new_publish, 1)
text = text.replace('          git add -A -- index.html assets .nojekyll\n', '          git add -A -- index.html assets releases .nojekyll\n', 1)
path.write_text(text)
