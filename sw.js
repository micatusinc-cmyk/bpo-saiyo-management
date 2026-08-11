// BPO採用管理: デスクトップアプリ化(PWAインストール)のための最小サービスワーカー
// キャッシュは行わず、常に最新のネットワーク取得結果を使う（オンライン専用ツールのため）
self.addEventListener("install", function(e){ self.skipWaiting(); });
self.addEventListener("activate", function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", function(e){ /* デフォルトのネットワーク動作をそのまま使用 */ });

// アプリを閉じていても届くプッシュ通知（サーバーから定刻に送信される）
self.addEventListener("push", function(e){
  var payload={title:"BPO採用管理",body:""};
  try{payload=e.data.json();}catch(err){}
  e.waitUntil(self.registration.showNotification(payload.title||"BPO採用管理",{
    body:payload.body||"",
    icon:"/icon.svg"
  }));
});
self.addEventListener("notificationclick", function(e){
  e.notification.close();
  e.waitUntil(clients.matchAll({type:"window"}).then(function(list){
    for(var i=0;i<list.length;i++){if("focus" in list[i])return list[i].focus();}
    if(clients.openWindow)return clients.openWindow("/");
  }));
});
