/* おとな版の一覧。トップとオフライン保存の両方がここを見る */
self.OTONA_ITEMS = [
  { id: 'kaimono', name: 'お買い物計算', icon: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.6"/>', kind: 'tool', desc: '割引後の値段、どっちがおトク、ポイント還元、税込・税抜' },
  { id: 'qr', name: 'QRコード作成', icon: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>', kind: 'tool', desc: 'URL・文章・Wi-Fi・連絡先からQRコードを作って保存' },
  { id: 'dance', name: 'ダンス練習', icon: '<circle cx="12" cy="4.5" r="2"/><path d="M12 7v6l-3 7M12 13l3 7M6 9.5l6-1 6-2"/>', kind: 'tool', desc: '動画を左右反転・スロー・区間リピート。自分の姿と並べて確認' },
  { id: 'cutout', name: '背景削除', icon: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.2 8.2 20 20M8.2 15.8 20 4"/>', kind: 'tool', desc: '写真の人や物をタップして切り抜き。ブラシで仕上げ' },
  { id: 'kachikan', name: '価値観ナンバー', icon: '<rect x="2.5" y="6" width="9" height="13" rx="1.5" transform="rotate(-8 7 12.5)"/><rect x="12.5" y="5" width="9" height="13" rx="1.5" transform="rotate(8 17 11.5)"/><path d="M6 11.5h2.5M16 10v4"/>', kind: 'game', who: '2〜10人', desc: '数字は言わずに、お題に沿った言葉で伝えて小さい順に並べる協力ゲーム' },
  { id: 'hitblow', name: 'ヒット＆ブロー', icon: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>', kind: 'game', who: '1〜2人', desc: '隠された数字をヒントから推理。CPUと当て合い対決も' },
];
