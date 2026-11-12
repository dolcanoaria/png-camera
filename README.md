# 透過PNGカメラ

Pixel 10aのChrome向けの静的Webアプリです。必要な公開ファイルは index.html、style.css、camera.js、library.js の4つです。ビルドやサーバー側の処理は不要です。

## 公開済みのアプリを更新

`png-camera` リポジトリの **Code → ＋ → Upload files** から、ZIPを展開した4ファイルを `main` のルートにアップロードし、**Commit changes** を押します。GitHub Pagesの更新が完了したら、Pixelでこれまでと同じURLを再読み込みします。キャラ画像はGitHubにアップロードせず、Pixelで読み込みます。

## Pixelで作品別の一覧を使う

1. Filesアプリで `Download/キャラ/文豪ストレイドッグス/敦.png` のように、作品ごとのフォルダへ透過PNGを保存します。
2. カメラ画面の下にある **キャラフォルダを読み込む／更新** を押します。ファイル選択画面で **ダウンロード → キャラ** を開き、フォルダを選択します。
3. **作品 → キャラクター → 撮影に使う** の順に選びます。次回から同じ公開URLを通常のChromeタブで開けば、保存済みの一覧を使えます。
4. PNGや作品フォルダを追加したら、**キャラフォルダを読み込む／更新** でもう一度「キャラ」を選びます。同じ作品名・ファイルパスのPNGは上書きします。元フォルダで削除・改名したPNGの保存済みコピーは一覧に残ります。

フォルダを選べない場合は **フォルダを選べない場合** を開き、作品フォルダと同じ名前を入力し、**この作品のPNGを選ぶ** からその作品のPNGをまとめて選びます。更新時も同じ作品名を使います。Androidの選択画面はChromeから特定フォルダに固定できません。

画像と一覧はChromeのIndexedDBに保存します。サイトデータを削除した場合は、元のフォルダから再取り込みしてください。

## GitHub PagesでHTTPS公開

1. ZIPを展開します。GitHubで新しい公開リポジトリを作成します。公開されるのはアプリのファイルです。
2. リポジトリの **Add file → Upload files** で上記4ファイルを同じ階層にアップロードし、mainブランチにコミットします。
3. **Settings → Pages** で **Deploy from a branch → main → /(root)** を選び、**Save** を押します。
4. Pagesの公開完了後、**Enforce HTTPS** を有効にします。Pixel 10aのChromeでPagesに表示された https:// から始まるURLを直接開きます。

[GitHub Pagesの公開設定](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)・[HTTPSの設定](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)

## 撮影

1. 「背面カメラを起動」を押し、カメラを許可します。
2. 「透過PNGを選ぶ」で端末内のPNGを指定します。1本指で移動し、2本指で拡大・縮小、回転できます。
3. 「撮影して保存」でプレビューの構図をJPEGにします。保存先はChromeのダウンロードから確認できます。「写真をもう一度保存」で直前の写真を再保存できます。

カメラ映像とPNGはブラウザ内で合成します。外部送信、GPSの取得、公式画像の同梱はありません。写真はライブ映像の解像度に基づき、長辺を最大1920ピクセルにします。

カメラを許可できない場合は、Chromeのサイト設定とAndroid側のChromeのカメラ権限を確認してください。公開前にPCで試す場合は、4ファイルのあるフォルダをローカルサーバーで配信してlocalhostで開けます。撮影には背面カメラのある端末が必要です。
# png-camera
