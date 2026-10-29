# あそびばこ

子どもと遊べる20のゲームとツールを1つにまとめたサイトです。インターネットにつながっていなくても、一度開けば遊べます（PWA）。

## 中身
- `index.html` … トップ（ゲーム一覧・設定）
- `common/` … 全ゲーム共通の見た目（kit.css）、音・保存・ボタンなど（kit.js）、ゲーム一覧（games.js）
- `games/<名前>/index.html` … 各ゲーム（1ファイルで完結）
- `sw.js`, `manifest.webmanifest`, `icon*` … オフライン対応とホーム画面アイコン
- `tools/` … 「あそびばこ 道具と遊び」（`tools/index.html` が入口、一覧は `tools/items.js`。`otona/` は旧URLからの転送だけ）。共通部品は `common/kit.js` を `data-ns="asobibako-otona:"` 付きで読み、保存場所を子ども版と分けています。見た目は `tools/style.css`。
  - `tools/vendor/qrcode.js` … QRコード生成（qrcode-generator, MIT）
  - `tools/vendor/mediapipe/` … 背景削除のAI（MediaPipe Tasks Vision と magic_touch モデル, Apache-2.0）。大きいので、初めて背景削除を使った時にだけ端末に保存されます

## 公開のしかた（GitHub Pages）
1. このフォルダの中身を GitHub のリポジトリに置く
2. Settings → Pages → Branch を `main` / `(root)` にして保存
3. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で開けます

ゲームを直したら `sw.js` の `VERSION` を1つ上げると、遊ぶ側の端末も新しい版に切り替わります。

## データについて
ハイスコア・推し活ノート・ビーズ図案などは、それぞれの端末のブラウザの中だけに保存されます。どこにも送信しません。
