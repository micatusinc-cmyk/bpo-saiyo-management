// BPO採用管理: デスクトップアプリ化(PWAインストール)のための最小サービスワーカー
// キャッシュは行わず、常に最新のネットワーク取得結果を使う（オンライン専用ツールのため）
self.addEventListener("install", function(e){ self.skipWaiting(); });
self.addEventListener("activate", function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function(e){ /* デフォルトのネットワーク動作をそのまま使用 */ });
