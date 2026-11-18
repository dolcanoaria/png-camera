# Android Chrome 保存先ガイド（v1.5.4）

推奨：`Pictures/PNGCamera/Characters`（キャラクター素材）、`Pictures/PNGCamera/Frames`（フレーム素材）、`Pictures/PNGCamera/Exports`（完成画像）。AndroidのFilesアプリでフォルダを作成してください。

Android版ChromeのWebアプリは任意のPicturesフォルダに無許可で直接書き込めません。従来のダウンロードはChromeの保存先（通常はDownload）へ保存します。新しい「共有・保存先を選ぶ」はAndroidの共有画面を開きます。ファイル管理アプリなどの共有先が保存先指定に対応している場合、Exports等を選べます。保存先の選択・保存成功は共有先アプリに依存します。

読み込みは従来どおりファイル選択を使用します。作品別ライブラリはIndexedDB内のコピーであり、Pictures内の原本と自動同期しません。サイトデータ消去に備えて原本をPicturesに保管してください。

GitHub Pagesへファイルを全てアップロード後、オンラインで一度起動してオフライン動作を確認してください。実機動作は未検証です。

## v1.5.5
共有操作をタップした直後に処理を開始するよう修正しました。共有に失敗した場合は画面上のメッセージでエラーを確認してください。Android Chromeの共有先に保存先選択がない場合、通常ダウンロード後にFilesで移動してください。

## v1.5.7: AndroidからのPNG選択

「ファイルから透過PNGを追加」は、写真ピッカーを避けるためファイル形式のフィルターを外しています。Androidのファイル選択画面から `Pictures/PNGCamera/Characters` に移動してPNGを選んでください。最初に開くフォルダをWebアプリから固定することはできません。PNG以外を選んでも、既存のPNGヘッダー検査で読み込みを拒否します。端末・Androidのバージョンにより表示される選択画面は異なる場合があります。
