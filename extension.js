const vscode = require('vscode')
const path = require('path')
const fs = require('fs')

const xsl = require('./createHtml')


const getSearchPhrase = () => {
	const editor = vscode.window.activeTextEditor
    const selection = editor.selection
    let text = editor.document.getText(selection)

    if (!text) {
        const range = editor.document.getWordRangeAtPosition(selection.active)
        text = editor.document.getText(range)
    }

    return text;
}


/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('Congratulations, your extension "your-mac-dict" is now active!');

	context.subscriptions.push(
		vscode.commands.registerCommand('YourMacDict.start', () => {
			let dictPath = context.globalState.get("dictionary_path")
			
			try {
				fs.accessSync(dictPath, fs.constants.F_OK)
			} catch(e) {
				// Needs to update the dictionary path.
				// HERE! we change to Japanese-English English-Japanese dictionary as default.
				let base = "/System/Library/Assets/com_apple_MobileAsset_DictionaryServices_dictionaryOSX"
				try {
					fs.accessSync(base, fs.constants.F_OK)
				}catch(e){
					console.log("This path is not found. Attach another path.")
					try {
						base = "/System/Library/AssetsV2/com_apple_MobileAsset_DictionaryServices_dictionaryOSX"
						fs.accessSync(base, fs.constants.F_OK)
					}catch(e){
						console.log("This path is not found. Return to main task.")
						console.log(e)
						vscode.window.showInformationMessage(`Sorry, you don't have dictionary on your Mac.`);
						return
					}
				}

				const dire = fs.readdirSync(base, { withFileTypes: true })
				const dictName = dire.filter(dirent => dirent.isDirectory())
					.filter( (item) => {
						const dictionaryName = fs.readdirSync(`${base}/${item.name}/AssetData`)[0]
						return `${item.name}/AssetData/${dictionaryName}`.includes("Sanseido The WISDOM English-Japanese Japanese-English Dictionary")
					})[0].name
				dictPath = `${base}/${dictName}/AssetData/Sanseido The WISDOM English-Japanese Japanese-English Dictionary.dictionary/Contents/Resources/Body.data`
				context.globalState.update("dictionary_path", dictPath)
				
			}

			CatCodingPanel.createOrShow(context.extensionPath, dictPath, getSearchPhrase());
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('YourMacDict.doRefactor', () => {
			if (CatCodingPanel.CurrentPanel) {
				CatCodingPanel.CurrentPanel.doRefactor()
			}
		})
	);

	if (vscode.window.registerWebviewPanelSerializer) {
		// Make sure we register a serializer in activation event
		vscode.window.registerWebviewPanelSerializer("YourMacDict", {
			async deserializeWebviewPanel(webviewPanel, state) {
				console.log(`Got state: ${state}`);
				CatCodingPanel.revive(webviewPanel, context.extensionPath, context.globalState.get("dictionary_path"), "initial");
			}
		});
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('YourMacDict.dict', async () => {

			let base = "/System/Library/Assets/com_apple_MobileAsset_DictionaryServices_dictionaryOSX"
			try {
				fs.accessSync(base, fs.constants.F_OK)
			}catch(e){
				console.log("This path is not found. Attach another path.")
				try {
					base = "/System/Library/AssetsV2/com_apple_MobileAsset_DictionaryServices_dictionaryOSX"
					fs.accessSync(base, fs.constants.F_OK)
				}catch(e){
					console.log("This path is not found. Return to main task.")
					console.log(e)
					vscode.window.showInformationMessage(`Sorry, you don't have dictionary on your Mac.`);
					return
				}
			}
		

			const dire = fs.readdirSync(base, { withFileTypes: true })
			const fileNames = dire.filter(dirent => dirent.isDirectory())
				.map( (item) => {
					const dictionaryName = fs.readdirSync(`${base}/${item.name}/AssetData`)[0]
					return `${item.name}/AssetData/${dictionaryName}`
				})

			const result = await vscode.window.showQuickPick( fileNames.map(item => path.basename(item, ".dictionary")), {
				placeHolder: 'Please selected your dictionary',
			})

			const dictionaryPath = fileNames.filter(item => item.includes(result))[0]
			context.globalState.update("dictionary_path", `${base}/${dictionaryPath}/Contents/Resources/Body.data`)
			vscode.window.showInformationMessage(`Complete your setting!\nYour Mac Dict is ${result}!!`)
		})
	)

}
exports.activate = activate;

function deactivate() {}


/**
 * Manages cat coding webview panels
 */
class CatCodingPanel {
	static CurrentPanel = undefined

	static createOrShow(extensionPath, dictPath, searchWord) {
		const column = vscode.window.activeTextEditor
			? vscode.ViewColumn.Beside
			: undefined

		// If we already have a panel, show it.
		if (CatCodingPanel.CurrentPanel) {
			CatCodingPanel.CurrentPanel._dictPath = dictPath
			CatCodingPanel.CurrentPanel._searchWord = searchWord
			CatCodingPanel.CurrentPanel._update()
			CatCodingPanel.CurrentPanel._panel.reveal(column)
			return;
		}

		// Otherwise, create a new panel.
		const panel = vscode.window.createWebviewPanel(
			'yourMacDict',
			'YourMacDict',
			column || vscode.ViewColumn.One,
			{
				// Enable javascript in the webview
				enableScripts: true,

				// And restrict the webview to only loading content from our extension's `media` directory.
				localResourceRoots: [vscode.Uri.file(path.join(extensionPath, 'media'))]
			}
		);

		CatCodingPanel.CurrentPanel = new CatCodingPanel(panel, extensionPath, dictPath, searchWord)
	}

	static revive(panel, extensionPath, dictPath, searchWord) {
		CatCodingPanel.CurrentPanel = new CatCodingPanel(panel, extensionPath, dictPath, searchWord)
	}

	constructor(panel, extensionPath, dictPath, searchWord) {
		this._panel = panel
		this._extensionPath = extensionPath
		this._disposables = []
		this._searchWord = searchWord
		this._dictPath = dictPath
		

		// Set the webview's initial html content
		this._update()

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programatically
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables)

		// Update the content based on view changes
		this._panel.onDidChangeViewState( e => {
			
			if (this._panel.visible) {
				this._update()
			}
		}, null, this._disposables)

		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage( message => {
			vscode.window.showErrorMessage(message.text)
			switch (message.command) {
				case 'alert':
					vscode.window.showErrorMessage(message.text)
					return
			}
		}, null, this._disposables )
	}

	doRefactor() {
		// Send a message to the webview webview.
		// You can send any JSON serializable data.
		this._panel.webview.postMessage({ command: 'refactor' });
	}

	dispose() {
		CatCodingPanel.CurrentPanel = undefined;

		// Clean up our resources
		this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	_update() {
		const webview = this._panel.webview;

		this._panel.title = "Your Mac Dict"
		this._panel.webview.html = this._getHtml(webview);

		return
	}

	_getHtml(webview) {
		const scriptPathOnDisk = vscode.Uri.file(
			path.join(this._extensionPath, 'media', 'main.js')
		);
		const scriptUri = webview.asWebviewUri(scriptPathOnDisk);
		
		const nonce = getNonce()

		try{
			let html = xsl.pochi( this._dictPath, this._searchWord )

			// WebView とコミュニケーションをとるために <script> を埋め込む
			let idx = html.search(/<\/body>/)
			html = html.slice(0, idx) + `<script nonce="${nonce}" src="${scriptUri}"></script>` + html.slice(idx)
			
			// Attaced Apple like style
			let styles = fs.readFileSync( path.resolve( path.dirname(this._dictPath), "DefaultStyle.css"), "utf8" )
			styles = styles.replace("font-size: 12pt", "font-size: 16pt")
			styles = styles.replace(/color: text/g, "color:whitesmoke")
			styles = styles.replace(/-webkit-link/g, "lightskyblue")
			styles = styles.replace(/-apple-system-secondary-label/g, "grey")
			styles = styles.replace(/-apple-system-tertiary-label/g, "dimgrey")
			styles = styles.replace(/-apple-system-text-background/g, "black")
			idx = html.search(/<\/head>/)
			html = html.slice(0, idx) + `<style nonce=${nonce}>${styles}</style>` + html.slice(idx)

			// To resolve "Content-Security-Policy"
			idx = html.search(/<meta/)
			html = html.slice(0, idx) + `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'">` + html.slice(idx)
			
			return html
		}catch(e){
			console.log(e)
		}
	}
}

// create one-time token
function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

module.exports = {
	activate,
	deactivate
}
