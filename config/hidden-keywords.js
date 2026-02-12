// config/hidden-keywords.js - 隠しキーワード設定
// Version: 1.0.0
// 作成日: 2026-02-03

/**
 * 隠しキーワードの定義
 * 
 * 各キーワードには以下のプロパティを設定できます:
 * - keyword: 検出するキーワード（大文字小文字、スペースは無視されます）
 * - requiredContext: このキーワードが有効になる条件（ボタンID）
 *   - 'lesson_question': レッスン質問ボタンを押した後のみ有効
 *   - 'sns_consultation': SNS運用相談ボタンを押した後のみ有効
 *   - 'mission_submission': ミッション提出ボタンを押した後のみ有効
 *   - null: どのコンテキストでも有効
 * - response: キーワード検出時に返すメッセージ
 */

const HIDDEN_KEYWORDS = [
  {
    keyword: 'WannaV最高',
    requiredContext: 'lesson_question',  // レッスン質問ボタンを押した後のみ有効
    response: `🎉✨ **隠しキーワード発見！おめでとうございます！** ✨🎉

お世話になっております、わなみです！

「WannaV最高」というキーワードを見つけていただき、ありがとうございます！🎊

📚 **特別なレッスン資料へのアクセス権を付与します：**

🔗 **VTuberスクール 特別資料**
https://docs.google.com/presentation/d/12EtMovdC1h0NWXJgtgTgxIXgDaUv2-uSf0FFWJD1Jqw/edit?usp=sharing

この資料には、通常のレッスンでは公開していない特別な情報が含まれています！
ぜひご活用ください💡

引き続き、VTuber活動を全力でサポートさせていただきます！
どうぞよろしくお願いいたします✨

---
🎁 *隠しキーワード特典*`
  }
  
  // 🎁 新しい隠しキーワードを追加する場合は、ここに追加してください
  // 例:
  // {
  //   keyword: 'ひみつのあいことば',
  //   requiredContext: 'sns_consultation',
  //   response: '🎉 SNS運用の秘密の資料はこちら！\nhttps://...'
  // }
];

module.exports = {
  HIDDEN_KEYWORDS
};
